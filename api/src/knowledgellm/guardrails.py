import re
from typing import Protocol

_PII_PATTERNS = (
    re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    re.compile(r"(?<!\w)(?:\+?\d[\d .()-]{7,}\d)(?!\w)"),
)


class Guardrails(Protocol):
    def redact(self, text: str) -> str: ...

    def contains_pii(self, text: str) -> bool: ...


class BasicGuardrails:
    def redact(self, text: str) -> str:
        for pattern in _PII_PATTERNS:
            text = pattern.sub("[REDACTED]", text)
        return text

    def contains_pii(self, text: str) -> bool:
        return any(pattern.search(text) for pattern in _PII_PATTERNS)
