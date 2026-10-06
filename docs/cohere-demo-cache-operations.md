# Cohere and Demo Answer Cache Operations

This change is prepared for review. No production migration or deployment is performed by the implementation. [PROMTS.md](../PROMTS.md#cohere-migration-and-fixed-demo-answer-cache) is the requirements source.

## Prepared configuration

The ZIP Lambda package uses Bedrock `cohere.embed-multilingual-v3` in `ap-southeast-1`: 1024-dimensional document/query vectors in the distinct `knowledgellm-cohere-v3` collection. Groq still generates answers. Terraform and SAM provision an encrypted DynamoDB `PAY_PER_REQUEST` table with `pk` and `expires_at` TTL. `ANSWER_CACHE_ENABLED` defaults to `false`; `ANSWER_CACHE_TABLE` is supplied only to chat. TTL is 24 hours and the application checks expiry before use; AWS TTL removal is asynchronous. Eligible storage allowances do not guarantee free on-demand requests or a zero AWS bill.

The shared [question catalog](../api/src/knowledgellm/demo_questions.json) preserves the 15 visible questions and stable department IDs. Only trimmed exact catalog text can be cached. The full verified permission scope and document/model/prompt/guardrail versions participate in the key. Cache hits recheck output PII and citations and report this request's generation tokens and estimated Groq inference cost as zero. They still read S3 versions/manifests and DynamoDB and incur applicable API/Lambda/storage costs. Custom questions bypass answer storage. Cache errors fall back to generation; model or index-version errors produce the existing safe unavailable state.

## Gated rollout

1. Obtain separate production rollout approval, verify current Bedrock availability/access in Singapore, provider quotas, DynamoDB costs, and account billing alerts. Build and preserve the **old deployed ZIP artifact and configuration**, including the old `knowledgellm` collection, for rollback. Do not overwrite the only rollback copy with the new package.
2. Review a real Terraform plan against the existing remote state with protected backend credentials. Apply only after approval. The plan changes both ingestion and chat configuration; **do not apply the complete cutover before the new index exists**. Stage a separate temporary ingestion Lambda using the new ZIP, the new model/collection, source bucket, and the documented ingestion IAM; leave the current chat and ingestion deployment intact. SAM is an alternate maintained declaration, not a second stack to deploy alongside Terraform.
3. Use the approved staging Lambda to reindex the six current versioned source objects. Preview offline first:

   ```sh
   rtk python3 scripts/migrate-cohere-index.py --bucket "$DOCUMENTS_BUCKET" --function "$STAGED_INGESTION_FUNCTION"
   ```

   After rollout approval, add `--execute`. That path reads current S3 VersionIds and invokes staged ingestion for those immutable versions. It does not upload/replace source documents, change source metadata, or touch the old vector collection. It validates each completed manifest's document/version/model/collection/chunk count and checks the complete source snapshot again before reporting ready. A changing source requires rerunning; continuous updates may need a brief ingestion change freeze during cutover.
4. Verify the new collection is 1024-dimensional with required department/document/source-version filters and complete manifests for all six latest versions. Run an approved staging chat deployment (cache initially disabled) through the 15 questions and inspect grounded answers, supporting citations, source masking, and department isolation. Completion manifests live at `_indexes/{collection}/{document_id}/{sha256(version_id)}.json`. Events are limited to approved department prefixes so manifest writes do not trigger ingestion.
5. Switch production ingestion and chat together to the new package/collection after the staged index is verified. Keep cache disabled until source-version and security checks pass. The application refuses chat while an authorized current source version lacks a matching completed manifest, even when caching is disabled.
6. Enable `answer_cache_enabled=true` in Terraform (SAM: `AnswerCacheEnabled=true`) only after those checks; review and apply that plan with approval. Run the evaluation tool below and observe content-free metrics. Remove any temporary staging resource through the approved rollout procedure after verification.

The rollout operator needs permission to read current source objects and manifests and invoke/read configuration of the staged ingestion Lambda. Runtime chat receives only its DynamoDB GetItem/PutItem permission and model-scoped Bedrock InvokeModel; ingestion receives model invocation, immutable source reads, and scoped completion-manifest writes. No Redis, NAT, container migration, or Qdrant region change is included.

## Live evaluation and monitoring

The offline default validates catalog/evaluation coverage without network calls:

```sh
rtk python3 scripts/verify-demo-cache.py
```

After deployment approval, set `API_URL` and the three **existing** access tokens (`FINANCE_TOKEN`, `OPERATIONS_TOKEN`, `PEOPLE_TOKEN`) through the shell environment without printing them; add `--execute`. The tool performs 45 API calls: initial and repeated asks for all 15 questions, plus one foreign-department ask per question. It checks expected answer facts, supporting documents, authorized citations, guardrails, repeat cache hits, and zero repeat generation tokens/cost. Fact checks are conservative regex checks; a failure needs human answer review rather than weakening access checks. Output contains question IDs, durations, cache status, and counts only. It never signs in or saves tokens/questions/answers. This does not replace tests for invalid tokens, PII, expiry, document updates, corrupt citations, and provider failures.

Use content-free cache-status counters and stage durations from Lambda logs to compare initial requests and repeats and compute hits / eligible cache requests. Include cache lookup, S3 version checks, embedding, retrieval, generation, and total request durations where present. Confirm repeat hits have no Bedrock/Qdrant/Groq invocation through provider metrics/traces, and exercise a second Lambda execution environment to verify shared persistence. Do not infer a skipped provider call solely from a short latency. Do not promise fixed response time or total request cost from inference-cost telemetry. Operational validation and live latency measurements remain pending until an approved deployment.

## Rollback

Disable answer caching first if cache behavior is suspect. Restore the saved previous Lambda ZIP and environment for both chat and ingestion, including the previous embedding model and `knowledgellm` collection; the new code intentionally no longer contains FastEmbed and cannot be rolled back just by changing its model variable. Keep the new collection/manifests/table for investigation until an explicit cleanup decision. Document updates made after migration must also be indexed by the restored old ingestion path before relying on old answers. Never mix old and new vectors or delete the old collection as part of this implementation.

## Implementation checks

Terraform formatting and `terraform validate` passed with AWS provider 6.67.0. Initial backend initialization failed because Terraform's cached SSO token had expired. Using existing AWS CLI credentials in subprocess memory allowed read-only backend initialization and a plan against current remote state: **1 to add, 7 to change, 0 to destroy**, with caching disabled. No apply, state migration, or credential persistence occurred. The plan includes rebuilt auth ZIP metadata even though its source is unchanged. Repeat the plan with final approved artifacts before deployment. AWS SAM CLI was located at `/tmp/aws-sam-cli-bin/sam`; lint validation passed. Tool dry runs passed without live model/vector requests. Backend **139 tests**, frontend **45 tests**, production build, ZIP packaging, and independent source-review evidence are recorded in [product progress](product-development.md).

Chat reserves time for the existing safe unavailable response using Lambda's remaining-time budget. Each external operation checks that its bounded timeout fits before starting; cache failure still permits ordinary generation if sufficient time remains. Content-free logs include cache outcomes, source-version checks, embedding/retrieval/generation duration, and total latency. These checks do not establish a fixed latency or replace live measurements.
