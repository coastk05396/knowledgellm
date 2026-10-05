import json

from knowledgellm import handler


def test_documents_route_uses_authorizer_claims_and_ignores_requested_department() -> None:
    event = {
        "rawPath": "/documents",
        "queryStringParameters": {"department": "people"},
        "requestContext": {
            "http": {"method": "GET"},
            "authorizer": {"jwt": {"claims": {"cognito:groups": '["finance"]'}}},
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
