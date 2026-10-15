import base64
import json
import logging
import os
import time
from collections.abc import Mapping
from functools import lru_cache

from knowledgellm.authz import departments_for_claims
from knowledgellm.chat import Generator, Language, Retriever, validate_question
from knowledgellm.answer_cache import create_answer_cache
from knowledgellm.cached_chat import answer_with_cache
from knowledgellm.chat_quota import QuotaExceeded, create_chat_quota
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


def _chat_payload(event: Mapping[str, object]) -> dict[str, object]:
    body = event.get("body")
    if not isinstance(body, str):
        return {}
    try:
        if event.get("isBase64Encoded") is True:
            body = base64.b64decode(body, validate=True).decode("utf-8")
        payload = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


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
    document_language: Language = "en"
    if method == "GET" and isinstance(path, str) and (path == "/documents" or path.startswith("/documents/")):
        query = event.get("queryStringParameters")
        requested_language = query.get("language", "en") if isinstance(query, dict) else "en"
        if requested_language not in ("en", "zh-TW"):
            return _response(400, {"error": "invalid_language"})
        document_language = "zh-TW" if requested_language == "zh-TW" else "en"
    if path == "/documents" and method == "GET":
        return _response(200, {"documents": [summary_dict(doc) for doc in list_documents(departments, document_language)]})

    if isinstance(path, str) and path.startswith("/documents/") and method == "GET":
        path_parameters = event.get("pathParameters")
        document_id = path_parameters.get("documentId") if isinstance(path_parameters, dict) else None
        if not isinstance(document_id, str):
            return _response(404, {"error": "not_found"})
        bucket = os.environ.get("DOCUMENTS_BUCKET")
        if not bucket:
            return _response(503, {"error": "storage_unavailable"})
        try:
            link = open_document(document_id, departments, S3DocumentStorage(bucket), document_language)
        except AuthorizationError:
            return _response(404, {"error": "not_found"})
        except Exception:
            return _response(503, {"error": "storage_unavailable"})
        return _response(200, {"document": {"id": link.id, "title": link.title, "url": link.url,
                                            **({"content": link.content} if link.content is not None else {})}})

    if path == "/chat" and method == "POST":
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            return _response(401, {"error": "unauthenticated"})
        request_id = getattr(context, "aws_request_id", None)
        if not isinstance(request_id, str):
            request_id = request_context.get("requestId")
        request_id = request_id if isinstance(request_id, str) else "unknown"
        department = ",".join(sorted(departments))
        payload = _chat_payload(event)
        requested_language = payload.get("language", "en")
        if requested_language not in ("en", "zh-TW"):
            return _response(400, {"error": "invalid_language"})
        language: Language = "zh-TW" if requested_language == "zh-TW" else "en"
        question = payload.get("question")
        if not isinstance(question, str):
            _log_chat_telemetry(
                request_id, department, started_at, status="invalid_question", guardrail_action="invalid_question"
            )
            return _response(400, {"error": "invalid_question", **({"message": "請輸入有效的問題。"} if language == "zh-TW" else {})})
        try:
            guardrails = BasicGuardrails()
            result = validate_question(question, departments, guardrails, language)
            if result is None:
                remaining = getattr(context, "get_remaining_time_in_millis", None)
                seconds = remaining() / 1000 - 2 if callable(remaining) else 25
                with chat_deadline(seconds):
                    try:
                        create_chat_quota().consume(subject)
                    except QuotaExceeded as error:
                        response = _response(429, {"error": "rate_limited"})
                        response["headers"]["retry-after"] = str(error.retry_after)
                        return response
                    except Exception:
                        logger.warning("chat_quota_unavailable")
                        return _response(503, {"error": "rate_limit_unavailable"})
                    try:
                        cache = create_answer_cache()
                    except Exception:
                        logger.info("answer_cache_unavailable operation=initialize")
                        cache = None
                    result = answer_with_cache(question, departments, create_chat_services,
                                               guardrails, cache, create_index_versions(), language)
        except Exception:
            _log_chat_telemetry(
                request_id, department, started_at, status="assistant_unavailable", guardrail_action="error"
            )
            return _response(503, {"error": "assistant_unavailable", **({"message": "助理暫時無法使用，請稍後再試。"} if language == "zh-TW" else {})})
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
                    {"document_id": citation.document_id, "title": citation.title,
                     **({"excerpt": citation.excerpt} if citation.excerpt else {})}
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
