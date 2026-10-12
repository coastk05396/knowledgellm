#!/usr/bin/env python3
"""Reindex approved current S3 versions through the existing ingestion Lambda.

Dry run is offline. --execute invokes AWS CLI operations and requires separately
approved deployment. It does not upload source files or modify the old collection.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

COLLECTION = "knowledgellm-qdrant-hybrid-e5-small"
MODEL = "intfloat/multilingual-e5-small"
SPARSE_MODEL = "Qdrant/bm25"
RETRIEVAL = "hybrid-rrf-v1"


def aws_json(*args: str) -> dict[str, object]:
    result = subprocess.run(["aws", *args, "--output", "json"], check=True, capture_output=True, text=True)
    payload = json.loads(result.stdout)
    if not isinstance(payload, dict):
        raise SystemExit("AWS CLI returned an invalid response")
    return payload


def aws_text(*args: str) -> str:
    result = subprocess.run(["aws", *args, "--output", "text"], check=True, capture_output=True, text=True)
    return result.stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--function", required=True, help="Existing ingestion Lambda name")
    parser.add_argument("--region", default="ap-southeast-1")
    parser.add_argument("--execute", action="store_true", help="Permit live indexing/provider calls")
    args = parser.parse_args()
    samples = Path(__file__).resolve().parents[1] / "api/src/knowledgellm/sample_docs"
    keys = sorted(str(path.relative_to(samples)) for path in samples.rglob("*.md"))
    english = {key for key in keys if not key.endswith("-ch.md")}
    translated = {key.removesuffix("-ch.md") + ".md" for key in keys if key.endswith("-ch.md")}
    if len(keys) != 12 or english != translated or len(english) != 6:
        raise SystemExit("Expected six approved English documents and their six Traditional Chinese translations")
    if not args.execute:
        print(json.dumps({"mode": "dry_run", "documents": len(keys), "collection": COLLECTION,
                          "model": MODEL, "sparse_model": SPARSE_MODEL, "retrieval": RETRIEVAL}))
        return

    region = ["--region", args.region]
    config = aws_json("lambda", "get-function-configuration", "--function-name", args.function, *region)
    environment = config.get("Environment")
    env = environment.get("Variables", {}) if isinstance(environment, dict) else {}
    if (env.get("QDRANT_COLLECTION") != COLLECTION or env.get("EMBEDDING_MODEL") != MODEL
            or env.get("DOCUMENTS_BUCKET") != args.bucket):
        raise SystemExit("Ingestion Lambda configuration does not match migration target")

    versions: list[tuple[str, str]] = []
    for key in keys:
        version = aws_text("s3api", "head-object", "--bucket", args.bucket, "--key", key, "--query", "VersionId", *region)
        if not version or version == "null":
            raise SystemExit("Every approved document requires a non-null S3 VersionId")
        versions.append((key, version))

    with tempfile.TemporaryDirectory(prefix="knowledgellm-reindex-") as temporary:
        workdir = Path(temporary)
        for number, (key, version) in enumerate(versions):
            event = {"source": "aws.s3", "detail-type": "Object Created", "detail": {
                "bucket": {"name": args.bucket}, "object": {"key": key, "version-id": version}}}
            event_path = workdir / f"event-{number}.json"
            response_path = workdir / f"response-{number}.json"
            event_path.write_text(json.dumps(event))
            invocation = aws_json(
                "lambda", "invoke", "--function-name", args.function,
                "--invocation-type", "RequestResponse", "--cli-binary-format", "raw-in-base64-out",
                "--payload", f"file://{event_path}", str(response_path), *region,
            )
            result = json.loads(response_path.read_text())
            if invocation.get("FunctionError") or not isinstance(result.get("indexed_chunks"), int):
                raise SystemExit("Ingestion failed; inspect content-free Lambda metrics")
            base_key = key.removesuffix("-ch.md") if key.endswith("-ch.md") else key.removesuffix(".md")
            document_id = base_key.replace("/", "-")
            digest = hashlib.sha256(version.encode()).hexdigest()
            manifest = f"_indexes/{COLLECTION}/{document_id}/{digest}.json"
            manifest_path = workdir / f"manifest-{number}.json"
            subprocess.run([
                "aws", "s3api", "get-object", "--bucket", args.bucket, "--key", manifest,
                str(manifest_path), *region,
            ], check=True, capture_output=True, text=True)
            indexed = json.loads(manifest_path.read_text())
            expected = {"document_id": document_id, "version_id": version, "model": MODEL,
                        "collection": COLLECTION, "sparse_model": SPARSE_MODEL,
                        "retrieval": RETRIEVAL,
                        "vector_schema": {"dense": 384, "sparse": "bm25"},
                        "chunk_count": result["indexed_chunks"]}
            if any(indexed.get(field) != value for field, value in expected.items()):
                raise SystemExit("Index completion manifest does not match migration target")
            if aws_text("s3api", "head-object", "--bucket", args.bucket, "--key", key, "--query", "VersionId", *region) != version:
                raise SystemExit("Source changed during migration; rerun before switching chat")
            print(json.dumps({"document_id": document_id, "indexed_chunks": result["indexed_chunks"],
                              "manifest_verified": True}))
    if any(aws_text("s3api", "head-object", "--bucket", args.bucket, "--key", key, "--query", "VersionId", *region) != version
           for key, version in versions):
        raise SystemExit("Source changed during migration; rerun before switching chat")
    print(json.dumps({"documents": len(versions), "collection": COLLECTION, "model": MODEL,
                      "sparse_model": SPARSE_MODEL, "retrieval": RETRIEVAL, "ready": True}))


if __name__ == "__main__":
    main()
