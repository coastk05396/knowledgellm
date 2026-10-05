import os
import uuid
from collections.abc import Mapping, Sequence
from typing import Protocol
from urllib.parse import quote, unquote_plus

from knowledgellm.documents import DocumentStorage, document_for_key


class VectorIndex(Protocol):
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
    return [{"s3": {"bucket": {"name": bucket_name}, "object": {"key": quote(key, safe="/")}}}]


def ingest_s3_object(
    event: Mapping[str, object],
    storage: DocumentStorage,
    index: VectorIndex,
    embedder: Embedder,
) -> int:
    key = _source_key(event)
    document = document_for_key(key)
    if document is None or not key.endswith(".md"):
        raise ValueError("document key is not in the approved catalog")

    chunks = chunk_markdown(storage.read_document(key))
    if not chunks:
        index.replace_document(document.id, [])
        return 0
    vectors = embedder.embed(chunks)
    if len(vectors) != len(chunks):
        raise ValueError("embedding count did not match chunk count")
    records: list[dict[str, object]] = []
    for chunk_index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{key}:{chunk_index}"))
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
    index.replace_document(document.id, records)
    return len(records)


def handler(event: dict[str, object], context: object) -> dict[str, object]:
    del context
    from qdrant_client import QdrantClient

    from knowledgellm.configuration import read_secret
    from knowledgellm.documents import S3DocumentStorage
    from knowledgellm.providers import FastEmbedder, QdrantVectorIndex

    bucket = os.getenv("DOCUMENTS_BUCKET")
    qdrant_url = os.getenv("QDRANT_URL")
    if not bucket or not qdrant_url:
        raise RuntimeError("ingestion providers are not configured")
    qdrant_api_key = read_secret("QDRANT_API_KEY", "QDRANT_API_KEY_SECRET_ARN")

    records = normalize_s3_event(event)
    storage = S3DocumentStorage(bucket)
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=10.0)
    index = QdrantVectorIndex(client)
    embedder = FastEmbedder(os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2"))
    indexed = 0
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("invalid object event")
        s3 = record.get("s3")
        event_bucket = s3.get("bucket") if isinstance(s3, dict) else None
        bucket_name = event_bucket.get("name") if isinstance(event_bucket, dict) else None
        if bucket_name != bucket:
            raise ValueError("object event does not match configured bucket")
        indexed += ingest_s3_object({"Records": [record]}, storage, index, embedder)
    return {"indexed_chunks": indexed}
