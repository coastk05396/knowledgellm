import json
from dataclasses import replace

import pytest

from knowledgellm.answer_cache import DynamoAnswerCache, cache_key, demo_question_id, demo_questions
from knowledgellm.chat import ChatAnswer, Citation, Usage


class DynamoClient:
    """External persistence fixture shared by otherwise independent Lambda instances."""
    def __init__(self):
        self.tables = {}

    def put_item(self, *, TableName, Item):
        self.tables.setdefault(TableName, {})[Item["pk"]["S"]] = Item

    def get_item(self, *, TableName, Key, ConsistentRead):
        assert ConsistentRead is True
        item = self.tables.get(TableName, {}).get(Key["pk"]["S"])
        return {"Item": item} if item is not None else {}


ANSWER = ChatAnswer("Budget is $2.5M.", (Citation("finance-q4-budget-overview", "Q4 budget overview"),),
                    Usage(40, 20, 0.01), retrieved_count=1, cacheable=True)


def test_separate_lambda_cache_instances_share_persisted_answers_until_expiry():
    client = DynamoClient()
    first_lambda = DynamoAnswerCache("answers", client, clock=lambda: 100)
    second_lambda = DynamoAnswerCache("answers", client, clock=lambda: 86_499)
    first_lambda.put("key", ANSWER)
    result = second_lambda.get("key")
    assert result.answer == "Budget is $2.5M."
    assert [c.document_id for c in result.citations] == ["finance-q4-budget-overview"]
    assert result.usage is None
    expired_lambda = DynamoAnswerCache("answers", client, clock=lambda: 86_500)
    assert expired_lambda.get("key") is None
    assert "key" in client.tables["answers"]  # TTL deletion has not happened yet.


def test_persistence_contains_only_answer_and_safe_metadata():
    client = DynamoClient()
    DynamoAnswerCache("answers", client, clock=lambda: 100).put("key", ANSWER)
    item = client.tables["answers"]["key"]
    assert item["expires_at"] == {"N": "86500"}
    payload = json.loads(item["payload"]["S"])
    assert set(payload) == {"schema", "answer", "citation_ids", "guardrail_action", "retrieved_count", "redacted_source_count"}
    assert "usage" not in payload
    assert "cost" not in item["payload"]["S"]
    assert "https:" not in item["payload"]["S"]


@pytest.mark.parametrize("field,value", [
    ("schema", 2), ("citation_ids", []), ("citation_ids", ["id", "id"]),
    ("citation_ids", "id"), ("answer", 123), ("guardrail_action", "answer_pii_blocked"),
    ("retrieved_count", -1), ("retrieved_count", True), ("redacted_source_count", 2),
])
def test_malformed_persistent_entries_are_misses(field, value):
    client = DynamoClient()
    cache = DynamoAnswerCache("answers", client, clock=lambda: 100)
    cache.put("key", ANSWER)
    item = client.tables["answers"]["key"]
    payload = json.loads(item["payload"]["S"])
    payload[field] = value
    item["payload"]["S"] = json.dumps(payload)
    assert cache.get("key") is None


def test_redacted_safe_answers_are_persisted_and_reloaded():
    client = DynamoClient()
    cache = DynamoAnswerCache("answers", client, clock=lambda: 100)
    cache.put("key", replace(ANSWER, guardrail_action="source_pii_redacted", redacted_source_count=1))
    assert cache.get("key").guardrail_action == "source_pii_redacted"


def test_catalog_matching_is_exact_and_department_scoped():
    questions = demo_questions()
    assert len(questions) == len({q["id"] for q in questions}) == 15
    assert {department: sum(q["department"] == department for q in questions)
            for department in {"finance", "operations", "people"}} == {"finance": 5, "operations": 5, "people": 5}
    assert demo_question_id("  What is the total approved Q4 budget?\n", frozenset({"finance"})) == "finance-01"
    assert demo_question_id("what is the total approved q4 budget?", frozenset({"finance"})) is None
    assert demo_question_id("What is the total approved Q4 budget?", frozenset({"operations"})) is None


def test_key_partitions_document_versions_and_models(monkeypatch):
    key = cache_key("finance-01", frozenset({"finance"}), "v1")
    assert cache_key("finance-01", frozenset({"finance", "people"}), "v1") != key
    assert cache_key("finance-01", frozenset({"finance"}), "v2") != key
    assert cache_key("finance-02", frozenset({"finance"}), "v1") != key
    monkeypatch.setenv("GROQ_MODEL", "replacement-model")
    assert cache_key("finance-01", frozenset({"finance"}), "v1") != key


def test_key_is_order_independent_for_same_complete_scope():
    assert cache_key("finance-01", frozenset(["finance", "people"]), "v1") == cache_key(
        "finance-01", frozenset(["people", "finance"]), "v1")
