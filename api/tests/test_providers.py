import io
import json
from types import SimpleNamespace

import pytest

from knowledgellm.providers import CohereEmbedder, QdrantVectorIndex, QdrantRetriever, estimate_cost_usd, split_embedding_text
from knowledgellm.index_versions import IndexSnapshot


class Bedrock:
    def __init__(self):
        self.requests = []
        self.dimension = 1024
        self.bodies = []

    def invoke_model(self, **kwargs):
        self.requests.append(kwargs)
        request = json.loads(kwargs["body"])
        body = io.BytesIO(json.dumps({"embeddings": [[0.25] * self.dimension for _ in request["texts"]]}).encode())
        self.bodies.append(body)
        return {"body": body}


@pytest.mark.parametrize("input_type", ["search_query", "search_document"])
def test_cohere_batches_without_truncation_and_closes_bodies(input_type):
    client = Bedrock()
    vectors = CohereEmbedder(client, input_type).embed(["policy"] * 97)
    assert len(vectors) == 97
    assert len(client.requests) == 2
    assert all(request["modelId"] == "cohere.embed-multilingual-v3" for request in client.requests)
    assert [len(json.loads(request["body"])["texts"]) for request in client.requests] == [96, 1]
    assert all(json.loads(request["body"])["truncate"] == "NONE" for request in client.requests)
    assert all(json.loads(request["body"])["input_type"] == input_type for request in client.requests)
    assert all(body.closed for body in client.bodies)


def test_cohere_rejects_wrong_dimensions_and_overlong_input():
    client = Bedrock()
    client.dimension = 384
    with pytest.raises(ValueError, match="dimensions"):
        CohereEmbedder(client).embed(["policy"])
    with pytest.raises(ValueError, match="chunked"):
        CohereEmbedder(client).embed(["界" * 481])


def test_multilingual_chunking_preserves_entire_text():
    text = "財務政策 abc😀" * 500
    parts = split_embedding_text(text)
    assert "".join(parts) == text
    assert all(len(part.encode()) <= 480 for part in parts)


def test_cost_requires_both_current_rates_and_reports_an_estimate():
    assert estimate_cost_usd(1000, 500, 0.075, 0.3) == 0.000225
    assert estimate_cost_usd(1000, 500, None, 0.3) is None


class Qdrant:
    def __init__(self, dimensions=1024):
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


def test_version_upsert_retains_old_points_and_validates_collection():
    client = Qdrant()
    index = QdrantVectorIndex(client)
    index.upsert_version("finance-expense-policy", [{"id": "5a27ad88-b676-43db-b1ea-af624c358fcf", "vector": [0.] * 1024, "source_version_id": "v1"}])
    assert not client.deleted
    assert client.points[0].payload["source_version_id"] == "v1"
    with pytest.raises(ValueError, match="dimensions"):
        QdrantVectorIndex(Qdrant(384)).upsert_version("id", [])


def test_snapshot_query_filters_exact_document_version_pairs():
    client = Qdrant()
    retriever = QdrantRetriever(client, CohereEmbedder(Bedrock(), "search_query"))
    snapshot = IndexSnapshot({"finance-expense-policy": "version1", "finance-q4-budget-overview": "version2"}, "fp")
    retriever.search_snapshot("What policy?", frozenset({"finance"}), snapshot)
    serialized = client.query["query_filter"].model_dump()
    assert serialized["must"][0]["key"] == "department"
    pairs = serialized["must"][1]["should"]
    assert [(pair["must"][0]["match"]["value"], pair["must"][1]["match"]["value"]) for pair in pairs] == list(snapshot.versions.items())


def test_embedding_logs_only_stage_timing(caplog):
    import logging
    with caplog.at_level(logging.INFO, logger="knowledgellm.providers"):
        CohereEmbedder(Bedrock(), "search_query").embed(["private question contents"])
    events = [json.loads(record.message) for record in caplog.records if record.name == "knowledgellm.providers"]
    assert {event["stage"] for event in events} == {"embedding"}
    assert all(event["duration_ms"] >= 0 for event in events)
    assert "private question contents" not in caplog.text


def test_snapshot_retriever_drops_payloads_outside_exact_versions():
    class Client(Qdrant):
        def query_points(self, **kwargs):
            base = {"document_id": "finance-expense-policy", "title": "Policy", "department": "finance", "text": "private source"}
            return SimpleNamespace(points=[
                SimpleNamespace(payload={**base, "source_version_id": "old"}),
                SimpleNamespace(payload={**base, "source_version_id": "current"}),
                SimpleNamespace(payload={**base, "department": "people", "source_version_id": "current"}),
            ])
    retriever = QdrantRetriever(Client(), CohereEmbedder(Bedrock(), "search_query"))
    result = retriever.search_snapshot("policy?", frozenset({"finance"}), IndexSnapshot({"finance-expense-policy": "current"}, "fp"))
    assert len(result) == 1
    assert result[0].department == "finance"


def test_retrieval_logs_only_stage_timing(caplog):
    import logging
    with caplog.at_level(logging.INFO, logger="knowledgellm.providers"):
        retriever = QdrantRetriever(Qdrant(), CohereEmbedder(Bedrock(), "search_query"))
        retriever.search("private question contents", frozenset({"finance"}))
    events = [json.loads(record.message) for record in caplog.records if record.name == "knowledgellm.providers"]
    assert {event["stage"] for event in events} == {"embedding", "retrieval"}
    assert all(set(event) == {"stage", "duration_ms"} for event in events)
    assert "private question contents" not in caplog.text


def test_bedrock_connection_uses_singapore_and_is_reused(monkeypatch):
    import boto3
    from knowledgellm.providers import _bedrock_client

    calls = []
    def create_client(service, **kwargs):
        calls.append((service, kwargs))
        return object()
    monkeypatch.setattr(boto3, "client", create_client)
    _bedrock_client.cache_clear()
    try:
        assert _bedrock_client() is _bedrock_client()
        assert len(calls) == 1
        assert calls[0][0] == "bedrock-runtime"
        assert calls[0][1]["region_name"] == "ap-southeast-1"
        assert calls[0][1]["config"].retries["total_max_attempts"] == 1
        assert calls[0][1]["config"].connect_timeout == 2
        assert calls[0][1]["config"].read_timeout == 5
    finally:
        _bedrock_client.cache_clear()


def test_incomplete_upsert_cannot_be_marked_indexed():
    class Client(Qdrant):
        def upsert(self, **kwargs):
            return SimpleNamespace(status="acknowledged")
    with pytest.raises(RuntimeError, match="completed"):
        QdrantVectorIndex(Client()).upsert_version("finance-expense-policy", [{"id": "5a27ad88-b676-43db-b1ea-af624c358fcf", "vector": [0.] * 1024, "source_version_id": "v1"}])


def test_remote_provider_timeouts_fit_chat_request_budget(monkeypatch):
    import groq
    import qdrant_client as qdrant_module
    from knowledgellm.providers import GroqGenerator, qdrant_client

    calls = []
    def client(**kwargs):
        calls.append(kwargs)
        return object()
    monkeypatch.setattr(groq, "Groq", client)
    monkeypatch.setattr(qdrant_module, "QdrantClient", client)
    qdrant_client.cache_clear()
    try:
        GroqGenerator("test-placeholder-key")
        qdrant_client("https://qdrant.example", "test-placeholder-key")
        assert calls[0]["timeout"] == 8.0
        assert calls[0]["max_retries"] == 0
        assert calls[1]["timeout"] == 3.0
    finally:
        qdrant_client.cache_clear()
