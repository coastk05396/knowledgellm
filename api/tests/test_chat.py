from dataclasses import dataclass

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
        self, question: str, chunks: list[RetrievedChunk]
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
