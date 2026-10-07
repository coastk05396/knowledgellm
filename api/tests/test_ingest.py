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
        {"Records": [{"s3": {"object": {"key": "finance/q4-budget-overview.pdf"}}}]},
        storage,
        index,
        FakeEmbedder(),
    )

    assert count == 1
    assert storage.calls == ["finance/q4-budget-overview.pdf"]
    assert index.records[0]["department"] == "finance"
    assert index.records[0]["document_id"] == "finance-q4-budget-overview"
    assert index.records[0]["source_key"] == "finance/q4-budget-overview.pdf"
    assert index.replaced_documents == ["finance-q4-budget-overview"]


def test_ingestion_rejects_unknown_key_before_reading_source() -> None:
    storage = FakeStorage("secret")

    with pytest.raises(ValueError):
        ingest_s3_object(
            {"Records": [{"s3": {"object": {"key": "people/other-file.pdf"}}}]},
            storage,
            FakeIndex(),
            FakeEmbedder(),
        )

    assert storage.calls == []


def test_empty_document_creates_no_vectors() -> None:
    index = FakeIndex()

    count = ingest_s3_object(
        {"Records": [{"s3": {"object": {"key": "finance/q4-budget-overview.pdf"}}}]},
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
                "object": {"key": "finance/budget final.pdf"},
            },
        }
    ) == [
        {
            "s3": {
                "bucket": {"name": "knowledge-private"},
                "object": {"key": "finance/budget%20final.pdf"},
            }
        }
    ]


def test_versioned_ingestion_reads_immutable_source_and_never_replaces() -> None:
    class Storage:
        def read_document(self, key, version_id=None):
            assert version_id == "older-event-version"
            return "finance policy " * 100

    class Index:
        def upsert_version(self, document_id, records):
            assert document_id == "finance-expense-policy"
            assert all(record["source_version_id"] == "older-event-version" for record in records)
            assert all(len(record["text"].encode()) <= 480 for record in records)

    class Versions:
        completed = None
        def complete(self, document_id, version, count):
            self.completed = (document_id, version, count)

    versions = Versions()
    count = ingest_s3_object(
        {"Records": [{"s3": {"object": {"key": "finance/expense-policy.pdf", "versionId": "older-event-version"}}}]},
        Storage(), Index(), FakeEmbedder(), versions=versions,
    )
    assert count > 1
    assert versions.completed == ("finance-expense-policy", "older-event-version", count)


def test_failed_version_index_never_publishes_completion() -> None:
    class Storage:
        def read_document(self, key, version_id=None):
            return "policy"

    class Index:
        def upsert_version(self, document_id, records):
            raise RuntimeError("vector service unavailable")

    class Versions:
        def complete(self, *args):
            pytest.fail("failed indexing cannot publish a completion manifest")

    with pytest.raises(RuntimeError, match="vector service"):
        ingest_s3_object(
            {"Records": [{"s3": {"object": {"key": "finance/expense-policy.pdf", "versionId": "v1"}}}]},
            Storage(), Index(), FakeEmbedder(), versions=Versions(),
        )


def test_version_specific_point_ids_are_stable_and_cannot_overwrite_newer_versions() -> None:
    class Storage:
        def read_document(self, key, version_id=None):
            return "policy"

    class Index:
        ids = []
        def upsert_version(self, document_id, records):
            self.ids.append(records[0]["id"])

    index = Index()
    for version in ("new", "old", "new"):
        ingest_s3_object(
            {"Records": [{"s3": {"object": {"key": "finance/expense-policy.pdf", "versionId": version}}}]},
            Storage(), index, FakeEmbedder(),
        )
    assert index.ids[0] == index.ids[2]
    assert index.ids[0] != index.ids[1]


def test_eventbridge_preserves_immutable_version_id() -> None:
    record = normalize_s3_event({
        "source": "aws.s3", "detail-type": "Object Created",
        "detail": {"bucket": {"name": "bucket"}, "object": {"key": "finance/expense-policy.pdf", "version-id": "version1"}},
    })[0]
    assert record["s3"]["object"]["versionId"] == "version1"


def test_legacy_markdown_event_cannot_overwrite_pdf_index() -> None:
    storage = FakeStorage("old source")
    index = FakeIndex()
    with pytest.raises(ValueError, match="approved catalog"):
        ingest_s3_object({"Records": [{"s3": {"object": {"key": "finance/q4-budget-overview.md"}}}]}, storage, index, FakeEmbedder())
    assert storage.calls == []
    assert index.replaced_documents == []
