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
    assert storage.calls == [("finance/q4-budget-overview.md", 120)]


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
    storage = S3DocumentStorage("private-bucket")

    with pytest.raises(ValueError):
        storage.read_document("finance/q4-budget-overview.md")

    assert not body.called


def test_versioned_document_read_uses_exact_version_and_closes_body():
    import io
    from knowledgellm.documents import S3DocumentStorage

    body = io.BytesIO(b"immutable policy")
    class Client:
        def get_object(self, **kwargs):
            assert kwargs == {"Bucket": "bucket", "Key": "finance/expense-policy.md", "VersionId": "v1"}
            return {"ContentLength": 16, "Body": body}
    assert S3DocumentStorage("bucket", Client()).read_document("finance/expense-policy.md", "v1") == "immutable policy"
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
