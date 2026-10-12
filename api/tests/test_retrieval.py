from knowledgellm.retrieval import department_filter


def test_department_filter_is_exact_and_empty_access_is_impossible() -> None:
    assert department_filter(frozenset({"finance", "operations"})) == {
        "must": [{"key": "department", "match": {"any": ["finance", "operations"]}}]
    }
    assert department_filter(frozenset()) == {
        "must": [{"key": "department", "match": {"value": "__no_authorized_department__"}}]
    }


def test_filter_ignores_unknown_department_values() -> None:
    assert department_filter(frozenset({"root", "finance"})) == {
        "must": [{"key": "department", "match": {"value": "finance"}}]
    }


def test_qdrant_query_receives_department_filter(monkeypatch) -> None:
    import sys
    from types import SimpleNamespace

    from knowledgellm.providers import QdrantRetriever

    class Filter:
        def __init__(self, **values):
            self.values = values

    class Document:
        def __init__(self, **values):
            self.values = values

    class Prefetch:
        def __init__(self, **values):
            self.__dict__.update(values)

    class FusionQuery:
        def __init__(self, **values):
            self.__dict__.update(values)

    class Fusion:
        RRF = "rrf"

    class Client:
        received = None

        def query_points(self, **values):
            self.received = values
            return SimpleNamespace(points=[])

    client = Client()
    monkeypatch.setitem(sys.modules, "qdrant_client", SimpleNamespace(models=SimpleNamespace(
        Filter=Filter, Document=Document, Prefetch=Prefetch, FusionQuery=FusionQuery, Fusion=Fusion,
    )))
    retriever = QdrantRetriever(client)

    assert retriever.search("budget", frozenset({"finance"})) == []
    department_filter_values = {
        "must": [{"key": "department", "match": {"value": "finance"}}]
    }
    assert client.received["with_payload"] is True
    assert client.received["query"].fusion == Fusion.RRF
    dense, sparse = client.received["prefetch"]
    assert (dense.using, sparse.using) == ("dense", "bm25")
    assert dense.filter.values == sparse.filter.values == department_filter_values
    assert dense.query.values == {
        "text": "budget", "model": "intfloat/multilingual-e5-small"
    }
    assert sparse.query.values == {"text": "budget", "model": "Qdrant/bm25"}
