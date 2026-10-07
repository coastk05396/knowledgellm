from dataclasses import dataclass

import pytest

from knowledgellm.documents import AuthorizationError, list_documents, open_document


@dataclass
class FakeStorage:
    calls: list[tuple[str, int]]

    def presigned_get_url(self, key: str, expires_in: int) -> str:
        self.calls.append((key, expires_in))
        return "https://storage.example/signed"


def test_listing_contains_only_authorized_document_metadata() -> None:
    documents = list_documents(frozenset({"finance"}))

    assert [(doc.id, doc.title) for doc in documents] == [
        ("finance-q4-budget-overview", "Q4 budget overview"),
        ("finance-expense-policy", "Expense policy"),
    ]


def test_document_open_authorizes_before_storage_and_uses_short_lived_link() -> None:
    storage = FakeStorage(calls=[])

    with pytest.raises(AuthorizationError):
        open_document("people-leave-policy", frozenset({"finance"}), storage)

    assert storage.calls == []
    link = open_document("finance-q4-budget-overview", frozenset({"finance"}), storage)
    assert link.url == "https://storage.example/signed"
    assert storage.calls == [("finance/q4-budget-overview.pdf", 120)]


def test_s3_document_read_rejects_oversized_sources_before_streaming(monkeypatch) -> None:
    import sys
    from types import SimpleNamespace

    from knowledgellm.documents import MAX_DOCUMENT_BYTES, S3DocumentStorage

    class Body:
        called = False

        def read(self, _limit):
            self.called = True
            return b"too large"

        def close(self):
            pass

    body = Body()

    class Client:
        def get_object(self, **_kwargs):
            return {"ContentLength": MAX_DOCUMENT_BYTES + 1, "Body": body}

    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=lambda _name, **_kwargs: Client()))
    storage = S3DocumentStorage("private-bucket", Client())

    with pytest.raises(ValueError):
        storage.read_document("finance/q4-budget-overview.pdf")

    assert not body.called


def test_versioned_document_read_uses_exact_version_and_closes_body():
    import io
    from knowledgellm.documents import S3DocumentStorage

    from pathlib import Path
    contents = (Path(__file__).parents[1] / "src/knowledgellm/sample_docs/finance/expense-policy.pdf").read_bytes()
    body = io.BytesIO(contents)
    class Client:
        def get_object(self, **kwargs):
            assert kwargs == {"Bucket": "bucket", "Key": "finance/expense-policy.pdf", "VersionId": "v1"}
            return {"ContentLength": len(contents), "Body": body}
    assert "Corporate Expense Policy" in S3DocumentStorage("bucket", Client()).read_document("finance/expense-policy.pdf", "v1")
    assert body.closed


def test_s3_verification_connection_has_bounded_timeouts_and_is_reused(monkeypatch):
    import boto3
    from knowledgellm.documents import s3_client

    calls = []
    def create_client(service, **kwargs):
        calls.append((service, kwargs))
        return object()
    monkeypatch.setattr(boto3, "client", create_client)
    s3_client.cache_clear()
    try:
        assert s3_client() is s3_client()
        config = calls[0][1]["config"]
        assert config.connect_timeout == 2
        assert config.read_timeout == 3
        assert config.retries["total_max_attempts"] == 1
    finally:
        s3_client.cache_clear()


@pytest.mark.parametrize("invalid_pdf", [False, True])
def test_s3_pdf_read_extracts_text_and_closes_stream_on_parse_failure(monkeypatch, invalid_pdf) -> None:
    from io import BytesIO
    from pathlib import Path
    import sys
    from types import SimpleNamespace
    from knowledgellm.documents import S3DocumentStorage

    sample = Path(__file__).parents[1] / "src/knowledgellm/sample_docs/finance/q4-budget-overview.pdf"
    contents = b"not a PDF" if invalid_pdf else sample.read_bytes()
    body = BytesIO(contents)
    class Client:
        def get_object(self, **kwargs):
            assert kwargs == {"Bucket": "existing-private-bucket", "Key": "finance/q4-budget-overview.pdf"}
            return {"ContentLength": len(contents), "Body": body}
    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=lambda _name: Client()))
    storage = S3DocumentStorage("existing-private-bucket", Client())
    if invalid_pdf:
        with pytest.raises(Exception):
            storage.read_document("finance/q4-budget-overview.pdf")
    else:
        assert "108,000 credits" in storage.read_document("finance/q4-budget-overview.pdf")
    assert body.closed


def test_text_free_pdf_is_rejected_without_clearing_previous_index(monkeypatch) -> None:
    from io import BytesIO
    import sys
    from types import SimpleNamespace
    from pypdf import PdfWriter
    from knowledgellm.documents import S3DocumentStorage

    output = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.write(output)
    contents = output.getvalue()
    class Client:
        def get_object(self, **_kwargs):
            return {"ContentLength": len(contents), "Body": BytesIO(contents)}
    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=lambda _name: Client()))
    with pytest.raises(ValueError, match="selectable text"):
        S3DocumentStorage("private-bucket", Client()).read_document("finance/q4-budget-overview.pdf")
