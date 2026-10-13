from dataclasses import dataclass

import pytest

from knowledgellm.chat import RetrievedChunk, Usage, answer_question
from knowledgellm.guardrails import BasicGuardrails


@dataclass
class FakeRetriever:
    chunks: list[RetrievedChunk]
    calls: int = 0

    def search(self, question: str, departments: frozenset[str]) -> list[RetrievedChunk]:
        self.calls += 1
        assert question == "What changed?"
        return self.chunks


@dataclass
class FakeGenerator:
    citations: list[str]
    calls: int = 0
    received_departments: list[str] | None = None
    received_texts: list[str] | None = None
    answer: str = "Vendor costs changed."

    def generate(
        self, question: str, chunks: list[RetrievedChunk], language="en"
    ) -> tuple[str, list[str], Usage | None]:
        self.calls += 1
        self.received_departments = [chunk.department for chunk in chunks]
        self.received_texts = [chunk.text for chunk in chunks]
        return self.answer, self.citations, Usage(input_tokens=20, output_tokens=8)


def test_chat_filters_unauthorized_chunks_and_validates_citations() -> None:
    retriever = FakeRetriever(
        [
            RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", "Vendor costs changed."),
            RetrievedChunk("people-leave-policy", "Leave policy", "people", "unrelated restricted text"),
        ]
    )
    generator = FakeGenerator(citations=["finance-q4-budget-overview", "people-leave-policy", "fake-id"])

    answer = answer_question("What changed?", frozenset({"finance"}), retriever, generator, BasicGuardrails())

    assert generator.received_departments == ["finance"]
    assert [citation.document_id for citation in answer.citations] == ["finance-q4-budget-overview"]
    assert answer.usage == Usage(input_tokens=20, output_tokens=8)


def test_no_authorized_sources_returns_refusal_without_generation() -> None:
    retriever = FakeRetriever([])
    generator = FakeGenerator(citations=[])

    answer = answer_question("What changed?", frozenset({"finance"}), retriever, generator, BasicGuardrails())

    assert "not contain enough information" in answer.answer
    assert generator.calls == 0


