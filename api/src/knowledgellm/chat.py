from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from knowledgellm.authz import ALLOWED_DEPARTMENTS
from knowledgellm.documents import document_for_id, list_documents
from knowledgellm.guardrails import Guardrails

NO_SOURCES = "The available documents do not contain enough information to answer."
PII_REFUSAL = "For privacy, remove personal details from the question and try again."


@dataclass(frozen=True)
class RetrievedChunk:
    document_id: str
    title: str
    department: str
    text: str


@dataclass(frozen=True)
class Usage:
    input_tokens: int
    output_tokens: int
    cost_usd: float | None = None


@dataclass(frozen=True)
class Citation:
    document_id: str
    title: str


@dataclass(frozen=True)
class ChatAnswer:
    answer: str
    citations: tuple[Citation, ...]
    usage: Usage | None = None


class Retriever(Protocol):
    def search(self, question: str, departments: frozenset[str]) -> list[RetrievedChunk]: ...


class Generator(Protocol):
    def generate(
        self, question: str, chunks: Sequence[RetrievedChunk]
    ) -> tuple[str, list[str], Usage | None]: ...


def answer_question(
    question: str,
    departments: frozenset[str],
    retriever: Retriever,
    generator: Generator,
    guardrails: Guardrails,
) -> ChatAnswer:
    authorized = departments & ALLOWED_DEPARTMENTS
    if not authorized:
        return ChatAnswer("Your account does not have access to department documents.", ())
    if not question.strip() or len(question) > 4000:
        return ChatAnswer("Enter a question of 1 to 4,000 characters.", ())
    if guardrails.contains_pii(question):
        return ChatAnswer(PII_REFUSAL, ())

    allowed_ids = {document.id for document in list_documents(authorized)}
    retrieved = retriever.search(question.strip(), authorized)
    chunks = [
        RetrievedChunk(
            document_id=chunk.document_id,
            title=chunk.title,
            department=chunk.department,
            text=guardrails.redact(chunk.text),
        )
        for chunk in retrieved
        if chunk.department in authorized and chunk.document_id in allowed_ids
    ]
    if not chunks:
        return ChatAnswer(NO_SOURCES, ())

    answer, cited_ids, usage = generator.generate(question.strip(), chunks)
    if guardrails.contains_pii(answer):
        return ChatAnswer("The answer was blocked because it contained personal information.", ())
    if not answer.strip():
        return ChatAnswer(NO_SOURCES, ())

    valid_ids = {chunk.document_id for chunk in chunks}
    citations: list[Citation] = []
    for document_id in dict.fromkeys(cited_ids):
        document = document_for_id(document_id)
        if document_id in valid_ids and document is not None:
            citations.append(Citation(document_id=document_id, title=document.title))
    if not citations:
        return ChatAnswer(NO_SOURCES, ())
    return ChatAnswer(answer=answer.strip()[:6000], citations=tuple(citations), usage=usage)
