import pytest


def test_budget_refuses_an_operation_that_cannot_finish_before_safe_response_deadline(monkeypatch):
    from knowledgellm import request_budget

    now = [100.0]
    monkeypatch.setattr(request_budget.time, "monotonic", lambda: now[0])
    with request_budget.chat_deadline(10):
        request_budget.require_time(7)
        now[0] = 104
        with pytest.raises(TimeoutError):
            request_budget.require_time(7)


def test_nested_chat_deadlines_reset_and_do_not_constrain_ingestion(monkeypatch):
    from knowledgellm import request_budget

    monkeypatch.setattr(request_budget.time, "monotonic", lambda: 100.0)
    request_budget.require_time(180)
    with request_budget.chat_deadline(20):
        with request_budget.chat_deadline(1):
            with pytest.raises(TimeoutError):
                request_budget.require_time(5)
        request_budget.require_time(5)
    request_budget.require_time(180)


def test_almost_expired_lambda_returns_safe_error_before_starting_services(monkeypatch):
    import json
    from knowledgellm import handler

    class Context:
        def get_remaining_time_in_millis(self):
            return 1000

    def forbidden():
        raise AssertionError("must reject before external service creation")

    monkeypatch.setattr(handler, "create_chat_services", forbidden)
    monkeypatch.setattr(handler, "create_answer_cache", lambda: None)
    monkeypatch.setattr(handler, "create_index_versions", lambda: None)
    result = handler.handler({"rawPath": "/chat", "body": json.dumps({"question": "A question"}),
        "requestContext": {"http": {"method": "POST"}, "authorizer": {"jwt": {"claims": {
            "token_use": "access", "sub": "test-subject", "cognito:groups": '["finance"]'}}}}}, Context())
    assert result["statusCode"] == 503
    assert json.loads(result["body"]) == {"error": "assistant_unavailable"}


@pytest.fixture(autouse=True)
def allow_chat_quota(monkeypatch):
    from knowledgellm import handler as handler_module

    class AvailableQuota:
        def consume(self, subject):
            assert subject == "test-subject"

    monkeypatch.setattr(handler_module, "create_chat_quota", lambda: AvailableQuota())