def test_pii_is_redacted_before_generation_and_output_with_pii_is_blocked() -> None:
    retriever = FakeRetriever(
        [RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", "Vendor costs changed.")]
    )
    generator = FakeGenerator(citations=["finance-q4-budget-overview"])

    answer = answer_question(
        "What changed for alex@example.test?", frozenset({"finance"}), retriever, generator, BasicGuardrails()
    )

    assert answer.answer == "For privacy, remove personal details from the question and try again."
    assert answer.guardrail_action == "question_pii_blocked"
    assert generator.calls == 0


def test_pii_in_generated_answer_is_blocked() -> None:
    retriever = FakeRetriever(
        [RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", "Vendor costs changed.")]
    )
    generator = FakeGenerator(
        citations=["finance-q4-budget-overview"], answer="Contact alex@example.test about vendor costs."
    )

    answer = answer_question("What changed?", frozenset({"finance"}), retriever, generator, BasicGuardrails())

    assert answer.answer == "The answer was blocked because it contained personal information."
    assert answer.citations == ()
    assert answer.guardrail_action == "answer_pii_blocked"


def test_retrieved_chunks_are_redacted_before_generation() -> None:
    retriever = FakeRetriever(
        [
            RetrievedChunk(
                "finance-q4-budget-overview",
                "Q4 budget overview",
                "finance",
                "Contact analyst@example.test after checking vendor costs.",
            )
        ]
    )
    generator = FakeGenerator(citations=["finance-q4-budget-overview"])

    answer = answer_question("What changed?", frozenset({"finance"}), retriever, generator, BasicGuardrails())

    assert generator.received_texts == ["Contact [REDACTED] after checking vendor costs."]
    assert answer.guardrail_action == "source_pii_redacted"
    assert answer.redacted_source_count == 1


def test_uncited_or_unknown_document_ids_are_not_returned_as_answers() -> None:
    retriever = FakeRetriever(
        [RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", "Vendor costs changed.")]
    )
    generator = FakeGenerator(citations=["untrusted-unknown"])

    answer = answer_question("What changed?", frozenset({"finance"}), retriever, generator, BasicGuardrails())

    assert answer.answer == "The available documents do not contain enough information to answer."
    assert answer.citations == ()


def test_traditional_chinese_no_sources_and_pii_refusals() -> None:
    from knowledgellm.chat import NO_SOURCES_ZH

    generator = FakeGenerator(citations=[])
    answer = answer_question("What changed?", frozenset({"finance"}), FakeRetriever([]), generator, BasicGuardrails(), "zh-TW")
    assert answer.answer == NO_SOURCES_ZH
    answer = answer_question("alex@example.test", frozenset({"finance"}), FakeRetriever([]), generator, BasicGuardrails(), "zh-TW")
    assert answer.answer == "為保護隱私，請移除問題中的個人資料後再試一次。"
    assert generator.calls == 0


def test_chat_forwards_requested_language_to_generation() -> None:
    class ChineseGenerator:
        def generate(self, question, chunks, language="en"):
            assert language == "zh-TW"
            return "供應商費用已變更。", ["finance-q4-budget-overview"], None

    result = answer_question("What changed?", frozenset({"finance"}), FakeRetriever([
        RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", "Vendor costs changed.")
    ]), ChineseGenerator(), BasicGuardrails(), "zh-TW")
    assert result.answer == "供應商費用已變更。"


def _source_chunks(document_id: str, key: str, language: str = "en") -> tuple[str, list[RetrievedChunk]]:
    """Chunk a real sample document exactly as ingestion does."""
    from importlib.resources import files

    from knowledgellm.documents import document_for_id
    from knowledgellm.embedding import split_embedding_text
    from knowledgellm.ingest import chunk_markdown

    content = files("knowledgellm").joinpath("sample_docs", key).read_text(encoding="utf-8")
    document = document_for_id(document_id, language)
    assert document is not None
    parts = [part for chunk in chunk_markdown(content) for part in split_embedding_text(chunk)]
    return content, [RetrievedChunk(document_id, document.title, document.department, part) for part in parts]


@pytest.mark.parametrize("language,key", [
    ("en", "finance/expense-policy.md"), ("zh-TW", "finance/expense-policy-ch.md"),
])
def test_citation_excerpt_is_a_verbatim_passage_of_the_served_document(language, key) -> None:
    content, chunks = _source_chunks("finance-expense-policy", key, language)
    for ranked_first in chunks:
        generator = FakeGenerator(citations=["finance-expense-policy"])

        answer = answer_question(
            "What changed?", frozenset({"finance"}), FakeRetriever([ranked_first, *chunks]), generator,
            BasicGuardrails(), language,
        )

        excerpt = answer.citations[0].excerpt
        if excerpt is None:
            assert all(len(line.strip()) < 12 for line in ranked_first.text.split("\n"))
            continue
        assert len(excerpt) >= 12 and excerpt in content and excerpt in ranked_first.text
        assert excerpt == excerpt.strip() and "\n" not in excerpt and len(excerpt) <= 300


def test_citation_excerpt_is_capped_and_keeps_inner_whitespace() -> None:
    long_line = "Vendor  costs\tchanged " * 20
    chunk = RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", f"# Heading\n{long_line}\n")

    answer = answer_question(
        "What changed?", frozenset({"finance"}), FakeRetriever([chunk]),
        FakeGenerator(citations=["finance-q4-budget-overview"]), BasicGuardrails(),
    )

    excerpt = answer.citations[0].excerpt
    assert excerpt is not None and len(excerpt) <= 300
    assert long_line.startswith(excerpt) and "Vendor  costs\tchanged" in excerpt


def test_citation_excerpt_is_omitted_when_the_top_chunk_was_redacted() -> None:
    retriever = FakeRetriever([
        RetrievedChunk("people-employee-handbook", "Employee handbook", "people",
                       "Reach out to people-help@northstar.internal.\nOffice hours are 9 to 5."),
        RetrievedChunk("people-employee-handbook", "Employee handbook", "people", "Badges are required on site."),
        RetrievedChunk("people-leave-policy", "Leave policy", "people", "Leave accrues monthly."),
    ])
    generator = FakeGenerator(citations=["people-employee-handbook", "people-leave-policy"])

    answer = answer_question("What changed?", frozenset({"people"}), retriever, generator, BasicGuardrails())

    assert answer.guardrail_action == "source_pii_redacted"
    assert [(c.document_id, c.excerpt) for c in answer.citations] == [
        ("people-employee-handbook", None), ("people-leave-policy", "Leave accrues monthly."),
    ]


def test_citation_excerpt_is_omitted_for_blank_chunks() -> None:
    chunk = RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", " \n\t\n")

    answer = answer_question(
        "What changed?", frozenset({"finance"}), FakeRetriever([chunk]),
        FakeGenerator(citations=["finance-q4-budget-overview"]), BasicGuardrails(),
    )

    assert answer.citations[0].excerpt is None


@pytest.mark.parametrize("text,expected", [
    ("期。", None),
    ("期。\n## 標題\n- 短", None),
    ("ok\nEleven char\n", None),
    ("期。\n員工每年享有十四天的特別休假。\n## 標題", "員工每年享有十四天的特別休假。"),
    ("al.\nTwelve chars\n", "Twelve chars"),
])
def test_citation_excerpt_must_be_long_enough_to_identify_a_passage(text, expected) -> None:
    chunk = RetrievedChunk("finance-q4-budget-overview", "Q4 budget overview", "finance", text)

    answer = answer_question(
        "What changed?", frozenset({"finance"}), FakeRetriever([chunk]),
        FakeGenerator(citations=["finance-q4-budget-overview"]), BasicGuardrails(),
    )

    assert answer.citations[0].excerpt == expected
