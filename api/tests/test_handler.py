import json
import base64
from dataclasses import dataclass

import pytest

from knowledgellm.chat import RetrievedChunk, Usage
from knowledgellm import handler


def test_documents_route_uses_authorizer_claims_and_ignores_requested_department() -> None:
    event = {
        "rawPath": "/documents",
        "queryStringParameters": {"department": "people"},
        "requestContext": {
            "http": {"method": "GET"},
            "authorizer": {"jwt": {"claims": {"token_use": "access", "cognito:groups": '["finance"]'}}},
        },
    }

    response = handler.handler(event, object())

    assert response["statusCode"] == 200
    documents = json.loads(response["body"])['documents']
    assert {document["department"] for document in documents} == {"finance"}


def test_missing_claims_fail_closed() -> None:
    response = handler.handler(
        {"rawPath": "/documents", "requestContext": {"http": {"method": "GET"}}}, object()
    )

    assert response["statusCode"] == 401
    assert json.loads(response["body"]) == {"error": "unauthenticated"}


def test_health_route_is_public_and_contains_no_identity_data() -> None:
    response = handler.handler(
        {"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}, object()
    )

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"status": "ok"}


@dataclass
class FakeRetriever:
    def search(self, question: str, departments: frozenset[str]) -> list[RetrievedChunk]:
        assert question == "What changed in budget?"
        assert departments == frozenset({"finance"})
        return [RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", "Costs changed.")]


@dataclass
class FakeGenerator:
    def generate(self, question, chunks, language="en"):
        return "Vendor costs changed.", ["finance-q4-budget-overview"], Usage(30, 10, 0.0005)


def test_chat_route_uses_authorizer_group_and_returns_validated_citation(monkeypatch) -> None:
    monkeypatch.setattr(handler, "create_chat_services", lambda: (FakeRetriever(), FakeGenerator()))
    event = {
        "rawPath": "/chat",
        "body": base64.b64encode(b'{"question":"What changed in budget?","department":"people"}').decode(),
        "isBase64Encoded": True,
        "requestContext": {
            "http": {"method": "POST"},
            "authorizer": {"jwt": {"claims": {"token_use": "access", "cognito:groups": '["finance"]'}}},
        },
    }

    response = handler.handler(event, object())

    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["answer"] == "Vendor costs changed."
    assert body["citations"] == [
        {"document_id": "finance-q4-budget-overview", "title": "Q4 budget overview", "excerpt": "Costs changed."}
    ]
    assert body["cost_usd"] == 0.0005


def test_chat_logs_safe_usage_and_guardrail_metadata(monkeypatch, caplog) -> None:
    caplog.set_level("INFO", logger=handler.__name__)
    monkeypatch.setattr(handler, "create_chat_services", lambda: (FakeRetriever(), FakeGenerator()))
    event = {
        "rawPath": "/chat",
        "body": '{"question":"What changed in budget?"}',
        "requestContext": {
            "http": {"method": "POST"},
            "authorizer": {"jwt": {"claims": {"token_use": "access", "cognito:groups": '["finance"]'}}},
        },
    }

    response = handler.handler(event, object())

    assert response["statusCode"] == 200
    record = next(record.message for record in caplog.records if '"event":"chat_telemetry"' in record.message)
    assert '"department":"finance"' in record
    assert '"input_tokens":30' in record
    assert '"output_tokens":10' in record
    assert '"estimated_cost_usd":0.0005' in record
    assert '"guardrail_action":"pass"' in record
    assert "What changed in budget?" not in record
    assert "Vendor costs changed." not in record


def test_chat_logs_pii_guardrail_without_logging_question(monkeypatch, caplog) -> None:
    caplog.set_level("INFO", logger=handler.__name__)
    monkeypatch.setattr(handler, "create_chat_services", lambda: (FakeRetriever(), FakeGenerator()))
    event = {
        "rawPath": "/chat",
        "body": '{"question":"Contact alex@example.test"}',
        "requestContext": {
            "http": {"method": "POST"},
            "authorizer": {"jwt": {"claims": {"token_use": "access", "cognito:groups": '["finance"]'}}},
        },
    }

    response = handler.handler(event, object())

    assert response["statusCode"] == 200
    record = next(record.message for record in caplog.records if '"event":"chat_telemetry"' in record.message)
    assert '"guardrail_action":"question_pii_blocked"' in record
    assert "alex@example.test" not in record


def test_provider_error_does_not_echo_question_or_error(monkeypatch) -> None:
    def broken_services():
        raise RuntimeError("private prompt alex@example.test")

    monkeypatch.setattr(handler, "create_chat_services", broken_services)
    event = {
        "rawPath": "/chat",
        "body": '{"question":"private question"}',
        "requestContext": {
            "http": {"method": "POST"},
            "authorizer": {"jwt": {"claims": {"token_use": "access", "cognito:groups": '["finance"]'}}},
        },
    }

    response = handler.handler(event, object())

    assert response["statusCode"] == 503
    assert "private" not in response["body"]
    assert "example.test" not in response["body"]


def test_provider_timeout_returns_safe_retryable_error(monkeypatch) -> None:
    class SlowGenerator:
        def generate(self, _question, _chunks, language="en"):
            raise TimeoutError("upstream timeout with private request content")

    monkeypatch.setattr(handler, "create_chat_services", lambda: (FakeRetriever(), SlowGenerator()))
    event = {
        "rawPath": "/chat",
        "body": '{"question":"What changed in budget?"}',
        "requestContext": {
            "http": {"method": "POST"},
            "authorizer": {"jwt": {"claims": {"token_use": "access", "cognito:groups": '["finance"]'}}},
        },
    }

    response = handler.handler(event, object())

    assert response["statusCode"] == 503
    assert json.loads(response["body"]) == {"error": "assistant_unavailable"}
    assert "private request" not in response["body"]


@pytest.mark.parametrize("token_use", ["id", None])
def test_non_access_token_claims_cannot_authorize_protected_routes(token_use) -> None:
    claims = {"cognito:groups": '["finance"]'}
    if token_use is not None:
        claims["token_use"] = token_use
    response = handler.handler(
        {
            "rawPath": "/documents",
            "requestContext": {
                "http": {"method": "GET"},
                "authorizer": {
                    "jwt": {
                        "claims": claims
                    }
                },
            },
        },
        object(),
    )

    assert response["statusCode"] == 401
    assert json.loads(response["body"]) == {"error": "unauthenticated"}


@pytest.mark.parametrize("language", ["zh-CN", "fr", None, 1, []])
def test_chat_rejects_unsupported_language_before_providers(monkeypatch, language) -> None:
    def unexpected():
        pytest.fail("invalid language must be rejected before creating providers")
    monkeypatch.setattr(handler, "create_chat_services", unexpected)
    response = handler.handler({
        "rawPath": "/chat", "body": json.dumps({"question": "What changed?", "language": language}),
        "requestContext": {"http": {"method": "POST"}, "authorizer": {"jwt": {"claims": {
            "token_use": "access", "cognito:groups": '["finance"]'
        }}}}
    }, object())
    assert response["statusCode"] == 400
    assert json.loads(response["body"]) == {"error": "invalid_language"}


def test_traditional_chinese_provider_failure_has_safe_localized_message(monkeypatch) -> None:
    def broken():
        raise RuntimeError("private provider data")
    monkeypatch.setattr(handler, "create_chat_services", broken)
    response = handler.handler({
        "rawPath": "/chat", "body": json.dumps({"question": "預算是多少？", "language": "zh-TW"}),
        "requestContext": {"http": {"method": "POST"}, "authorizer": {"jwt": {"claims": {
            "token_use": "access", "cognito:groups": '["finance"]'
        }}}}
    }, object())
    assert response["statusCode"] == 503
    assert json.loads(response["body"]) == {"error": "assistant_unavailable", "message": "助理暫時無法使用，請稍後再試。"}


@pytest.mark.parametrize("path", ["/documents", "/documents/finance-expense-policy"])
@pytest.mark.parametrize("language", ["zh-CN", "fr", ""])
def test_document_routes_reject_invalid_language_before_storage(path, language):
    response = handler.handler({"rawPath": path, "queryStringParameters": {"language": language},
        "requestContext": {"http": {"method": "GET"}, "authorizer": {"jwt": {"claims": {
            "token_use": "access", "cognito:groups": '["finance"]'
        }}}}}, object())
    assert response["statusCode"] == 400
    assert json.loads(response["body"]) == {"error": "invalid_language"}


def test_chinese_document_list_and_link_keep_department_acl(monkeypatch):
    calls = []
    class Storage:
        def __init__(self, bucket):
            assert bucket == "same-bucket"
        def presigned_get_url(self, key, expires_in):
            calls.append((key, expires_in))
            return "https://private-source.example/signed"
        def read_document(self, key, version_id=None):
            return "# 費用報銷政策\n"
    monkeypatch.setenv("DOCUMENTS_BUCKET", "same-bucket")
    monkeypatch.setattr(handler, "S3DocumentStorage", Storage)
    event = {"rawPath": "/documents", "queryStringParameters": {"language": "zh-TW"},
        "requestContext": {"http": {"method": "GET"}, "authorizer": {"jwt": {"claims": {
            "token_use": "access", "cognito:groups": '["finance"]'
        }}}}}
    response = handler.handler(event, object())
    documents = json.loads(response["body"])["documents"]
    assert [d["title"] for d in documents] == ["第四季預算概覽", "費用報銷政策"]
    assert all(d["department"] == "finance" for d in documents)
    event["rawPath"] = "/documents/finance-expense-policy"
    event["pathParameters"] = {"documentId": "finance-expense-policy"}
    response = handler.handler(event, object())
    assert response["statusCode"] == 200
    assert json.loads(response["body"])["document"]["title"] == "費用報銷政策"
    assert calls == [("finance/expense-policy-ch.md", 120)]
    event["rawPath"] = "/documents/people-leave-policy"
    event["pathParameters"] = {"documentId": "people-leave-policy"}
    assert handler.handler(event, object())["statusCode"] == 404
    assert len(calls) == 1


def _document_event(document_id: str, groups: str) -> dict[str, object]:
    return {"rawPath": f"/documents/{document_id}", "pathParameters": {"documentId": document_id},
        "requestContext": {"http": {"method": "GET"}, "authorizer": {"jwt": {"claims": {
            "token_use": "access", "cognito:groups": groups
        }}}}}


class ContentStorage:
    reads: list[str] = []

    def __init__(self, bucket):
        pass

    def presigned_get_url(self, key, expires_in):
        return "https://private-source.example/signed"

    def read_document(self, key, version_id=None):
        ContentStorage.reads.append(key)
        return "# Expense policy\n\nReceipts are required above $25.\n"


def test_document_route_returns_content_to_authorized_caller(monkeypatch):
    monkeypatch.setenv("DOCUMENTS_BUCKET", "same-bucket")
    monkeypatch.setattr(handler, "S3DocumentStorage", ContentStorage)

    response = handler.handler(_document_event("finance-expense-policy", '["finance"]'), object())

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"document": {
        "id": "finance-expense-policy", "title": "Expense policy",
        "url": "https://private-source.example/signed",
        "content": "# Expense policy\n\nReceipts are required above $25.\n",
    }}


