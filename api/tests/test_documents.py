from dataclasses import dataclass, field

import pytest

from knowledgellm.documents import AuthorizationError, list_documents, open_document


@dataclass
class FakeStorage:
    calls: list[tuple[str, int]]
    reads: list[str] = field(default_factory=list)

    def presigned_get_url(self, key: str, expires_in: int) -> str:
        self.calls.append((key, expires_in))
        return "https://storage.example/signed"

    def read_document(self, key: str, version_id: str | None = None) -> str:
        self.reads.append(key)
        return f"# contents of {key}\n"


def test_listing_contains_only_authorized_document_metadata() -> None:
    documents = list_documents(frozenset({"finance"}))

    assert [(doc.id, doc.title) for doc in documents] == [
        ("finance-q4-budget-overview", "Q4 budget overview"),
        ("finance-expense-policy", "Expense policy"),
    ]


def test_document_open_authorizes_before_storage_and_uses_short_lived_link() -> None:
    storage = FakeStorage(calls=[])

    with pytest.raises(AuthorizationError):
        open_document("people-leave-policy", frozenset({"finance"}), storage)

    assert storage.calls == []
    link = open_document("finance-q4-budget-overview", frozenset({"finance"}), storage)
    assert link.url == "https://storage.example/signed"
    assert storage.calls == [("finance/q4-budget-overview.md", 120)]


def test_s3_document_read_rejects_oversized_sources_before_streaming(monkeypatch) -> None:
    import sys
    from types import SimpleNamespace

    from knowledgellm.documents import MAX_DOCUMENT_BYTES, S3DocumentStorage

    class Body:
        called = False

        def read(self, _limit):
            self.called = True
            return b"too large"

        def close(self):
            pass

    body = Body()

    class Client:
        def get_object(self, **_kwargs):
            return {"ContentLength": MAX_DOCUMENT_BYTES + 1, "Body": body}

    monkeypatch.setitem(sys.modules, "boto3", SimpleNamespace(client=lambda _name, **_kwargs: Client()))
    storage = S3DocumentStorage("private-bucket", Client())

    with pytest.raises(ValueError):
        storage.read_document("finance/q4-budget-overview.md")

    assert not body.called


def test_versioned_document_read_uses_exact_version_and_closes_body():
    import io
    from knowledgellm.documents import S3DocumentStorage

    from pathlib import Path
    contents = (Path(__file__).parents[1] / "src/knowledgellm/sample_docs/finance/expense-policy.md").read_bytes()
    body = io.BytesIO(contents)
    class Client:
        def get_object(self, **kwargs):
            assert kwargs == {"Bucket": "bucket", "Key": "finance/expense-policy.md", "VersionId": "v1"}
            return {"ContentLength": len(contents), "Body": body}
    assert "Corporate Expense Policy" in S3DocumentStorage("bucket", Client()).read_document("finance/expense-policy.md", "v1")
    assert body.closed


def test_s3_verification_connection_has_bounded_timeouts_and_is_reused(monkeypatch):
    import boto3
    from knowledgellm.documents import s3_client

    calls = []
    def create_client(service, **kwargs):
        calls.append((service, kwargs))
        return object()
    monkeypatch.setattr(boto3, "client", create_client)
    s3_client.cache_clear()
    try:
        assert s3_client() is s3_client()
        config = calls[0][1]["config"]
        assert config.connect_timeout == 2
        assert config.read_timeout == 3
        assert config.retries["total_max_attempts"] == 1
    finally:
        s3_client.cache_clear()


@pytest.mark.parametrize("language, key, title", [
    ("en", "finance/expense-policy.md", "Expense policy"),
    ("zh-TW", "finance/expense-policy-ch.md", "費用報銷政策"),
])
def test_document_language_selects_source_without_changing_identity_or_acl(language, key, title):
    from knowledgellm.documents import document_for_key, source_key_for_id
    storage = FakeStorage(calls=[])
    link = open_document("finance-expense-policy", frozenset({"finance"}), storage, language)
    assert (link.id, link.title) == ("finance-expense-policy", title)
    assert storage.calls == [(key, 120)]
    assert source_key_for_id(link.id, language) == key
    assert document_for_key(key).id == link.id
    assert document_for_key(key).title == title
    with pytest.raises(AuthorizationError):
        open_document(link.id, frozenset({"people"}), storage, language)
    assert len(storage.calls) == 1


def test_s3_chinese_markdown_decodes_utf8_and_closes_stream():
    from io import BytesIO
    from knowledgellm.documents import S3DocumentStorage
    text = "費用須於 14 個日曆日內提交。"
    data = text.encode("utf-8")
    body = BytesIO(data)
    class Client:
        def get_object(self, **kwargs):
            assert kwargs == {"Bucket": "existing-bucket", "Key": "finance/expense-policy-ch.md", "VersionId": "zh-version"}
            return {"ContentLength": len(data), "Body": body}
    assert S3DocumentStorage("existing-bucket", Client()).read_document("finance/expense-policy-ch.md", "zh-version") == text
    assert body.closed


def test_markdown_presigned_url_has_utf8_inline_headers_and_short_expiry():
    from knowledgellm.documents import S3DocumentStorage
    class Client:
        def generate_presigned_url(self, operation, Params, ExpiresIn):
            assert operation == "get_object"
            assert Params == {"Bucket": "same-bucket", "Key": "finance/expense-policy-ch.md",
                              "ResponseContentType": "text/plain; charset=utf-8", "ResponseContentDisposition": "inline"}
            assert ExpiresIn == 120
            return "signed-url"
    assert S3DocumentStorage("same-bucket", Client()).presigned_get_url("finance/expense-policy-ch.md", 120) == "signed-url"


@pytest.mark.parametrize("language,key", [
    ("en", "finance/expense-policy.md"), ("zh-TW", "finance/expense-policy-ch.md"),
])
def test_document_open_returns_content_of_the_linked_source(language, key) -> None:
    storage = FakeStorage(calls=[])

    link = open_document("finance-expense-policy", frozenset({"finance"}), storage, language)

    assert link.content == f"# contents of {key}\n"
    assert storage.reads == [key] == [call[0] for call in storage.calls]


@pytest.mark.parametrize("document_id", ["people-leave-policy", "no-such-document"])
def test_document_open_reads_no_content_for_forbidden_or_unknown_documents(document_id) -> None:
    storage = FakeStorage(calls=[])

    with pytest.raises(AuthorizationError):
        open_document(document_id, frozenset({"finance"}), storage)

    assert storage.reads == []


@pytest.mark.parametrize("error", [ValueError("document exceeds the maximum supported size"),
                                   UnicodeDecodeError("utf-8", b"\xff", 0, 1, "invalid start byte"),
                                   TimeoutError("read timed out")])
def test_document_open_keeps_the_link_when_content_cannot_be_read(error, caplog) -> None:
    class UnreadableStorage(FakeStorage):
        def read_document(self, key: str, version_id: str | None = None) -> str:
            raise error
    caplog.set_level("INFO")

    link = open_document("finance-expense-policy", frozenset({"finance"}), UnreadableStorage(calls=[]))

    assert link.url == "https://storage.example/signed"
    assert link.content is None
    assert str(error) not in caplog.text


def test_document_open_makes_no_storage_call_of_any_kind_when_unauthorized() -> None:
    class ForbiddenStorage:
        def __getattr__(self, name: str):
            raise AssertionError(f"storage.{name} must not be used")

    for document_id in ("people-leave-policy", "no-such-document"):
        with pytest.raises(AuthorizationError):
            open_document(document_id, frozenset({"finance"}), ForbiddenStorage())
