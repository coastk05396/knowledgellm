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
        ("finance/q4-budget-overview", "Q4 budget overview"),
        ("finance/expense-policy", "Expense policy"),
    ]


def test_document_open_authorizes_before_storage_and_uses_short_lived_link() -> None:
    storage = FakeStorage(calls=[])

    with pytest.raises(AuthorizationError):
        open_document("people/leave-policy", frozenset({"finance"}), storage)

    assert storage.calls == []
    link = open_document("finance/q4-budget-overview", frozenset({"finance"}), storage)
    assert link.url == "https://storage.example/signed"
    assert storage.calls == [("finance/q4-budget-overview.md", 120)]
