# Qdrant Cloud Inference and Demo Answer Cache Operations

This is a staged implementation guide; it does not deploy or migrate production. Requirements are maintained in [PROMTS.md](../PROMTS.md#qdrant-cloud-inference-and-fixed-demo-answer-cache).

## Selected provider configuration

The ZIP Lambdas send English and Traditional Chinese document/query text to Qdrant Cloud Inference using the free multilingual `intfloat/multilingual-e5-small` model (384 dimensions) and the separate `knowledgellm-qdrant-multilingual-e5-small` collection. Qdrant Cloud Inference automatically applies the model's query and passage prefixes. Groq remains the answer-generation provider. The old collection is preserved for rollback; vectors from different models must never be mixed.

Enable Cloud Inference in the cluster's Qdrant Cloud Console before testing. The screenshot showed a managed Free cluster in `us-east-1`; Qdrant lists multilingual E5 small as free on free-tier clusters. Free model inference is hosted in the US. This demo uses fictional documents only. Check Qdrant's [current model and region details](https://qdrant.tech/documentation/cloud/inference/) before using another plan or data class.

The 24-hour DynamoDB answer cache remains disabled until the new index is verified. It only stores grounded answers for the 15 exact trimmed suggested questions. Cache hits still check current S3 versions and DynamoDB and incur applicable AWS request/storage costs.

## Staged index migration

1. Obtain separate deployment approval. Preserve the currently deployed ZIP and collection for rollback. Do not apply the full Terraform cutover before indexing the new collection.
2. Enable Qdrant Cloud Inference on the managed cluster. Build and deploy the new package to a temporary ingestion Lambda configured with `QDRANT_COLLECTION=knowledgellm-qdrant-multilingual-e5-small`, `EMBEDDING_MODEL=intfloat/multilingual-e5-small`, the source bucket, and the existing Qdrant/Groq secret references. Keep the currently deployed chat and ingestion Lambdas intact.
3. Preview the twelve-object migration offline (six English files and six `-ch.md` translations). This script uses AWS CLI and does not require local boto3:

   ```sh
   rtk python3.12 scripts/migrate-qdrant-inference-index.py \
     --bucket "$DOCUMENTS_BUCKET" \
     --function "$STAGED_INGESTION_FUNCTION"
   ```

   After deployment approval, add `--execute`. The script reads current S3 VersionIds, invokes only the staged Lambda, verifies each completion manifest and source version, and never writes source objects or touches the old collection.
4. Verify all twelve current S3 versions are indexed in the 384-dimensional collection with department, document, and source-version payload indexes. Test all 15 catalog questions in English and Traditional Chinese, grounded citations, source masking, and department isolation on staging while the cache remains disabled.
5. Apply a reviewed Terraform/SAM cutover for chat and ingestion together. Keep answer caching disabled until the staged checks pass; then enable `ANSWER_CACHE_ENABLED=true` through a separate reviewed deployment. Test cache hits from separate Lambda environments and confirm they skip Qdrant and Groq.

Completion manifests use `_indexes/{collection}/{document_id}/{sha256(version_id)}.json`. If a source changes mid-migration, rerun the migration before cutover. Ingestion events only match the approved department prefixes, so manifest writes do not retrigger ingestion.

## Rollback

Disable answer caching first if cache behavior is suspect. Restore the saved previous Lambda package and its matching collection/configuration for both chat and ingestion. Keep the new collection and manifests for investigation until cleanup is separately decided. Re-index later S3 document versions with the restored embedding path before relying on the old collection. Never mix the old and new embedding vectors.

## Verification status

Automated test/build and infrastructure validation results for this implementation are recorded in [product development](product-development.md). Live Qdrant inference, twelve-object indexing, bilingual retrieval-quality checks, and production deployment remain pending separate rollout approval.
