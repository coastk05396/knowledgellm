import base64
import json
import os
from collections.abc import Mapping

from knowledgellm.authz import departments_for_claims
from knowledgellm.chat import Generator, Retriever, answer_question
from knowledgellm.documents import (
    AuthorizationError,
    S3DocumentStorage,
    list_documents,
    open_document,
    summary_dict,
)
from knowledgellm.guardrails import BasicGuardrails


def _response(status: int, body: Mapping[str, object]) -> dict[str, object]:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body),
    }


def create_chat_services() -> tuple[Retriever, Generator]:
    from knowledgellm.providers import create_chat_services as create_services

    return create_services()


def _question_from_event(event: Mapping[str, object]) -> str | None:
    body = event.get("body")
    if not isinstance(body, str):
        return None
    try:
        if event.get("isBase64Encoded") is True:
            body = base64.b64decode(body, validate=True).decode("utf-8")
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return None
    question = payload.get("question") if isinstance(payload, dict) else None
    return question if isinstance(question, str) else None


def handler(event: dict[str, object], context: object) -> dict[str, object]:
    del context
    request_context = event.get("requestContext")
    path = event.get("rawPath")
    method_context = request_context.get("http") if isinstance(request_context, dict) else None
    method = method_context.get("method") if isinstance(method_context, dict) else None
    if path == "/health" and method == "GET":
        return _response(200, {"status": "ok"})
    if not isinstance(request_context, dict):
        return _response(401, {"error": "unauthenticated"})

    authorizer = request_context.get("authorizer")
    jwt = authorizer.get("jwt") if isinstance(authorizer, dict) else None
    claims = jwt.get("claims") if isinstance(jwt, dict) else None
    if not isinstance(claims, dict) or not all(isinstance(key, str) for key in claims):
        return _response(401, {"error": "unauthenticated"})

    departments = departments_for_claims(claims)
    if path == "/documents" and method == "GET":
        return _response(200, {"documents": [summary_dict(doc) for doc in list_documents(departments)]})

    if isinstance(path, str) and path.startswith("/documents/") and method == "GET":
        path_parameters = event.get("pathParameters")
        document_id = path_parameters.get("documentId") if isinstance(path_parameters, dict) else None
        if not isinstance(document_id, str):
            return _response(404, {"error": "not_found"})
        bucket = os.environ.get("DOCUMENTS_BUCKET")
        if not bucket:
            return _response(503, {"error": "storage_unavailable"})
        try:
            link = open_document(document_id, departments, S3DocumentStorage(bucket))
        except AuthorizationError:
            return _response(404, {"error": "not_found"})
        except Exception:
            return _response(503, {"error": "storage_unavailable"})
        return _response(200, {"document": {"id": link.id, "title": link.title, "url": link.url}})

    if path == "/chat" and method == "POST":
        question = _question_from_event(event)
        if question is None:
            return _response(400, {"error": "invalid_question"})
        try:
            retriever, generator = create_chat_services()
            result = answer_question(question, departments, retriever, generator, BasicGuardrails())
        except Exception:
            return _response(503, {"error": "assistant_unavailable"})
        usage = None
        cost = None
        if result.usage is not None:
            usage = {"input_tokens": result.usage.input_tokens, "output_tokens": result.usage.output_tokens}
            cost = result.usage.cost_usd
        return _response(
            200,
            {
                "answer": result.answer,
                "citations": [
                    {"document_id": citation.document_id, "title": citation.title}
                    for citation in result.citations
                ],
                "usage": usage,
                "cost_usd": cost,
            },
        )

    return _response(404, {"error": "not_found"})
