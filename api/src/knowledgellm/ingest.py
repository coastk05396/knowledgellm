import os
import uuid
from collections.abc import Mapping, Sequence
from typing import Protocol
from urllib.parse import quote, unquote_plus

from knowledgellm.documents import DocumentStorage, document_for_key
from knowledgellm.index_versions import S3IndexVersions


class VectorIndex(Protocol):
    def upsert_version(self, document_id: str, records: list[dict[str, object]]) -> None: ...

    def replace_document(self, document_id: str, records: list[dict[str, object]]) -> None: ...


class Embedder(Protocol):
    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


def chunk_markdown(text: str, max_chars: int = 1200, overlap: int = 150) -> list[str]:
    if max_chars <= 0 or overlap < 0 or overlap >= max_chars:
        raise ValueError("overlap must be non-negative and smaller than max_chars")
    remaining = text.strip()
    chunks: list[str] = []
    start = 0
    while start < len(remaining):
        end = min(start + max_chars, len(remaining))
        if end < len(remaining):
            boundary = remaining.rfind("\n", start + max_chars // 2, end)
            if boundary > start:
                end = boundary
        chunk = remaining[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end == len(remaining):
            break
        start = max(start + 1, end - overlap)
    return chunks


def _source_key(event: Mapping[str, object]) -> str:
    records = event.get("Records")
    if not isinstance(records, list) or not records or not isinstance(records[0], dict):
        raise ValueError("invalid object event")
    s3 = records[0].get("s3")
    obj = s3.get("object") if isinstance(s3, dict) else None
    encoded_key = obj.get("key") if isinstance(obj, dict) else None
    if not isinstance(encoded_key, str):
        raise ValueError("invalid object event")
    return unquote_plus(encoded_key)


def normalize_s3_event(event: Mapping[str, object]) -> list[dict[str, object]]:
    records = event.get("Records")
    if isinstance(records, list) and all(isinstance(record, dict) for record in records):
        return records
    detail = event.get("detail")
    bucket = detail.get("bucket") if isinstance(detail, dict) else None
    obj = detail.get("object") if isinstance(detail, dict) else None
    bucket_name = bucket.get("name") if isinstance(bucket, dict) else None
    key = obj.get("key") if isinstance(obj, dict) else None
    if (
        event.get("source") != "aws.s3"
        or event.get("detail-type") != "Object Created"
        or not isinstance(bucket_name, str)
        or not isinstance(key, str)
    ):
        raise ValueError("invalid object event")
    normalized_object = {"key": quote(key, safe="/")}
    if isinstance(obj.get("version-id"), str):
        normalized_object["versionId"] = obj["version-id"]
    return [{"s3": {"bucket": {"name": bucket_name}, "object": normalized_object}}]


def ingest_s3_object(
    event: Mapping[str, object],
    storage: DocumentStorage,
    index: VectorIndex,
    embedder: Embedder,
    versions: S3IndexVersions | None = None,
) -> int:
    key = _source_key(event)
    document = document_for_key(key)
    if document is None or not key.endswith(".md"):
        raise ValueError("document key is not in the approved catalog")

    from knowledgellm.providers import split_embedding_text

    record = event["Records"][0]
    version_id = record["s3"]["object"].get("versionId")
    if versions is not None and not version_id:
        version_id = storage.current_version(key)
    if version_id is not None and (not isinstance(version_id, str) or not version_id or version_id == "null"):
        raise ValueError("invalid immutable source version")
    contents = storage.read_document(key, version_id=version_id) if version_id else storage.read_document(key)
    chunks = [part for chunk in chunk_markdown(contents) for part in split_embedding_text(chunk)]
    if not chunks:
        if version_id:
            index.upsert_version(document.id, [])
            if versions is not None:
                versions.complete(document.id, version_id, 0)
        else:
            index.replace_document(document.id, [])
        return 0
    vectors = embedder.embed(chunks)
    if len(vectors) != len(chunks):
        raise ValueError("embedding count did not match chunk count")
    records: list[dict[str, object]] = []
    for chunk_index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{key}:{version_id or 'unversioned'}:{chunk_index}"))
        records.append(
            {
                "id": point_id,
                "vector": vector,
                "text": chunk,
                "department": document.department,
                "document_id": document.id,
                "title": document.title,
                "source_key": key,
                "chunk_index": chunk_index,
            }
        )
    if version_id:
        for record in records:
            record["source_version_id"] = version_id
        index.upsert_version(document.id, records)
        if versions is not None:
            versions.complete(document.id, version_id, len(records))
    else:
        index.replace_document(document.id, records)
    return len(records)


def handler(event: dict[str, object], context: object) -> dict[str, object]:
    del context
    from knowledgellm.configuration import read_secret
    from knowledgellm.documents import S3DocumentStorage
    from knowledgellm.providers import CohereEmbedder, QdrantVectorIndex, qdrant_client
    from knowledgellm.index_versions import S3IndexVersions

    bucket = os.getenv("DOCUMENTS_BUCKET")
    qdrant_url = os.getenv("QDRANT_URL")
    if not bucket or not qdrant_url:
        raise RuntimeError("ingestion providers are not configured")
    qdrant_api_key = read_secret("QDRANT_API_KEY", "QDRANT_API_KEY_SECRET_ARN")

    records = normalize_s3_event(event)
    storage = S3DocumentStorage(bucket)
    client = qdrant_client(qdrant_url, qdrant_api_key)
    index = QdrantVectorIndex(client)
    embedder = CohereEmbedder()
    versions = S3IndexVersions(bucket)
    indexed = 0
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("invalid object event")
        s3 = record.get("s3")
        event_bucket = s3.get("bucket") if isinstance(s3, dict) else None
        bucket_name = event_bucket.get("name") if isinstance(event_bucket, dict) else None
        if bucket_name != bucket:
            raise ValueError("object event does not match configured bucket")
        indexed += ingest_s3_object({"Records": [record]}, storage, index, embedder, versions=versions)
    return {"indexed_chunks": indexed}
