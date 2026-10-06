import base64
import json
import logging
import os
import time
from collections.abc import Mapping
from functools import lru_cache

from knowledgellm.authz import departments_for_claims
from knowledgellm.chat import Generator, Retriever, validate_question
from knowledgellm.answer_cache import create_answer_cache
from knowledgellm.cached_chat import answer_with_cache
from knowledgellm.index_versions import S3IndexVersions
from knowledgellm.request_budget import chat_deadline
from knowledgellm.documents import (
    AuthorizationError,
    S3DocumentStorage,
    list_documents,
    open_document,
    summary_dict,
)
from knowledgellm.guardrails import BasicGuardrails

logger = logging.getLogger(__name__)


def _response(status: int, body: Mapping[str, object]) -> dict[str, object]:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body),
    }


def create_chat_services() -> tuple[Retriever, Generator]:
    from knowledgellm.providers import create_chat_services as create_services

    return create_services()


@lru_cache(maxsize=1)
def create_index_versions() -> S3IndexVersions | None:
    bucket = os.getenv("DOCUMENTS_BUCKET")
    return S3IndexVersions(bucket) if bucket else None


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
    started_at = time.perf_counter()
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
    if (
        not isinstance(claims, dict)
        or not all(isinstance(key, str) for key in claims)
        or claims.get("token_use") != "access"
    ):
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
        request_id = getattr(context, "aws_request_id", None)
        if not isinstance(request_id, str):
            request_id = request_context.get("requestId")
        request_id = request_id if isinstance(request_id, str) else "unknown"
        department = ",".join(sorted(departments))
        question = _question_from_event(event)
        if question is None:
            _log_chat_telemetry(
                request_id, department, started_at, status="invalid_question", guardrail_action="invalid_question"
            )
            return _response(400, {"error": "invalid_question"})
        try:
            guardrails = BasicGuardrails()
            result = validate_question(question, departments, guardrails)
            if result is None:
                remaining = getattr(context, "get_remaining_time_in_millis", None)
                seconds = remaining() / 1000 - 2 if callable(remaining) else 25
                with chat_deadline(seconds):
                    try:
                        cache = create_answer_cache()
                    except Exception:
                        logger.info("answer_cache_unavailable operation=initialize")
                        cache = None
                    result = answer_with_cache(question, departments, create_chat_services,
                                               guardrails, cache, create_index_versions())
        except Exception:
            _log_chat_telemetry(
                request_id, department, started_at, status="assistant_unavailable", guardrail_action="error"
            )
            return _response(503, {"error": "assistant_unavailable"})
        usage = None
        cost = None
        if result.usage is not None:
            usage = {"input_tokens": result.usage.input_tokens, "output_tokens": result.usage.output_tokens}
            cost = result.usage.cost_usd
        _log_chat_telemetry(
            request_id,
            department,
            started_at,
            status="ok",
            guardrail_action=result.guardrail_action,
            retrieved_count=result.retrieved_count,
            redacted_source_count=result.redacted_source_count,
            input_tokens=result.usage.input_tokens if result.usage else 0,
            output_tokens=result.usage.output_tokens if result.usage else 0,
            estimated_cost_usd=result.usage.cost_usd if result.usage else None,
            model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
            cache_status=result.cache_status,
            stage_timings_ms=result.stage_timings_ms,
        )
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
                "guardrail_action": result.guardrail_action,
                "cache_status": result.cache_status,
            },
        )

    return _response(404, {"error": "not_found"})


def _log_chat_telemetry(
    request_id: str,
    department: str,
    started_at: float,
    *,
    status: str,
    guardrail_action: str,
    retrieved_count: int = 0,
    redacted_source_count: int = 0,
    input_tokens: int = 0,
    output_tokens: int = 0,
    estimated_cost_usd: float | None = None,
    model: str | None = None,
    cache_status: str = "bypass",
    stage_timings_ms: Mapping[str, float] | None = None,
) -> None:
    logger.info(
        json.dumps(
            {
                "event": "chat_telemetry",
                "request_id": request_id,
                "department": department,
                "status": status,
                "guardrail_action": guardrail_action,
                "retrieved_count": retrieved_count,
                "redacted_source_count": redacted_source_count,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "estimated_cost_usd": estimated_cost_usd,
                "model": model,
                "cache_status": cache_status,
                "stage_timings_ms": dict(stage_timings_ms or {}),
                "latency_ms": round((time.perf_counter() - started_at) * 1000),
            },
            separators=(",", ":"),
        )
    )
