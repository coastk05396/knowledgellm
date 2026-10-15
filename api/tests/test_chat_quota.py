import hashlib
import json

import boto3
import pytest
from botocore.stub import Stubber

from knowledgellm import handler
from knowledgellm.chat_quota import DynamoChatQuota, QuotaExceeded, create_chat_quota


def client():
    return boto3.client("dynamodb", region_name="us-east-1", aws_access_key_id="test", aws_secret_access_key="test")


def params(subject="trusted-sub", now=61):
    return {
        "TableName": "quota", "Key": {"pk": {"S": f"chat#{hashlib.sha256(subject.encode()).hexdigest()}#{now // 60}"}},
        "UpdateExpression": "SET expires_at = :expiry ADD #count :one",
        "ConditionExpression": "attribute_not_exists(#count) OR #count < :limit",
        "ExpressionAttributeNames": {"#count": "request_count"},
        "ExpressionAttributeValues": {":expiry": {"N": str((now // 60 + 1) * 60)}, ":one": {"N": "1"}, ":limit": {"N": "10"}},
    }


def test_atomic_counter_uses_hashed_identity_and_window_and_ttl():
    db = client()
    now = [119.9]
    with Stubber(db) as stub:
        for subject, timestamp in [("trusted-sub", 119), ("other", 119), ("trusted-sub", 120)]:
            stub.add_response("update_item", {}, params(subject, timestamp))
        quota = DynamoChatQuota("quota", db, clock=lambda: now[0])
        quota.consume("trusted-sub")
        quota.consume("other")
        now[0] = 120
        quota.consume("trusted-sub")
        stub.assert_no_pending_responses()


def test_condition_failure_reports_seconds_until_next_window():
    db = client()
    with Stubber(db) as stub:
        stub.add_client_error("update_item", "ConditionalCheckFailedException", expected_params=params())
        with pytest.raises(QuotaExceeded) as error:
            DynamoChatQuota("quota", db, clock=lambda: 61.9).consume("trusted-sub")
        assert error.value.retry_after == 59


def test_missing_configuration_fails_closed(monkeypatch):
    monkeypatch.delenv("CHAT_QUOTA_TABLE", raising=False)
    create_chat_quota.cache_clear()
    with pytest.raises(RuntimeError):
        create_chat_quota()


def event(subject="trusted-sub"):
    return {"rawPath": "/chat", "body": json.dumps({"question": "What changed in budget?"}),
            "requestContext": {"http": {"method": "POST"}, "authorizer": {"jwt": {"claims": {
                "token_use": "access", "sub": subject, "cognito:groups": '["finance"]'}}}}}


@pytest.mark.parametrize("failure,status,error", [(QuotaExceeded(29), 429, "rate_limited"), (RuntimeError("sensitive details"), 503, "rate_limit_unavailable")])
def test_blocked_quota_never_initializes_cache_index_or_services(monkeypatch, failure, status, error):
    class Quota:
        def consume(self, subject):
            assert subject == "trusted-sub"
            raise failure

    def forbidden():
        pytest.fail("blocked request reached external chat services")

    monkeypatch.setattr(handler, "create_chat_quota", lambda: Quota())
    for name in ("create_chat_services", "create_answer_cache", "create_index_versions"):
        monkeypatch.setattr(handler, name, forbidden)
    response = handler.handler(event(), object())
    assert response["statusCode"] == status
    assert json.loads(response["body"]) == {"error": error}
    if status == 429:
        assert response["headers"]["retry-after"] == "29"


@pytest.mark.parametrize("subject", [None, "", 123])
def test_chat_requires_trusted_subject_before_quota(monkeypatch, subject):
    monkeypatch.setattr(handler, "create_chat_quota", lambda: pytest.fail("no identity"))
    response = handler.handler(event(subject), object())
    assert response["statusCode"] == 401


@pytest.mark.parametrize("code", ["ProvisionedThroughputExceededException", "InternalServerError", "AccessDeniedException"])
def test_store_errors_propagate_to_fail_closed_handler(code):
    db = client()
    with Stubber(db) as stub:
        stub.add_client_error("update_item", code, expected_params=params())
        with pytest.raises(Exception) as error:
            DynamoChatQuota("quota", db, clock=lambda: 61).consume("trusted-sub")
        assert not isinstance(error.value, QuotaExceeded)


def test_quota_refuses_network_operation_when_lambda_budget_is_exhausted():
    from knowledgellm.request_budget import chat_deadline

    db = client()
    with Stubber(db), chat_deadline(0):
        with pytest.raises(TimeoutError):
            DynamoChatQuota("quota", db).consume("trusted-sub")


def test_handler_missing_quota_config_fails_closed_before_services(monkeypatch):
    monkeypatch.delenv("CHAT_QUOTA_TABLE", raising=False)
    create_chat_quota.cache_clear()
    monkeypatch.setattr(handler, "create_chat_services", lambda: pytest.fail("missing quota config"))
    response = handler.handler(event(), object())
    assert response["statusCode"] == 503
    assert json.loads(response["body"]) == {"error": "rate_limit_unavailable"}


@pytest.mark.parametrize("question", [None, "", "x" * 4001, "Contact alex@example.test"])
def test_invalid_or_guardrail_blocked_questions_do_not_consume_quota(monkeypatch, question):
    monkeypatch.setattr(handler, "create_chat_quota", lambda: pytest.fail("blocked question consumed quota"))
    request = event()
    request["body"] = json.dumps({"question": question})
    response = handler.handler(request, object())
    assert response["statusCode"] in (200, 400)


def test_valid_requests_consume_quota_before_cache_even_when_cache_returns_answer(monkeypatch):
    from knowledgellm.chat import ChatAnswer

    operations = []

    class Quota:
        def consume(self, subject):
            operations.append("quota")

    def cache():
        operations.append("cache")
        return None

    monkeypatch.setattr(handler, "create_chat_quota", lambda: Quota())
    monkeypatch.setattr(handler, "create_answer_cache", cache)
    monkeypatch.setattr(handler, "create_index_versions", lambda: None)
    monkeypatch.setattr(handler, "answer_with_cache", lambda *args: ChatAnswer("Cached answer", ()))
    assert handler.handler(event(), object())["statusCode"] == 200
    assert handler.handler(event(), object())["statusCode"] == 200
    assert operations == ["quota", "cache", "quota", "cache"]
