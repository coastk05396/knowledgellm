import io
import json

import pytest

from knowledgellm.index_versions import IndexUnavailable, S3IndexVersions, manifest_key


class Storage:
    def __init__(self):
        self.version = "v1"
        self.manifests = {}
        self.heads = []

    def head_object(self, **kwargs):
        self.heads.append(kwargs["Key"])
        return {"VersionId": self.version}

    def put_object(self, **kwargs):
        self.manifests[kwargs["Key"]] = kwargs["Body"]

    def get_object(self, **kwargs):
        return {"Body": io.BytesIO(self.manifests[kwargs["Key"]])}


def indexed():
    storage = Storage()
    versions = S3IndexVersions("bucket", storage)
    for doc in ("finance-expense-policy", "finance-q4-budget-overview"):
        versions.complete(doc, "v1", 3)
    return storage, versions


def test_snapshot_contains_only_authorized_documents_and_changes_on_update():
    storage, versions = indexed()
    snapshot = versions.current(frozenset({"finance"}))
    assert set(snapshot.versions) == {"finance-expense-policy", "finance-q4-budget-overview"}
    assert all(key.startswith("finance/") for key in storage.heads)
    manifest = json.loads(storage.manifests[manifest_key(versions.collection, "finance-expense-policy", "v1")])
    assert manifest["sparse_model"] == "Qdrant/bm25"
    assert manifest["retrieval"] == "hybrid-rrf-v1"
    assert manifest["vector_schema"] == {"dense": 384, "sparse": "bm25"}
    assert S3IndexVersions("bucket", storage).current(frozenset({"finance"})).fingerprint == snapshot.fingerprint
    storage.version = "v2"
    assert not versions.is_current(snapshot, frozenset({"finance"}))
    with pytest.raises(IndexUnavailable):
        versions.current(frozenset({"finance"}))
    for doc in snapshot.versions:
        versions.complete(doc, "v2", 3)
    assert versions.current(frozenset({"finance"})).fingerprint != snapshot.fingerprint


@pytest.mark.parametrize("field,value", [
    ("model", "legacy-model"), ("collection", "legacy"), ("sparse_model", "legacy-model"),
    ("retrieval", "dense-v1"), ("vector_schema", {"dense": 384}),
    ("version_id", "old"), ("chunk_count", -1),
])
def test_incompatible_completion_manifest_fails_closed(field, value):
    storage, versions = indexed()
    key = manifest_key(versions.collection, "finance-expense-policy", "v1")
    manifest = json.loads(storage.manifests[key])
    manifest[field] = value
    storage.manifests[key] = json.dumps(manifest).encode()
    with pytest.raises(IndexUnavailable):
        versions.current(frozenset({"finance"}))


def test_unversioned_source_and_s3_errors_fail_closed():
    storage, versions = indexed()
    storage.version = "null"
    with pytest.raises(IndexUnavailable):
        versions.current(frozenset({"finance"}))
    storage.version = "v1"
    storage.manifests.clear()
    with pytest.raises(IndexUnavailable):
        versions.current(frozenset({"finance"}))


def test_selected_language_checks_only_its_sources_and_isolates_snapshots():
    class BilingualStorage(Storage):
        def head_object(self, **kwargs):
            self.heads.append(kwargs["Key"])
            return {"VersionId": "zh-v1" if kwargs["Key"].endswith("-ch.md") else "en-v1"}
    storage = BilingualStorage()
    versions = S3IndexVersions("same-bucket", storage)
    for doc in ("finance-expense-policy", "finance-q4-budget-overview"):
        versions.complete(doc, "en-v1", 3)
        versions.complete(doc, "zh-v1", 3)
    english = versions.current(frozenset({"finance"}), "en")
    assert storage.heads == ["finance/q4-budget-overview.md", "finance/expense-policy.md"]
    storage.heads.clear()
    chinese = versions.current(frozenset({"finance"}), "zh-TW")
    assert storage.heads == ["finance/q4-budget-overview-ch.md", "finance/expense-policy-ch.md"]
    assert english.versions == {"finance-q4-budget-overview": "en-v1", "finance-expense-policy": "en-v1"}
    assert chinese.versions == {"finance-q4-budget-overview": "zh-v1", "finance-expense-policy": "zh-v1"}
    assert english.fingerprint != chinese.fingerprint
    assert versions.is_current(chinese, frozenset({"finance"}), "zh-TW")
    assert not versions.is_current(chinese, frozenset({"finance"}), "en")
    del storage.manifests[manifest_key(versions.collection, "finance-expense-policy", "zh-v1")]
    with pytest.raises(IndexUnavailable):
        versions.current(frozenset({"finance"}), "zh-TW")
    assert versions.is_current(english, frozenset({"finance"}), "en")
