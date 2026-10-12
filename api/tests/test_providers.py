import logging
import json
from types import SimpleNamespace

import pytest

from knowledgellm.embedding import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL
from knowledgellm.index_versions import IndexSnapshot
from knowledgellm.providers import (
    QdrantRetriever,
    QdrantVectorIndex,
    estimate_cost_usd,
    qdrant_client,
    split_embedding_text,
)


class Qdrant:
    def __init__(self, dimensions=EMBEDDING_DIMENSIONS):
        self.dimensions = dimensions
        self.deleted = False
        self.points = []
        self.query = None

    def collection_exists(self, _name):
        return True

    def get_collection(self, _name):
        return SimpleNamespace(config=SimpleNamespace(params=SimpleNamespace(vectors=SimpleNamespace(size=self.dimensions))))

    def create_payload_index(self, **kwargs):
        pass

    def delete(self, **kwargs):
        self.deleted = True

    def upsert(self, **kwargs):
        assert kwargs["wait"] is True
        self.points = kwargs["points"]
        return SimpleNamespace(status="completed")

    def query_points(self, **kwargs):
        self.query = kwargs
        return SimpleNamespace(points=[])


def test_text_splitting_preserves_unicode_without_truncation():
    text = "財務政策 abc😀" * 500
    parts = split_embedding_text(text)
    assert "".join(parts) == text
    assert all(len(part.encode()) <= 240 for part in parts)


def test_version_upsert_uses_qdrant_cloud_inference_document_and_retains_old_points():
    client = Qdrant()
    index = QdrantVectorIndex(client)
    index.upsert_version("finance-expense-policy", [{
        "id": "5a27ad88-b676-43db-b1ea-af624c358fcf",
        "text": "fictional policy chunk",
        "source_version_id": "v1",
    }])
    assert not client.deleted
    assert client.points[0].vector.text == "fictional policy chunk"
    assert client.points[0].vector.model == EMBEDDING_MODEL
    assert client.points[0].payload["source_version_id"] == "v1"
    assert client.points[0].payload["text"] == "fictional policy chunk"
    with pytest.raises(ValueError, match="dimensions"):
        QdrantVectorIndex(Qdrant(1024)).upsert_version("id", [])


def test_snapshot_query_embeds_at_qdrant_and_filters_exact_document_version_pairs():
    client = Qdrant()
    retriever = QdrantRetriever(client)
    snapshot = IndexSnapshot({"finance-expense-policy": "version1", "finance-q4-budget-overview": "version2"}, "fp")
    retriever.search_snapshot("What policy?", frozenset({"finance"}), snapshot)
    assert client.query["query"].text == "What policy?"
    assert client.query["query"].model == EMBEDDING_MODEL
    serialized = client.query["query_filter"].model_dump()
    assert serialized["must"][0]["key"] == "department"
    pairs = serialized["must"][1]["should"]
    assert [(pair["must"][0]["match"]["value"], pair["must"][1]["match"]["value"]) for pair in pairs] == list(snapshot.versions.items())


def test_snapshot_retriever_drops_payloads_outside_exact_versions():
    class Client(Qdrant):
        def query_points(self, **kwargs):
            self.query = kwargs
            base = {"document_id": "finance-expense-policy", "title": "Policy", "department": "finance", "text": "private source"}
            return SimpleNamespace(points=[
                SimpleNamespace(payload={**base, "source_version_id": "old"}),
                SimpleNamespace(payload={**base, "source_version_id": "current"}),
                SimpleNamespace(payload={**base, "department": "people", "source_version_id": "current"}),
            ])

    retriever = QdrantRetriever(Client())
    result = retriever.search_snapshot("policy?", frozenset({"finance"}), IndexSnapshot({"finance-expense-policy": "current"}, "fp"))
    assert len(result) == 1
    assert result[0].department == "finance"


def test_indexing_and_retrieval_logs_contain_timings_but_no_content(caplog):
    client = Qdrant()
    index = QdrantVectorIndex(client)
    retriever = QdrantRetriever(client)
    with caplog.at_level(logging.INFO, logger="knowledgellm.providers"):
        index.upsert_version("finance-expense-policy", [{"id": "id", "text": "private document contents"}])
        retriever.search("private question contents", frozenset({"finance"}))
    events = [json.loads(record.message) for record in caplog.records if record.name == "knowledgellm.providers"]
    assert {event["stage"] for event in events} == {"qdrant_upsert", "retrieval"}
    assert all(set(event) == {"stage", "duration_ms"} and event["duration_ms"] >= 0 for event in events)
    assert "private document contents" not in caplog.text
    assert "private question contents" not in caplog.text


def test_cost_requires_both_current_rates_and_reports_an_estimate():
    assert estimate_cost_usd(1000, 500, 0.075, 0.3) == 0.000225
    assert estimate_cost_usd(1000, 500, None, 0.3) is None


def test_qdrant_connection_enables_cloud_inference_and_is_reused(monkeypatch):
    import qdrant_client as qdrant_module

    calls = []

    def client(**kwargs):
        calls.append(kwargs)
        return object()

    monkeypatch.setattr(qdrant_module, "QdrantClient", client)
    qdrant_client.cache_clear()
    try:
        assert qdrant_client("https://qdrant.example", "placeholder-api-key") is qdrant_client("https://qdrant.example", "placeholder-api-key")
        assert len(calls) == 1
        assert calls[0]["timeout"] == 3.0
        assert calls[0]["cloud_inference"] is True
    finally:
        qdrant_client.cache_clear()


