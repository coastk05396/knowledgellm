"""Embedding configuration and byte-bounded text shared by indexing and retrieval."""
import os

DEFAULT_EMBEDDING_MODEL = "intfloat/multilingual-e5-small"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)
SPARSE_MODEL = "Qdrant/bm25"
RETRIEVAL_VERSION = "hybrid-rrf-v1"
EMBEDDING_DIMENSIONS = 384
DEFAULT_COLLECTION = "knowledgellm-qdrant-hybrid-e5-small"
COLLECTION = os.getenv("QDRANT_COLLECTION", DEFAULT_COLLECTION)
# Keep byte-bounded text conservative across English and Traditional Chinese.
MAX_EMBEDDING_BYTES = 240


def split_embedding_text(text: str) -> list[str]:
    """Split without dropping characters or breaking a UTF-8 sequence."""
    parts: list[str] = []
    start = 0
    size = 0
    for position, character in enumerate(text):
        width = len(character.encode("utf-8"))
        if size + width > MAX_EMBEDDING_BYTES:
            parts.append(text[start:position])
            start, size = position, 0
        size += width
    if start < len(text):
        parts.append(text[start:])
    return parts
