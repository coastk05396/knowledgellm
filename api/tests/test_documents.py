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

    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=lambda _name: Client()))
    storage = S3DocumentStorage("private-bucket")

    with pytest.raises(ValueError):
        storage.read_document("finance/q4-budget-overview.md")

    assert not body.called