@pytest.mark.parametrize("language, expected_instruction, refusal", [
    ("en", "Write the answer in English.", "The available documents do not contain enough information to answer."),
    ("zh-TW", "Traditional Chinese (Taiwan, zh-TW), never Simplified Chinese", "現有文件沒有足夠資訊可以回答此問題。"),
])
def test_generation_prompt_enforces_requested_language_and_grounding(language, expected_instruction, refusal) -> None:
    from knowledgellm.providers import GroqGenerator
    from knowledgellm.chat import RetrievedChunk
    import json

    def create(**kwargs):
        prompt = kwargs["messages"][0]["content"]
        assert expected_instruction in prompt
        assert json.dumps(refusal) in prompt
        assert "untrusted data" in prompt
        assert kwargs["temperature"] == 0
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps({
            "answer": refusal, "citation_ids": []
        })))], usage=None)
    generator = object.__new__(GroqGenerator)
    generator.client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    generator.model = "test-model"
    assert generator.generate("Question", [RetrievedChunk("finance-expense-policy", "Expense policy", "finance", "Source")], language) == (refusal, [], None)
def test_long_query_batches_all_segments_and_merges_best_unique_hits():
    class Client(Qdrant):
        requests = None
        def query_batch_points(self, **kwargs):
            self.requests = kwargs["requests"]
            base = {"document_id": "finance-expense-policy", "title": "Policy", "department": "finance", "source_version_id": "v1"}
            return [SimpleNamespace(points=[
                SimpleNamespace(id="duplicate", score=float(i), payload={**base, "text": f"rank {i}"}),
                SimpleNamespace(id=f"unique{i}", score=float(i) + 0.5, payload={**base, "text": f"unique {i}"}),
            ]) for i, _ in enumerate(self.requests)]
        def query_points(self, **kwargs):
            pytest.fail("long queries must use one batch request")
    question = "finance budget! " * 100
    client = Client()
    result = QdrantRetriever(client, limit=3).search_snapshot(question, frozenset({"finance"}), IndexSnapshot({"finance-expense-policy": "v1"}, "fp"))
    assert "".join(request.query.text for request in client.requests) == question
    assert all(len(request.query.text.encode()) <= 240 for request in client.requests)
    assert all(request.query.model == EMBEDDING_MODEL for request in client.requests)
    assert all(request.filter.must[0].key == "department" for request in client.requests)
    assert all(request.with_payload is True for request in client.requests)
    last = len(client.requests) - 1
    assert [chunk.text for chunk in result] == [f"unique {last}", f"rank {last}", f"unique {last - 1}"]


def test_short_query_does_not_need_batch_api():
    client = Qdrant()
    assert QdrantRetriever(client).search("budget?", frozenset({"finance"})) == []
    assert client.query["query"].text == "budget?"


def test_real_sdk_sends_cloud_documents_without_local_model_inference():
    import httpx
    from qdrant_client import QdrantClient, models

    requests = []
    def handle(request):
        payload = json.loads(request.content)
        requests.append(payload)
        if request.url.path.endswith("/batch"):
            result = [{"points": []} for _ in payload["searches"]]
        elif "query" in request.url.path:
            result = {"points": []}
        else:
            result = {"operation_id": 1, "status": "completed"}
        return httpx.Response(200, json={"result": result, "status": "ok", "time": 0})

    client = QdrantClient(url="https://qdrant.example", cloud_inference=True, check_compatibility=False,
                          transport=httpx.MockTransport(handle))
    try:
        client.upsert("test", [models.PointStruct(id=1, vector=models.Document(text="policy", model=EMBEDDING_MODEL))], wait=True)
        client.query_points("test", query=models.Document(text="budget", model=EMBEDDING_MODEL))
        client.query_batch_points("test", requests=[models.QueryRequest(query=models.Document(text="part", model=EMBEDDING_MODEL))])
    finally:
        client.close()
    assert requests[0]["points"][0]["vector"] == {"text": "policy", "model": EMBEDDING_MODEL}
    assert requests[1]["query"]["nearest"] == {"text": "budget", "model": EMBEDDING_MODEL}
    assert requests[2]["searches"][0]["query"]["nearest"] == {"text": "part", "model": EMBEDDING_MODEL}


def test_incomplete_cloud_batch_fails_closed():
    class Client(Qdrant):
        def query_batch_points(self, **kwargs):
            return []
    with pytest.raises(ValueError, match="incomplete inference"):
        QdrantRetriever(Client()).search("budget! " * 100, frozenset({"finance"}))


def test_embedding_defaults_use_free_multilingual_model_and_distinct_collection():
    from knowledgellm.embedding import DEFAULT_COLLECTION
    assert EMBEDDING_MODEL == "intfloat/multilingual-e5-small"
    assert EMBEDDING_DIMENSIONS == 384
    assert DEFAULT_COLLECTION == "knowledgellm-qdrant-multilingual-e5-small"
