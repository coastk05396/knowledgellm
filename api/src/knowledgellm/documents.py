from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from functools import lru_cache
from io import BytesIO

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

    def read_document(self, key: str, version_id: str | None = None) -> str: ...

    def current_version(self, key: str) -> str: ...


class AuthorizationError(Exception):
    """Raised when a document is missing or outside the caller's access scope."""


_CATALOG: tuple[tuple[str, str, str, str], ...] = (
    ("finance-q4-budget-overview", "Q4 budget overview", "finance", "finance/q4-budget-overview.pdf"),
    ("finance-expense-policy", "Expense policy", "finance", "finance/expense-policy.pdf"),
    ("operations-runbook-procedures", "Runbook & procedures", "operations", "operations/runbook-procedures.pdf"),
    ("operations-service-handoff", "Service handoff", "operations", "operations/service-handoff.pdf"),
    ("people-employee-handbook", "Employee handbook", "people", "people/employee-handbook.pdf"),
    ("people-leave-policy", "Leave policy", "people", "people/leave-policy.pdf"),
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


def source_key_for_id(document_id: str) -> str:
    return next(entry[3] for entry in _CATALOG if entry[0] == document_id)


@lru_cache(maxsize=1)
def s3_client() -> Any:
    import boto3
    from botocore.config import Config

    return boto3.client("s3", config=Config(
        connect_timeout=2, read_timeout=3,
        retries={"total_max_attempts": 1, "mode": "standard"},
    ))


class S3DocumentStorage:
    def __init__(self, bucket: str, client: Any = None) -> None:
        self._bucket = bucket
        self._client = client if client is not None else s3_client()

    def presigned_get_url(self, key: str, expires_in: int) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_in,
        )

    def current_version(self, key: str) -> str:
        version = self._client.head_object(Bucket=self._bucket, Key=key).get("VersionId")
        if not isinstance(version, str) or not version or version == "null":
            raise ValueError("document must have an immutable S3 version")
        return version

    def read_document(self, key: str, version_id: str | None = None) -> str:
        params = {"Bucket": self._bucket, "Key": key}
        if version_id is not None:
            params["VersionId"] = version_id
        response = self._client.get_object(**params)
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
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(contents))
        if reader.is_encrypted:
            raise ValueError("encrypted PDFs are not supported")
        text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        if not text.strip():
            raise ValueError("PDF must contain selectable text; scanned PDFs require OCR")
        return text


def summary_dict(summary: DocumentSummary) -> Mapping[str, str]:
    return {"id": summary.id, "title": summary.title, "department": summary.department}
