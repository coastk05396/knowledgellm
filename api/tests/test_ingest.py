from dataclasses import dataclass, field

import pytest

from knowledgellm.ingest import ingest_s3_object, normalize_s3_event


@dataclass
class FakeStorage:
    contents: str
    calls: list[str] = field(default_factory=list)

    def read_document(self, key: str) -> str:
        self.calls.append(key)
        return self.contents


@dataclass
class FakeIndex:
    records: list[dict[str, object]] = field(default_factory=list)
    replaced_documents: list[str] = field(default_factory=list)

    def replace_document(self, document_id: str, records: list[dict[str, object]]) -> None:
        self.replaced_documents.append(document_id)
        self.records = [record for record in self.records if record["document_id"] != document_id]
        self.records.extend(records)


@dataclass
class FakeEmbedder:
    def embed(self, texts: list[str]) -> list[list[float]]:
        return [[float(index)] for index, _text in enumerate(texts)]


def test_ingestion_derives_department_and_source_from_trusted_key() -> None:
    storage = FakeStorage("A fictional finance document with one short section.")
    index = FakeIndex()

    count = ingest_s3_object(
        {"Records": [{"s3": {"object": {"key": "finance/q4-budget-overview.md"}}}]},
        storage,
        index,
        FakeEmbedder(),
    )

    assert count == 1
    assert storage.calls == ["finance/q4-budget-overview.md"]
    assert index.records[0]["department"] == "finance"
    assert index.records[0]["document_id"] == "finance-q4-budget-overview"
    assert index.records[0]["source_key"] == "finance/q4-budget-overview.md"
    assert index.replaced_documents == ["finance-q4-budget-overview"]


def test_ingestion_rejects_unknown_key_before_reading_source() -> None:
    storage = FakeStorage("secret")

    with pytest.raises(ValueError):
        ingest_s3_object(
            {"Records": [{"s3": {"object": {"key": "people/other-file.md"}}}]},
            storage,
            FakeIndex(),
            FakeEmbedder(),
        )

    assert storage.calls == []


def test_empty_document_creates_no_vectors() -> None:
    index = FakeIndex()

    count = ingest_s3_object(
        {"Records": [{"s3": {"object": {"key": "finance/q4-budget-overview.md"}}}]},
        FakeStorage("  \n "),
        index,
        FakeEmbedder(),
    )

    assert count == 0
    assert index.records == []
    assert index.replaced_documents == ["finance-q4-budget-overview"]


def test_chunking_respects_size_and_overlap_bounds() -> None:
    from knowledgellm.ingest import chunk_markdown

    chunks = chunk_markdown("a" * 250, max_chars=100, overlap=20)

    assert all(len(chunk) <= 100 for chunk in chunks)
    assert len(chunks) == 3


def test_eventbridge_s3_event_is_normalized_to_an_object_record() -> None:
    assert normalize_s3_event(
        {
            "source": "aws.s3",
            "detail-type": "Object Created",
            "detail": {
                "bucket": {"name": "knowledge-private"},
                "object": {"key": "finance/budget final.md"},
            },
        }
    ) == [
        {
            "s3": {
                "bucket": {"name": "knowledge-private"},
                "object": {"key": "finance/budget%20final.md"},
            }
        }
    ]
