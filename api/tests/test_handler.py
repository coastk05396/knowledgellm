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
    def generate(self, question, chunks):
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
    assert body["citations"] == [{"document_id": "finance-q4-budget-overview", "title": "Q4 budget overview"}]
    assert body["cost_usd"] == 0.0005


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
        def generate(self, _question, _chunks):
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
