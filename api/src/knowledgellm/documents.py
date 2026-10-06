from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

MAX_DOCUMENT_BYTES = 1_000_000


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

    def read_document(self, key: str) -> str: ...


class AuthorizationError(Exception):
    """Raised when a document is missing or outside the caller's access scope."""


_CATALOG: tuple[tuple[str, str, str, str], ...] = (
    ("finance-q4-budget-overview", "Q4 budget overview", "finance", "finance/q4-budget-overview.md"),
    ("finance-expense-policy", "Expense policy", "finance", "finance/expense-policy.md"),
    ("operations-runbook-procedures", "Runbook & procedures", "operations", "operations/runbook-procedures.md"),
    ("operations-service-handoff", "Service handoff", "operations", "operations/service-handoff.md"),
    ("people-employee-handbook", "Employee handbook", "people", "people/employee-handbook.md"),
    ("people-leave-policy", "Leave policy", "people", "people/leave-policy.md"),
)


def list_documents(departments: frozenset[str]) -> list[DocumentSummary]:
    return [
        DocumentSummary(id=doc_id, title=title, department=department)
        for doc_id, title, department, _key in _CATALOG
        if department in departments
    ]


def document_for_key(key: str) -> DocumentSummary | None:
    return next(
        (
            DocumentSummary(id=doc_id, title=title, department=department)
            for doc_id, title, department, source_key in _CATALOG
            if key == source_key
        ),
        None,
    )


def document_for_id(document_id: str) -> DocumentSummary | None:
    return next(
        (
            DocumentSummary(id=doc_id, title=title, department=department)
            for doc_id, title, department, _key in _CATALOG
            if document_id == doc_id
        ),
        None,
    )


def open_document(
    document_id: str,
    departments: frozenset[str],
    storage: DocumentStorage,
) -> DocumentLink:
    match = next((entry for entry in _CATALOG if entry[0] == document_id), None)
    if match is None or match[2] not in departments:
        raise AuthorizationError

    doc_id, title, _department, key = match
    url = storage.presigned_get_url(key, expires_in=120)
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

    def read_document(self, key: str) -> str:
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        size = response.get("ContentLength")
        body = response["Body"]
        if not isinstance(size, int) or size > MAX_DOCUMENT_BYTES:
            body.close()
            raise ValueError("document exceeds the maximum supported size")
        try:
            contents = body.read(MAX_DOCUMENT_BYTES + 1)
        finally:
            body.close()
        if len(contents) > MAX_DOCUMENT_BYTES:
            raise ValueError("document exceeds the maximum supported size")
        return contents.decode("utf-8")


def summary_dict(summary: DocumentSummary) -> Mapping[str, str]:
    return {"id": summary.id, "title": summary.title, "department": summary.department}