def test_document_route_gives_forbidden_and_unknown_documents_the_same_contentless_response(monkeypatch):
    monkeypatch.setenv("DOCUMENTS_BUCKET", "same-bucket")
    monkeypatch.setattr(handler, "S3DocumentStorage", ContentStorage)
    ContentStorage.reads.clear()

    forbidden = handler.handler(_document_event("finance-expense-policy", '["people"]'), object())
    unknown = handler.handler(_document_event("no-such-document", '["people"]'), object())

    assert forbidden == unknown
    assert forbidden["statusCode"] == 404
    assert json.loads(forbidden["body"]) == {"error": "not_found"}
    assert ContentStorage.reads == []


def test_document_route_still_opens_the_link_when_content_read_fails(monkeypatch, caplog):
    class UnreadableStorage(ContentStorage):
        def read_document(self, key, version_id=None):
            raise ValueError("private storage detail")
    caplog.set_level("INFO")
    monkeypatch.setenv("DOCUMENTS_BUCKET", "same-bucket")
    monkeypatch.setattr(handler, "S3DocumentStorage", UnreadableStorage)

    response = handler.handler(_document_event("finance-expense-policy", '["finance"]'), object())

    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"document": {
        "id": "finance-expense-policy", "title": "Expense policy", "url": "https://private-source.example/signed",
    }}
    assert "private storage detail" not in caplog.text


