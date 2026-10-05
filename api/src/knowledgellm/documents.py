from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class DocumentSummary:
    id: str
    title: str
    department: str


@dataclass(frozen=True)
class DocumentLink:
    id: str
    title: str
    url: str


class DocumentStorage(Protocol):
    def presigned_get_url(self, key: str, expires_in: int) -> str: ...


class AuthorizationError(Exception):
    """Raised when a document is missing or outside the caller's access scope."""


_CATALOG: tuple[tuple[str, str, str], ...] = (
    ("finance/q4-budget-overview", "Q4 budget overview", "finance"),
    ("finance/expense-policy", "Expense policy", "finance"),
    ("operations/runbook-procedures", "Runbook & procedures", "operations"),
    ("operations/service-handoff", "Service handoff", "operations"),
    ("people/employee-handbook", "Employee handbook", "people"),
    ("people/leave-policy", "Leave policy", "people"),
)


def list_documents(departments: frozenset[str]) -> list[DocumentSummary]:
    return [
        DocumentSummary(id=doc_id, title=title, department=department)
        for doc_id, title, department in _CATALOG
        if department in departments
    ]


def open_document(
    document_id: str,
    departments: frozenset[str],
    storage: DocumentStorage,
) -> DocumentLink:
    match = next((entry for entry in _CATALOG if entry[0] == document_id), None)
    if match is None or match[2] not in departments:
        raise AuthorizationError

    doc_id, title, _department = match
    url = storage.presigned_get_url(f"{doc_id}.md", expires_in=120)
    return DocumentLink(id=doc_id, title=title, url=url)


class S3DocumentStorage:
    def __init__(self, bucket: str) -> None:
        import boto3

        self._bucket = bucket
        self._client = boto3.client("s3")

    def presigned_get_url(self, key: str, expires_in: int) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )


def summary_dict(summary: DocumentSummary) -> Mapping[str, str]:
    return {"id": summary.id, "title": summary.title, "department": summary.department}
