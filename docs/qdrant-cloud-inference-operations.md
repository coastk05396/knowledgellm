# Qdrant Hybrid Search and Demo Cache Operations

This guide describes the rollout and rollback for the hybrid retrieval implementation. The deployed dense-only collection remains intact as the rollback target. All vector and answer-cache fingerprints are tied to the hybrid collection and retrieval version.

## Runtime configuration

Chat and ingestion use `knowledgellm-qdrant-hybrid-e5-small`, with a named 384-dimensional cosine dense vector from `intfloat/multilingual-e5-small` and a server-side `Qdrant/bm25` sparse vector using IDF. Retrieval submits both named vectors as filtered prefetches and fuses their rankings with RRF. Both prefetches carry the same authorized department and immutable source-version filters. Groq remains the answer-generation provider.

The twelve fictional Markdown objects (six English and six Traditional Chinese) are indexed into this new collection. The existing dense-only collection stays available and is never reused for hybrid vectors. Verify that the current Qdrant cluster supports the two inference models and hybrid Query API before indexing; the account's model/cluster plan may affect availability and cost.

## In-place migration and cutover

Use the existing ingestion Lambda and existing Qdrant cluster; do not create another Lambda or delete the old collection. Keep chat pointed at its current dense-only collection while indexing. The cache remains disabled until chat cutover is verified.

1. Build the ZIP package and deploy it to the existing ingestion Lambda only. Keep the existing knowledge Lambda package and configuration untouched during indexing: its current code validates the old dense-only manifests, while the hybrid code requires hybrid manifests. Do not run a normal full Terraform or SAM deployment before migration and evaluation pass.

   Use the same account-specific Terraform variable inputs as the normal deployment. First review the targeted plan and confirm that it updates the Lambda artifact and ingestion function only; then apply that saved plan:

   ```sh
   rtk bash scripts/package-lambdas.sh
   rtk terraform -chdir=infra/terraform plan \
     -target=aws_lambda_function.ingestion \
     -out=/tmp/knowledgellm-ingestion.tfplan \
     -var-file=terraform.tfvars
   rtk terraform -chdir=infra/terraform show /tmp/knowledgellm-ingestion.tfplan
   rtk terraform -chdir=infra/terraform apply /tmp/knowledgellm-ingestion.tfplan
   ```

   If the local variable file has a different name, pass that file instead. The targeted apply is only for this staging phase; do not use it as a substitute for the final full plan review.
2. Preview the twelve-object migration offline. This script uses the AWS CLI and does not require local boto3:

   ```sh
   rtk python3.12 scripts/migrate-qdrant-inference-index.py \
     --bucket "$DOCUMENTS_BUCKET" \
     --function "$INGESTION_FUNCTION"
   ```

   After the targeted ingestion deployment is verified, add `--execute`. The script reads current S3 VersionIds, invokes the existing ingestion Lambda for each approved object, and verifies each completion manifest's collection, source version, dense model, sparse model, vector schema, and retrieval version. It also confirms that source VersionIds remained unchanged. It does not upload source objects, write to the old collection, or expose document content in its output.
3. Confirm all twelve manifests under `_indexes/knowledgellm-qdrant-hybrid-e5-small/`. The ingestion Lambda's collection validation must reject missing or mismatched named vectors; a completion manifest is written only after all chunks for that S3 version are indexed.
4. Evaluate all 15 demo questions in English and Traditional Chinese. Check supporting sources, citations, PII masking, authorized department isolation, exact source-version filtering, split-query handling, and rankings against the dense-only baseline. Do not claim a retrieval improvement until the same reviewed relevance set has been compared.
5. After indexing and evaluation pass, run and inspect a full Terraform plan using the account's normal variable inputs. Apply only if it updates the existing knowledge function to the hybrid collection without replacing unrelated resources. This is the first step that updates the knowledge Lambda package and collection; it also reconciles ingestion with the same hybrid configuration. The old collection remains untouched for rollback.
6. Enable `ANSWER_CACHE_ENABLED=true` in that reviewed final plan only after chat cutover checks pass. The on-demand DynamoDB cache stores eligible answers for exactly the 15 trimmed catalog questions, partitioned by complete department scope, language, source-version fingerprint, dense/sparse models, collection, prompt/guardrail, and hybrid retrieval version. Items are logically expired after 300 seconds; read-time expiry is authoritative because DynamoDB TTL deletion is asynchronous. Cache hits still check current S3 versions, DynamoDB, PII, and citation permissions and incur applicable AWS request/storage costs. Custom questions bypass caching.

## Rollback

Disable answer caching first if cache behavior is suspect. Restore the prior Lambda package and matching dense-only collection/configuration for both chat and ingestion. Keep the hybrid collection and manifests while investigating; cleanup requires a separate decision. Re-index later source versions through the restored dense-only path before relying on it. Never mix dense-only and hybrid vectors or serve a cache entry fingerprinted for another retrieval version.

## Verification status

Local implementation tests and infrastructure validation should be recorded in [product development](product-development.md). Live Qdrant inference, twelve-object indexing, bilingual retrieval-quality checks, cache-hit verification, and production deployment require runtime evidence from the deployed account; code-level checks alone do not establish those results.
