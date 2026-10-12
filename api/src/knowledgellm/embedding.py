"""Embedding model and collection settings shared by indexing and retrieval."""
import os

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
EMBEDDING_DIMENSIONS = 384
DEFAULT_COLLECTION = "knowledgellm-qdrant-multilingual-e5-small"
COLLECTION = os.getenv("QDRANT_COLLECTION", DEFAULT_COLLECTION)
# Keep byte-bounded text conservative across English and Traditional Chinese.
MAX_EMBEDDING_BYTES = 240
