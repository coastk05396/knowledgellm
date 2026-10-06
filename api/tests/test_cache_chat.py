import json
from dataclasses import replace

import pytest

from knowledgellm import handler
from knowledgellm.chat import ChatAnswer, Citation, RetrievedChunk, Usage
from knowledgellm.guardrails import BasicGuardrails
from knowledgellm.index_versions import IndexSnapshot, IndexUnavailable

QUESTION = "What is the total approved Q4 budget?"
FINANCE = frozenset({"finance"})
SNAPSHOT = IndexSnapshot({"finance-q4-budget-overview": "v1", "finance-expense-policy": "v1"}, "index-v1")


class Versions:
    def __init__(self):
        self.snapshot = SNAPSHOT
        self.unavailable = False

    def current(self, departments):
        if self.unavailable:
            raise IndexUnavailable
        return self.snapshot

    def is_current(self, snapshot, departments):
        return not self.unavailable and snapshot == self.snapshot


class Cache:
    def __init__(self):
        self.entries = {}

    def get(self, key):
        return self.entries.get(key)

    def put(self, key, answer):
        self.entries[key] = answer


class Retriever:
    def search_snapshot(self, question, departments, snapshot):
        assert snapshot == SNAPSHOT
        return [RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", "Budget is $2.5M.")]


class Generator:
    def __init__(self, answer="The budget is $2.5M.", citations=None, after=None):
        self.answer = answer
        self.citations = citations if citations is not None else ["finance-q4-budget-overview"]
        self.after = after

    def generate(self, question, chunks):
        if self.after:
            self.after()
        return self.answer, self.citations, Usage(25, 10, 0.0001)


def ask(question=QUESTION, departments=FINANCE, cache=None, versions=None, generator=None, factory=None):
    from knowledgellm.cached_chat import answer_with_cache

    return answer_with_cache(
        question, departments, factory or (lambda: (Retriever(), generator or Generator())),
        BasicGuardrails(), cache, versions,
    )


def forbidden():
    raise AssertionError("provider must not be constructed")


def test_repeat_demo_question_skips_all_model_and_vector_services():
    cache = Cache()
    first = ask(cache=cache, versions=Versions())
    second = ask("  " + QUESTION + "\n", cache=cache, versions=Versions(), factory=forbidden)
    assert first.cache_status == "miss"
    assert second.cache_status == "hit"
    assert second.answer == "The budget is $2.5M."
    assert second.citations == (Citation("finance-q4-budget-overview", "Q4 budget overview"),)
    assert second.usage == Usage(0, 0, 0.0)


@pytest.mark.parametrize("question", [QUESTION.lower(), "custom question"])
def test_non_catalog_questions_bypass_and_do_not_store(question):
    cache = Cache()
    result = ask(question, cache=cache, versions=Versions())
    assert result.cache_status == "bypass"
    assert cache.entries == {}


@pytest.mark.parametrize("departments,question,action", [
    (frozenset(), QUESTION, "access_denied"),
    (FINANCE, "Contact alex@example.test", "question_pii_blocked"),
    (FINANCE, " ", "invalid_question"),
])
def test_guardrails_run_before_any_cache_or_provider_access(departments, question, action):
    class ForbiddenCache:
        def get(self, key):
            raise AssertionError("cache must not be read")

    result = ask(question, departments, ForbiddenCache(), Versions(), factory=forbidden)
    assert result.guardrail_action == action
    assert result.cache_status == "bypass"


def test_full_authorization_scope_partitions_cache():
    cache = Cache()
    ask(cache=cache, versions=Versions())
    result = ask(departments=frozenset({"finance", "people"}), cache=cache, versions=Versions())
    assert result.cache_status == "miss"
    assert len(cache.entries) == 2


@pytest.mark.parametrize("answer,citations", [
    ("Contact alex@example.test", ["finance-q4-budget-overview"]),
    ("No evidence", []),
    ("Budget", ["people-leave-policy"]),
    ("Budget", ["finance-q4-budget-overview", "fake-id"]),
    ("The available documents do not contain enough information to answer.", ["finance-q4-budget-overview"]),
])
def test_unsafe_refused_or_invalid_citation_answers_are_not_cached(answer, citations):
    cache = Cache()
    ask(cache=cache, versions=Versions(), generator=Generator(answer, citations))
    assert cache.entries == {}


@pytest.mark.parametrize("poison", ["pii", "cross-department", "unknown", "empty", "refusal"])
def test_cache_hits_revalidate_answer_and_every_citation(poison):
    cache = Cache()
    ask(cache=cache, versions=Versions())
    key = next(iter(cache.entries))
    entry = cache.entries[key]
    if poison == "pii":
        entry = replace(entry, answer="Contact alex@example.test")
    elif poison == "cross-department":
        entry = replace(entry, citations=(Citation("people-leave-policy", "Leave policy"),))
    elif poison == "unknown":
        entry = replace(entry, citations=(Citation("fake-id", "Unknown"),))
    elif poison == "empty":
        entry = replace(entry, answer="")
    else:
        entry = replace(entry, answer="The available documents do not contain enough information to answer.")
    cache.entries[key] = entry
    result = ask(cache=cache, versions=Versions())
    assert result.cache_status == "miss"
    assert result.answer == "The budget is $2.5M."


def test_unindexed_document_update_returns_unavailable_before_cache_read():
    cache = Cache()
    ask(cache=cache, versions=Versions())
    versions = Versions()
    versions.unavailable = True
    with pytest.raises(IndexUnavailable):
        ask(cache=cache, versions=versions, factory=forbidden)


def test_document_changes_during_generation_prevent_response_and_cache_write():
    versions = Versions()
    cache = Cache()
    with pytest.raises(IndexUnavailable):
        ask(cache=cache, versions=versions, generator=Generator(after=lambda: setattr(versions, "unavailable", True)))
    assert cache.entries == {}


def test_cache_fault_falls_back_to_normal_generation():
    class BrokenCache:
        def get(self, key):
            raise TimeoutError("private data")

        def put(self, key, answer):
            raise TimeoutError("private data")

    result = ask(cache=BrokenCache(), versions=Versions())
    assert result.answer == "The budget is $2.5M."
    assert result.cache_status == "miss"


def test_provider_fault_never_writes_an_answer():
    cache = Cache()
    with pytest.raises(RuntimeError):
        ask(cache=cache, versions=Versions(), factory=lambda: (_ for _ in ()).throw(RuntimeError("bedrock failed")))
    assert cache.entries == {}


def test_invalid_token_is_rejected_before_cache_and_services(monkeypatch):
    monkeypatch.setattr(handler, "create_chat_services", forbidden)
    response = handler.handler({"rawPath": "/chat", "body": json.dumps({"question": QUESTION}),
        "requestContext": {"http": {"method": "POST"}, "authorizer": {"jwt": {"claims": {
            "token_use": "id", "cognito:groups": '["finance"]'}}}}}, object())
    assert response["statusCode"] == 401


def chat_event(question=QUESTION, group="finance"):
    return {"rawPath": "/chat", "body": json.dumps({"question": question}),
            "requestContext": {"http": {"method": "POST"}, "authorizer": {"jwt": {"claims": {
                "token_use": "access", "cognito:groups": json.dumps([group])}}}}}


def test_route_cache_hit_has_zero_usage_cost_and_safe_telemetry(monkeypatch, caplog):
    cache = Cache()
    versions = Versions()
    monkeypatch.setattr(handler, "create_answer_cache", lambda: cache)
    monkeypatch.setattr(handler, "create_index_versions", lambda: versions)
    monkeypatch.setattr(handler, "create_chat_services", lambda: (Retriever(), Generator()))
    caplog.set_level("INFO", logger=handler.__name__)
    first = handler.handler(chat_event(), object())
    assert json.loads(first["body"])["cache_status"] == "miss"
    monkeypatch.setattr(handler, "create_chat_services", forbidden)
    second = handler.handler(chat_event(), object())
    body = json.loads(second["body"])
    assert second["statusCode"] == 200
    assert body["cache_status"] == "hit"
    assert body["usage"] == {"input_tokens": 0, "output_tokens": 0}
    assert body["cost_usd"] == 0
    telemetry = [json.loads(r.message) for r in caplog.records if '"event":"chat_telemetry"' in r.message]
    assert [r["cache_status"] for r in telemetry] == ["miss", "hit"]
    assert telemetry[1]["stage_timings_ms"]["index_check"] >= 0
    assert "generation" not in telemetry[1]["stage_timings_ms"]
    assert QUESTION not in caplog.text
    assert "The budget is $2.5M." not in caplog.text


def test_route_unindexed_source_returns_existing_safe_unavailable_error(monkeypatch):
    versions = Versions()
    versions.unavailable = True
    monkeypatch.setattr(handler, "create_answer_cache", lambda: Cache())
    monkeypatch.setattr(handler, "create_index_versions", lambda: versions)
    monkeypatch.setattr(handler, "create_chat_services", forbidden)
    result = handler.handler(chat_event(), object())
    assert result["statusCode"] == 503
    assert json.loads(result["body"]) == {"error": "assistant_unavailable"}


def test_route_cache_initialization_failure_generates_normally(monkeypatch):
    def broken_cache():
        raise RuntimeError("private credentials")

    monkeypatch.setattr(handler, "create_answer_cache", broken_cache)
    monkeypatch.setattr(handler, "create_index_versions", lambda: Versions())
    monkeypatch.setattr(handler, "create_chat_services", lambda: (Retriever(), Generator()))
    result = handler.handler(chat_event(), object())
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["answer"] == "The budget is $2.5M."


def test_route_pii_does_not_initialize_any_external_service(monkeypatch):
    monkeypatch.setattr(handler, "create_answer_cache", forbidden)
    monkeypatch.setattr(handler, "create_index_versions", forbidden)
    monkeypatch.setattr(handler, "create_chat_services", forbidden)
    result = handler.handler(chat_event("Contact alex@example.test"), object())
    assert result["statusCode"] == 200
    assert json.loads(result["body"])["guardrail_action"] == "question_pii_blocked"
