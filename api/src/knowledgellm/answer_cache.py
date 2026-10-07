"""Persistent cache for the exact, authorized demo-question catalog."""
import hashlib
import json
import os
import time
from collections.abc import Callable
from functools import lru_cache
from importlib.resources import files
from typing import Any, Protocol

from knowledgellm.chat import ChatAnswer, Citation, Language
from knowledgellm.request_budget import require_time

CACHE_TTL_SECONDS = 86_400
# Bump these when the prompt, guardrail rules, or retrieval behavior changes.
PROMPT_VERSION = "sources-json-language-v2"
GUARDRAIL_VERSION = "basic-pii-v1"
RETRIEVAL_VERSION = "cohere-versioned-v1"


class AnswerCache(Protocol):
    def get(self, key: str) -> ChatAnswer | None: ...
    def put(self, key: str, answer: ChatAnswer) -> None: ...


@lru_cache(maxsize=1)
def demo_questions() -> tuple[dict[str, str], ...]:
    return tuple(json.loads(files("knowledgellm").joinpath("demo_questions.json").read_text()))


def demo_question_id(question: str, departments: frozenset[str], language: Language = "en") -> str | None:
    return next((item["id"] for item in demo_questions()
                 if item["question_zh" if language == "zh-TW" else "question"] == question.strip() and item["department"] in departments), None)


def cache_key(question_id: str, departments: frozenset[str], index_fingerprint: str, language: Language = "en") -> str:
    identity = {
        "question_id": question_id,
        "language": language,
        "catalog": demo_questions(),
        "departments": sorted(departments),
        "index": index_fingerprint,
        "embedding_model": os.getenv("EMBEDDING_MODEL", "cohere.embed-multilingual-v3"),
        "generation_model": os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
        "collection": os.getenv("QDRANT_COLLECTION", "knowledgellm-cohere-v3"),
        "prompt": PROMPT_VERSION,
        "guardrail": GUARDRAIL_VERSION,
        "retrieval": RETRIEVAL_VERSION,
    }
    return hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class DynamoAnswerCache:
    def __init__(self, table_name: str, client: Any, clock: Callable[[], float] = time.time) -> None:
        self.table_name = table_name
        self.client = client
        self.clock = clock

    def get(self, key: str) -> ChatAnswer | None:
        require_time(3)
        item = self.client.get_item(TableName=self.table_name, Key={"pk": {"S": key}},
                                    ConsistentRead=True).get("Item")
        if not item:
            return None
        try:
            if int(item["expires_at"]["N"]) <= self.clock():
                return None
            payload = json.loads(item["payload"]["S"])
            answer = payload["answer"]
            ids = payload["citation_ids"]
            action = payload["guardrail_action"]
            retrieved_count = payload["retrieved_count"]
            redacted_count = payload["redacted_source_count"]
            if (payload.get("schema") != 1 or not isinstance(answer, str)
                or not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids)
                or len(ids) != len(set(ids)) or action not in {"pass", "source_pii_redacted"}
                or type(retrieved_count) is not int or not 1 <= retrieved_count <= 5
                or type(redacted_count) is not int or not 0 <= redacted_count <= retrieved_count
                or (action == "source_pii_redacted") != (redacted_count > 0)):
                return None
            return ChatAnswer(answer, tuple(Citation(i, "") for i in ids),
                              guardrail_action=action, retrieved_count=retrieved_count,
                              redacted_source_count=redacted_count, cacheable=True)
        except (KeyError, ValueError, TypeError):
            return None

    def put(self, key: str, answer: ChatAnswer) -> None:
        require_time(3)
        # Store no original usage, credentials, titles, URLs, or source excerpts.
        payload = {
            "schema": 1,
            "answer": answer.answer,
            "citation_ids": [citation.document_id for citation in answer.citations],
            "guardrail_action": answer.guardrail_action,
            "retrieved_count": answer.retrieved_count,
            "redacted_source_count": answer.redacted_source_count,
        }
        self.client.put_item(TableName=self.table_name, Item={
            "pk": {"S": key},
            "expires_at": {"N": str(int(self.clock()) + CACHE_TTL_SECONDS)},
            "payload": {"S": json.dumps(payload, separators=(",", ":"))},
        })


@lru_cache(maxsize=1)
def create_answer_cache() -> AnswerCache | None:
    table_name = os.getenv("ANSWER_CACHE_TABLE")
    if os.getenv("ANSWER_CACHE_ENABLED", "false") != "true" or not table_name:
        return None
    import boto3
    from botocore.config import Config

    client = boto3.client("dynamodb", config=Config(
        connect_timeout=1, read_timeout=1, retries={"total_max_attempts": 1, "mode": "standard"},
    ))
    return DynamoAnswerCache(table_name, client)
