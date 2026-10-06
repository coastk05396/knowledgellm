import sys
from types import ModuleType, SimpleNamespace

import pytest

from knowledgellm.providers import QdrantVectorIndex, _embedding_model, estimate_cost_usd


@pytest.mark.parametrize("cache_path", [None, "/tmp/custom-fastembed"])
def test_embedding_download_uses_writable_lambda_cache(monkeypatch, cache_path) -> None:
    expected = cache_path or "/tmp/fastembed"
    if cache_path:
        monkeypatch.setenv("FASTEMBED_CACHE_PATH", cache_path)
    else:
        monkeypatch.delenv("FASTEMBED_CACHE_PATH", raising=False)
    calls = []

    def text_embedding(**kwargs):
        assert kwargs.get("cache_dir") == expected, "model download would use a read-only default cache"
        calls.append(kwargs)
        return object()

    fastembed = ModuleType("fastembed")
    fastembed.TextEmbedding = text_embedding  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "fastembed", fastembed)
    _embedding_model.cache_clear()
    try:
        first = _embedding_model("model")
        assert _embedding_model("model") is first
        assert len(calls) == 1
    finally:
        _embedding_model.cache_clear()


def test_cost_requires_both_current_rates_and_reports_an_estimate() -> None:
    assert estimate_cost_usd(1000, 500, 0.075, 0.3) == 0.000225
    assert estimate_cost_usd(1000, 500, None, 0.3) is None


@pytest.mark.parametrize("collection_exists", [False, True])
def test_qdrant_filter_indexes_exist_before_document_replacement(
    monkeypatch, collection_exists: bool
) -> None:
    events: list[tuple[str, str | None, str | None]] = []

    class Client:
        def collection_exists(self, _name):
            return collection_exists

        def create_collection(self, **_kwargs):
            events.append(("collection", None, None))

        def create_payload_index(self, *, field_name, field_schema, **_kwargs):
            events.append(("index", field_name, field_schema))

        def delete(self, **_kwargs):
            events.append(("delete", None, None))

    models = SimpleNamespace(
        VectorParams=lambda **_kwargs: object(),
        Distance=SimpleNamespace(COSINE="cosine"),
        PayloadSchemaType=SimpleNamespace(KEYWORD="keyword"),
        FilterSelector=lambda **_kwargs: object(),
        Filter=lambda **_kwargs: object(),
        FieldCondition=lambda **_kwargs: object(),
        MatchValue=lambda **_kwargs: object(),
    )
    qdrant_module = ModuleType("qdrant_client")
    qdrant_module.models = models  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "qdrant_client", qdrant_module)
    monkeypatch.setattr(
        "knowledgellm.providers._embedding_model",
        lambda _name: SimpleNamespace(embedding_size=3),
    )

    QdrantVectorIndex(Client()).replace_document("finance-q4", [])

    assert [(name, schema) for kind, name, schema in events if kind == "index"] == [
        ("department", "keyword"),
        ("document_id", "keyword"),
    ]
    assert max(i for i, event in enumerate(events) if event[0] == "index") < next(
        i for i, event in enumerate(events) if event[0] == "delete"
    )
