#!/usr/bin/env python3
"""Reindex approved current S3 versions through a staged ingestion Lambda.

Dry run makes no network calls. --execute requires separately approved deployment.
Never uploads source objects, touches the old collection, or prints source content.
"""
import argparse
import hashlib
import json
from pathlib import Path

COLLECTION = "knowledgellm-cohere-v3"
MODEL = "cohere.embed-multilingual-v3"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--function", required=True, help="Staged ingestion Lambda name")
    parser.add_argument("--region", default="ap-southeast-1")
    parser.add_argument("--execute", action="store_true", help="Permit live indexing/provider calls")
    args = parser.parse_args()
    samples = Path(__file__).resolve().parents[1] / "api/src/knowledgellm/sample_docs"
    keys = sorted(str(path.relative_to(samples)) for path in samples.rglob("*.md"))
    if len(keys) != 12:
        raise SystemExit("Expected exactly twelve approved sample documents")
    if not args.execute:
        print(json.dumps({"mode": "dry_run", "documents": len(keys), "collection": COLLECTION}))
        return

    import boto3

    s3 = boto3.client("s3", region_name=args.region)
    lambdas = boto3.client("lambda", region_name=args.region)
    config = lambdas.get_function_configuration(FunctionName=args.function)
    env = config.get("Environment", {}).get("Variables", {})
    if (env.get("QDRANT_COLLECTION") != COLLECTION
            or env.get("EMBEDDING_MODEL") != MODEL
            or env.get("EMBEDDING_REGION") != "ap-southeast-1"
            or env.get("DOCUMENTS_BUCKET") != args.bucket):
        raise SystemExit("Staged ingestion configuration does not match migration target")
    versions = []
    for key in keys:
        version = s3.head_object(Bucket=args.bucket, Key=key).get("VersionId")
        if not isinstance(version, str) or not version or version == "null":
            raise SystemExit("Every approved document requires a non-null S3 VersionId")
        versions.append((key, version))
    for key, version in versions:
        event = {"source": "aws.s3", "detail-type": "Object Created", "detail": {
            "bucket": {"name": args.bucket}, "object": {"key": key, "version-id": version}}}
        response = lambdas.invoke(FunctionName=args.function, InvocationType="RequestResponse",
                                  Payload=json.dumps(event).encode())
        payload = response["Payload"]
        try:
            result = json.loads(payload.read())
        finally:
            payload.close()
        if response.get("FunctionError") or not isinstance(result.get("indexed_chunks"), int):
            raise SystemExit("Ingestion failed; inspect content-free Lambda metrics")
        document_id = key.removesuffix(".md").removesuffix("-ch").replace("/", "-")
        digest = hashlib.sha256(version.encode()).hexdigest()
        manifest = f"_indexes/{COLLECTION}/{document_id}/{digest}.json"
        manifest_body = s3.get_object(Bucket=args.bucket, Key=manifest)["Body"]
        try:
            indexed = json.loads(manifest_body.read())
        finally:
            manifest_body.close()
        expected = {"document_id": document_id, "version_id": version, "model": MODEL,
                    "collection": COLLECTION, "chunk_count": result["indexed_chunks"]}
        if any(indexed.get(field) != value for field, value in expected.items()):
            raise SystemExit("Index completion manifest does not match migration target")
        if s3.head_object(Bucket=args.bucket, Key=key).get("VersionId") != version:
            raise SystemExit("Source changed during migration; rerun before switching chat")
        print(json.dumps({"document_id": document_id, "indexed_chunks": result["indexed_chunks"],
                          "manifest_verified": True}))
    if any(s3.head_object(Bucket=args.bucket, Key=key).get("VersionId") != version
           for key, version in versions):
        raise SystemExit("Source changed during migration; rerun before switching chat")
    print(json.dumps({"documents": len(versions), "collection": COLLECTION, "ready": True}))


if __name__ == "__main__":
    main()
