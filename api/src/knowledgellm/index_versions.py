"""S3-only verification of completed immutable document indexes."""
import hashlib
import json
import os
from dataclasses import dataclass
from typing import Any

from knowledgellm.documents import Language, list_documents, s3_client, source_key_for_id
from knowledgellm.request_budget import require_time

EMBEDDING_MODEL = "cohere.embed-multilingual-v3"
DEFAULT_COLLECTION = "knowledgellm-cohere-v3"


class IndexUnavailable(Exception):
    """Current authorized sources have not finished indexing."""


@dataclass(frozen=True)
class IndexSnapshot:
    versions: dict[str, str]
    fingerprint: str


def manifest_key(collection: str, document_id: str, version_id: str) -> str:
    digest = hashlib.sha256(version_id.encode()).hexdigest()
    return f"_indexes/{collection}/{document_id}/{digest}.json"


class S3IndexVersions:
    def __init__(self, bucket: str, client: Any = None, collection: str | None = None) -> None:
        self.bucket = bucket
        self.client = client if client is not None else s3_client()
        self.collection = collection or os.getenv("QDRANT_COLLECTION", DEFAULT_COLLECTION)

    def complete(self, document_id: str, version_id: str, chunk_count: int) -> None:
        self.client.put_object(
            Bucket=self.bucket,
            Key=manifest_key(self.collection, document_id, version_id),
            Body=json.dumps({"document_id": document_id, "version_id": version_id,
                             "model": EMBEDDING_MODEL, "collection": self.collection,
                             "chunk_count": chunk_count}).encode(),
            ContentType="application/json",
        )

    def current(self, departments: frozenset[str], language: Language = "en") -> IndexSnapshot:
        versions: dict[str, str] = {}
        try:
            for document in list_documents(departments, language):
                require_time(6)
                version = self.client.head_object(
                    Bucket=self.bucket, Key=source_key_for_id(document.id, language)
                ).get("VersionId")
                if not isinstance(version, str) or not version or version == "null":
                    raise IndexUnavailable
                require_time(6)
                response = self.client.get_object(
                    Bucket=self.bucket, Key=manifest_key(self.collection, document.id, version)
                )
                body = response["Body"]
                try:
                    manifest = json.loads(body.read(8193))
                finally:
                    body.close()
                if (manifest.get("document_id") != document.id
                    or manifest.get("version_id") != version
                    or manifest.get("model") != EMBEDDING_MODEL
                    or manifest.get("collection") != self.collection
                    or not isinstance(manifest.get("chunk_count"), int)
                    or manifest["chunk_count"] < 0):
                    raise IndexUnavailable
                versions[document.id] = version
        except Exception as exc:
            raise IndexUnavailable("current document index is unavailable") from exc
        fingerprint = hashlib.sha256(json.dumps(
            {"language": language, "versions": versions, "model": EMBEDDING_MODEL, "collection": self.collection},
            sort_keys=True, separators=(",", ":")
        ).encode()).hexdigest()
        return IndexSnapshot(versions, fingerprint)

    def is_current(self, snapshot: IndexSnapshot, departments: frozenset[str], language: Language = "en") -> bool:
        try:
            return self.current(departments, language).fingerprint == snapshot.fingerprint
        except IndexUnavailable:
            return False
