"""Authorize, verify immutable sources, then cache or generate an answer."""
import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import replace
from typing import Literal, Protocol, cast

from knowledgellm.answer_cache import AnswerCache, cache_key, demo_question_id
from knowledgellm.authz import ALLOWED_DEPARTMENTS
from knowledgellm.chat import (ChatAnswer, Citation, Generator, NO_SOURCES, RetrievedChunk, Retriever, Usage, VersionedRetriever,
                             answer_question, validate_question)
from knowledgellm.documents import list_documents
from knowledgellm.guardrails import Guardrails
from knowledgellm.index_versions import IndexSnapshot, IndexUnavailable
from knowledgellm.request_budget import require_time

logger = logging.getLogger(__name__)


class IndexVersions(Protocol):
    def current(self, departments: frozenset[str]) -> IndexSnapshot: ...
    def is_current(self, snapshot: IndexSnapshot, departments: frozenset[str]) -> bool: ...


def safe_cached_answer(answer: ChatAnswer, departments: frozenset[str], guardrails: Guardrails) -> bool:
    allowed = {document.id for document in list_documents(departments)}
    return bool(
        answer.answer.strip() and len(answer.answer) <= 6000 and answer.answer != NO_SOURCES
        and answer.citations and answer.guardrail_action in {"pass", "source_pii_redacted"}
        and all(citation.document_id in allowed for citation in answer.citations)
        and not guardrails.contains_pii(answer.answer) and guardrails.redact(answer.answer) == answer.answer
    )


def answer_with_cache(
    question: str,
    departments: frozenset[str],
    services: Callable[[], tuple[Retriever, Generator]],
    guardrails: Guardrails,
    cache: AnswerCache | None,
    versions: IndexVersions | None,
) -> ChatAnswer:
    refusal = validate_question(question, departments, guardrails)
    if refusal is not None:
        return refusal
    require_time(1)
    authorized = departments & ALLOWED_DEPARTMENTS
    timings: dict[str, float] = {}
    start = time.perf_counter()
    snapshot = versions.current(authorized) if versions is not None else None
    timings["index_check"] = round((time.perf_counter() - start) * 1000, 3)
    question_id = demo_question_id(question, authorized)
    key = cache_key(question_id, authorized, snapshot.fingerprint) if question_id and snapshot and cache else None
    status: Literal["miss", "bypass"] = "miss" if key else "bypass"
    if key and cache:
        start = time.perf_counter()
        try:
            cached = cache.get(key)
        except Exception:
            logger.info('answer_cache_unavailable operation=read')
            cached = None
        timings["cache_read"] = round((time.perf_counter() - start) * 1000, 3)
        if cached is not None and safe_cached_answer(cached, authorized, guardrails):
            start = time.perf_counter()
            if versions is None or not versions.is_current(snapshot, authorized):
                raise IndexUnavailable
            timings["index_recheck"] = round((time.perf_counter() - start) * 1000, 3)
            documents = {document.id: document for document in list_documents(authorized)}
            return replace(cached, usage=Usage(0, 0, 0.0), cache_status="hit",
                           citations=tuple(Citation(c.document_id, documents[c.document_id].title)
                                           for c in cached.citations), stage_timings_ms=timings)

    retriever, generator = services()
    # Bind the immutable version snapshot without changing the existing chat contract.
    class SnapshotRetriever:
        def search(self, query: str, scope: frozenset[str]) -> list[RetrievedChunk]:
            start = time.perf_counter()
            if snapshot is not None:
                chunks = cast(VersionedRetriever, retriever).search_snapshot(query, scope, snapshot)
            else:
                chunks = retriever.search(query, scope)
            timings["search"] = round((time.perf_counter() - start) * 1000, 3)
            return chunks

    class TimedGenerator:
        def generate(
            self, query: str, chunks: Sequence[RetrievedChunk],
        ) -> tuple[str, list[str], Usage | None]:
            start = time.perf_counter()
            result = generator.generate(query, chunks)
            timings["generation"] = round((time.perf_counter() - start) * 1000, 3)
            return result

    result = answer_question(question, authorized, SnapshotRetriever(), TimedGenerator(), guardrails)
    if versions is not None and snapshot is not None:
        start = time.perf_counter()
        if not versions.is_current(snapshot, authorized):
            raise IndexUnavailable
        timings["index_recheck"] = round((time.perf_counter() - start) * 1000, 3)
    if key and cache and result.cacheable and safe_cached_answer(result, authorized, guardrails):
        start = time.perf_counter()
        try:
            cache.put(key, result)
        except Exception:
            logger.info('answer_cache_unavailable operation=write')
        timings["cache_write"] = round((time.perf_counter() - start) * 1000, 3)
    return replace(result, cache_status=status, stage_timings_ms=timings)