def test_document_route_is_unavailable_only_when_the_link_cannot_be_produced(monkeypatch):
    class UnlinkableStorage(ContentStorage):
        def presigned_get_url(self, key, expires_in):
            raise RuntimeError("private storage detail")
    monkeypatch.setenv("DOCUMENTS_BUCKET", "same-bucket")
    monkeypatch.setattr(handler, "S3DocumentStorage", UnlinkableStorage)

    response = handler.handler(_document_event("finance-expense-policy", '["finance"]'), object())

    assert response["statusCode"] == 503
    assert json.loads(response["body"]) == {"error": "storage_unavailable"}


def test_document_route_makes_no_storage_call_for_forbidden_or_unknown_ids(monkeypatch):
    class ForbiddenStorage:
        def __init__(self, bucket):
            pass
        def __getattr__(self, name):
            raise AssertionError(f"storage.{name} must not be used")
    monkeypatch.setenv("DOCUMENTS_BUCKET", "same-bucket")
    monkeypatch.setattr(handler, "S3DocumentStorage", ForbiddenStorage)

    forbidden = handler.handler(_document_event("finance-expense-policy", '["people"]'), object())
    unknown = handler.handler(_document_event("no-such-document", '["people"]'), object())

    assert forbidden == unknown
    assert (forbidden["statusCode"], json.loads(forbidden["body"])) == (404, {"error": "not_found"})


def test_chat_route_returns_excerpt_only_when_one_is_available(monkeypatch):
    class Retriever:
        def __init__(self, text):
            self.text = text
        def search(self, question, departments):
            return [RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", self.text)]
    event = {"rawPath": "/chat", "body": '{"question":"What changed in budget?"}',
        "requestContext": {"http": {"method": "POST"}, "authorizer": {"jwt": {"claims": {
            "token_use": "access", "cognito:groups": '["finance"]'
        }}}}}

    monkeypatch.setattr(handler, "create_chat_services", lambda: (Retriever("\n  Costs changed.  \n"), FakeGenerator()))
    plain = json.loads(handler.handler(event, object())["body"])
    monkeypatch.setattr(handler, "create_chat_services", lambda: (Retriever("Ask cfo@example.test."), FakeGenerator()))
    redacted = json.loads(handler.handler(event, object())["body"])

    assert plain["citations"] == [
        {"document_id": "finance-q4-budget-overview", "title": "Q4 budget overview", "excerpt": "Costs changed."}
    ]
    assert redacted["citations"] == [{"document_id": "finance-q4-budget-overview", "title": "Q4 budget overview"}]
