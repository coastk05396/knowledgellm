import logging
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal, Protocol
from functools import lru_cache

Language = Literal["en", "zh-TW"]

MAX_DOCUMENT_BYTES = 1_000_000

logger = logging.getLogger(__name__)


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
    content: str | None = None


class DocumentStorage(Protocol):
    def presigned_get_url(self, key: str, expires_in: int) -> str: ...

    def read_document(self, key: str, version_id: str | None = None) -> str: ...

    def current_version(self, key: str) -> str: ...


class AuthorizationError(Exception):
    """Raised when a document is missing or outside the caller's access scope."""


_CATALOG: tuple[tuple[str, str, str, str, str], ...] = (
    ("finance-q4-budget-overview", "Q4 budget overview", "第四季預算概覽", "finance", "finance/q4-budget-overview.md"),
    ("finance-expense-policy", "Expense policy", "費用報銷政策", "finance", "finance/expense-policy.md"),
    ("operations-runbook-procedures", "Runbook & procedures", "維運手冊與程序", "operations", "operations/runbook-procedures.md"),
    ("operations-service-handoff", "Service handoff", "服務交接", "operations", "operations/service-handoff.md"),
    ("people-employee-handbook", "Employee handbook", "員工手冊", "people", "people/employee-handbook.md"),
    ("people-leave-policy", "Leave policy", "休假政策", "people", "people/leave-policy.md"),
)


def list_documents(departments: frozenset[str], language: Language = "en") -> list[DocumentSummary]:
    return [
        DocumentSummary(id=doc_id, title=title_zh if language == "zh-TW" else title, department=department)
        for doc_id, title, title_zh, department, _key in _CATALOG
        if department in departments
    ]


def document_for_key(key: str) -> DocumentSummary | None:
    language: Language = "zh-TW" if key.endswith("-ch.md") else "en"
    return next((document for document in list_documents(frozenset({"finance", "operations", "people"}), language)
                 if source_key_for_id(document.id, language) == key), None)


def document_for_id(document_id: str, language: Language = "en") -> DocumentSummary | None:
    return next((document for document in list_documents(frozenset({"finance", "operations", "people"}), language)
                 if document.id == document_id), None)


def open_document(
    document_id: str,
    departments: frozenset[str],
    storage: DocumentStorage,
    language: Language = "en",
) -> DocumentLink:
    document = document_for_id(document_id, language)
    if document is None or document.department not in departments:
        raise AuthorizationError
    key = source_key_for_id(document.id, language)
    url = storage.presigned_get_url(key, expires_in=120)
    try:
        content: str | None = storage.read_document(key)
    except Exception:
        # The link still opens the document; never log the error text, which may quote document data.
        logger.info("document_content_unavailable document_id=%s", document.id)
        content = None
    return DocumentLink(id=document.id, title=document.title, url=url, content=content)


def source_key_for_id(document_id: str, language: Language = "en") -> str:
    key = next(entry[4] for entry in _CATALOG if entry[0] == document_id)
    return key.removesuffix(".md") + "-ch.md" if language == "zh-TW" else key


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
            Params={"Bucket": self._bucket, "Key": key,
                    "ResponseContentType": "text/plain; charset=utf-8",
                    "ResponseContentDisposition": "inline"},
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
        return contents.decode("utf-8")


def summary_dict(summary: DocumentSummary) -> Mapping[str, str]:
    return {"id": summary.id, "title": summary.title, "department": summary.department}
