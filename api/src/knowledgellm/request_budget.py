"""Reserve time for a safe HTTP response before starting external chat operations."""
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

_deadline: ContextVar[float | None] = ContextVar("chat_deadline", default=None)


@contextmanager
def chat_deadline(seconds: float) -> Iterator[None]:
    token = _deadline.set(time.monotonic() + max(0, min(seconds, 25)))
    try:
        yield
    finally:
        _deadline.reset(token)


def require_time(seconds: float) -> None:
    deadline = _deadline.get()
    if deadline is not None and deadline - time.monotonic() <= seconds:
        raise TimeoutError("insufficient time for assistant operation")
