from knowledgellm.guardrails import BasicGuardrails


def test_guardrails_redact_common_pii_before_use_and_detect_it_in_output() -> None:
    guardrails = BasicGuardrails()

    assert guardrails.redact("Contact alex@example.test at 206-555-0148; SSN 123-45-6789") == (
        "Contact [REDACTED] at [REDACTED]; SSN [REDACTED]"
    )
    assert guardrails.contains_pii("Contact alex@example.test")
    assert not guardrails.contains_pii("The sample budget is 8,000 credits.")


def test_phone_number_is_detected_and_redacted() -> None:
    guardrails = BasicGuardrails()

    assert guardrails.redact("Call +1 (206) 555-0148 for help.") == "Call [REDACTED] for help."
