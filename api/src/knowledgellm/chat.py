from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal, Protocol

if TYPE_CHECKING:
    from knowledgellm.index_versions import IndexSnapshot

from knowledgellm.authz import ALLOWED_DEPARTMENTS
from knowledgellm.documents import document_for_id, list_documents
from knowledgellm.guardrails import Guardrails

Language = Literal["en", "zh-TW"]

NO_SOURCES_ZH = "現有文件沒有足夠資訊可以回答此問題。"

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
    guardrail_action: str = "pass"
    retrieved_count: int = 0
    redacted_source_count: int = 0
    cache_status: Literal["hit", "miss", "bypass"] = "bypass"
    cacheable: bool = False
    stage_timings_ms: dict[str, float] = field(default_factory=dict)


class Retriever(Protocol):
    def search(self, question: str, departments: frozenset[str]) -> list[RetrievedChunk]: ...


class VersionedRetriever(Retriever, Protocol):
    def search_snapshot(
        self, question: str, departments: frozenset[str], snapshot: "IndexSnapshot",
    ) -> list[RetrievedChunk]: ...


class Generator(Protocol):
    def generate(
        self, question: str, chunks: Sequence[RetrievedChunk], language: Language = "en"
    ) -> tuple[str, list[str], Usage | None]: ...


def validate_question(
    question: str, departments: frozenset[str], guardrails: Guardrails, language: Language = "en",
) -> ChatAnswer | None:
    if not departments & ALLOWED_DEPARTMENTS:
        return ChatAnswer("您的帳號沒有存取部門文件的權限。" if language == "zh-TW" else "Your account does not have access to department documents.", (), guardrail_action="access_denied")
    if not question.strip() or len(question) > 4000:
        return ChatAnswer("請輸入 1 至 4,000 個字元的問題。" if language == "zh-TW" else "Enter a question of 1 to 4,000 characters.", (), guardrail_action="invalid_question")
    if guardrails.contains_pii(question):
        return ChatAnswer("為保護隱私，請移除問題中的個人資料後再試一次。" if language == "zh-TW" else PII_REFUSAL, (), guardrail_action="question_pii_blocked")
    return None


def answer_question(
    question: str,
    departments: frozenset[str],
    retriever: Retriever,
    generator: Generator,
    guardrails: Guardrails,
    language: Language = "en",
) -> ChatAnswer:
    no_sources = NO_SOURCES_ZH if language == "zh-TW" else NO_SOURCES
    authorized = departments & ALLOWED_DEPARTMENTS
    refusal = validate_question(question, departments, guardrails, language)
    if refusal is not None:
        return refusal

    allowed_ids = {document.id for document in list_documents(authorized)}
    retrieved = retriever.search(question.strip(), authorized)
    redacted_source_count = 0
    chunks: list[RetrievedChunk] = []
    for chunk in retrieved:
        if chunk.department not in authorized or chunk.document_id not in allowed_ids:
            continue
        redacted_text = guardrails.redact(chunk.text)
        redacted_source_count += redacted_text != chunk.text
        chunks.append(
            RetrievedChunk(
                document_id=chunk.document_id,
                title=chunk.title,
                department=chunk.department,
                text=redacted_text,
            )
        )
    if not chunks:
        return ChatAnswer(no_sources, (), guardrail_action="no_sources")

    answer, cited_ids, usage = generator.generate(question.strip(), chunks, language)
    if guardrails.contains_pii(answer):
        return ChatAnswer(
            "回答包含個人資料，因此已遭封鎖。" if language == "zh-TW" else "The answer was blocked because it contained personal information.",
            (),
            usage,
            "answer_pii_blocked",
            len(chunks),
            redacted_source_count,
        )
    if not answer.strip():
        return ChatAnswer(no_sources, (), usage, "empty_answer", len(chunks), redacted_source_count)

    valid_ids = {chunk.document_id for chunk in chunks}
    citations: list[Citation] = []
    for document_id in dict.fromkeys(cited_ids):
        document = document_for_id(document_id, language)
        if document_id in valid_ids and document is not None:
            citations.append(Citation(document_id=document_id, title=document.title))
    if not citations:
        return ChatAnswer(no_sources, (), usage, "invalid_citations", len(chunks), redacted_source_count)
    return ChatAnswer(
        answer=answer.strip()[:6000],
        citations=tuple(citations),
        usage=usage,
        guardrail_action="source_pii_redacted" if redacted_source_count else "pass",
        retrieved_count=len(chunks),
        redacted_source_count=redacted_source_count,
        cacheable=(answer.strip() not in {NO_SOURCES, NO_SOURCES_ZH} and all(doc_id in valid_ids for doc_id in cited_ids)
                   and guardrails.redact(answer) == answer),
    )
