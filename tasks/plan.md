# Implementation Plan: Hybrid Qdrant Search and Five-Minute Demo Cache

## Overview

Extend the current dense-only multilingual Qdrant retrieval to combine dense `intfloat/multilingual-e5-small` vectors with server-side BM25 sparse vectors using Reciprocal Rank Fusion (RRF). Index the twelve current English and Traditional Chinese sources into a new collection, validate retrieval and isolation, then enable the existing DynamoDB answer cache with a five-minute logical expiry. Show `Cached Hit` / `快取命中` for cache-served answers and green `Unlocked` / `已解鎖` beside the authenticated folder owner.

## Architecture Decisions

- Use a separate `knowledgellm-qdrant-hybrid-e5-small` collection with named `dense` and `bm25` vectors. Keep the existing dense-only collection untouched for rollback.
- Store dense vectors through Qdrant Cloud Inference with `intfloat/multilingual-e5-small` (384 dimensions, cosine); store sparse vectors through the server-side `Qdrant/bm25` model with IDF enabled. Do not add FastEmbed, ONNX Runtime, Torch, Transformers, or another local model package.
- Search with two `models.Prefetch` branches (`using="dense"` and `using="bm25"`), carrying the authorized department and exact S3 source-version filter in both branches, then fuse with `models.FusionQuery(fusion=models.Fusion.RRF)`. Keep the existing text splitting, deduplication, grounding, citation, and PII checks.
- Include target collection, dense and sparse models, and retrieval/fusion version in answer-cache identity. Do not reuse dense-only cache entries.
- Set logical answer expiry to 300 seconds and enforce it in application reads. DynamoDB TTL deletion is asynchronous; expired entries become unreadable at five minutes but physical deletion may occur later.
- Preserve Terraform's cache-disabled default. Enable through an explicit reviewed deployment input only after hybrid indexing and chat cutover are verified.
- Show a bilingual cache badge only for `/chat` `cache_status="hit"`; show green folder-owner unlocked text only after successful Cognito authentication and authorized document loading.

## Task List

### Phase 1: Hybrid Collection and Ingestion

- [x] Task 1: Change the dedicated collection default and define/validate the named dense and sparse vector schema. Update ingestion to upsert both `models.Document` vectors per chunk and retain payload metadata. Add focused schema, mismatch, and upsert tests.

**Files:** `api/src/knowledgellm/embedding.py`, `api/src/knowledgellm/providers.py`, `api/tests/test_providers.py`.

### Phase 2: Hybrid Retrieval

- [x] Task 2: Implement dense and BM25 prefetch branches with the same department and version filters and RRF fusion. Adapt split-query batching while preserving deterministic deduplication and final top-`limit` behavior. Test branch models/names, filters, fusion, batches, and snapshot filtering.

**Files:** `api/src/knowledgellm/providers.py`, `api/tests/test_providers.py`.

### Phase 3: Versioning, Cache Identity, and Operations

- [x] Task 3: Update Terraform and maintained SAM collection configuration and adjust the migration tool's target validation/output for the new hybrid collection. Preserve the source-version manifest checks and add checks for both vector schemas.

**Files:** `infra/terraform/main.tf`, `template.yaml`, `scripts/migrate-qdrant-inference-index.py`, focused migration tests.

- [x] Task 4: Bump the retrieval/cache fingerprint for hybrid search, explicitly include sparse-model/fusion identity, and change the TTL to 300 seconds. Test distinct dense-only versus hybrid keys and expiry just before/at/after the boundary.

**Files:** `api/src/knowledgellm/answer_cache.py`, `api/tests/test_answer_cache.py`, `api/tests/test_cache_chat.py`.

- [x] Task 5: Update user-facing architecture/operations docs for dense+sparse RRF, the new collection, migration/cutover order, and five-minute logical cache expiry.

**Files:** `README.md`, `docs/qdrant-cloud-inference-operations.md`.

### Phase 4: UI Statuses

- [x] Task 6: Render accessible `Cached Hit` / `快取命中` beside the assistant label only on explicit cache hits. Test hit, miss, bypass, missing status, and both languages.

**Files:** `web/src/components/ChatPanel.tsx`, `web/src/app/language.tsx`, `web/src/styles/app.css`, `web/src/components/ChatPanel.test.tsx`.

- [x] Task 7: Render green `Unlocked` / `已解鎖` text beside the owner name for the authenticated persona only after its authorized document list succeeds. Keep the document count/expand control; test peer lock state and identity/list-failure reset.

**Files:** `web/src/components/DepartmentFolders.tsx`, `web/src/app/Workspace.test.tsx`, `web/src/app/language.tsx` if accessible copy is needed, and minimal shared CSS if needed.

### Checkpoint: Local Verification

- [x] Run focused backend provider/cache tests, then the full backend suite: **175 passed** using Python 3.14 and isolated test dependencies; Python 3.12 compileall passed because pytest is unavailable on the installed Python 3.12.
- [x] Run frontend tests and production build: **61 passed** and production build passed.
- [x] Run Terraform format/validate, migration dry-run, and `git diff --check`. SAM CLI is unavailable in this environment.
- [x] Compare expected supporting-source coverage for the same 30 bilingual queries: dense-only **30/30**, hybrid **30/30** at top five. This does not establish a ranking improvement.

### Phase 5: Indexed Cutover and Cache Enablement

- [x] Task 8: Verified the existing Qdrant cluster supports both Cloud Inference models and hybrid Query API. Deployed only the existing ingestion Lambda for staging while chat remained on the old collection.
- [x] Reindexed all twelve current S3 Markdown versions. Both named vectors, all completion manifests, unchanged S3 VersionIds, and department/version filters were verified.
- [x] Compared dense-only and hybrid retrieval on all 15 fixed questions in English and Traditional Chinese. Expected supporting sources appeared in the top five for all 30 cases in both collections. Live authenticated checks also verified citations, department isolation, and a Traditional Chinese People answer. No ranking improvement is claimed.
- [x] After the user-authorized cutover, switched chat to the hybrid collection while retaining the old collection. Live API health, grounded citations, version filters, and the rollback collection were verified.
- [x] Enabled `ANSWER_CACHE_ENABLED=true` after hybrid chat checks. Live requests showed a miss followed by a hit with zero generation tokens and cost; six concurrent repeats also hit the shared cache. Unit tests verify the 300-second logical expiry. DynamoDB's physical TTL deletion is asynchronous.
- [ ] Deploy the frontend separately and verify both bilingual status labels in the hosted UI. This checkout has no frontend hosting resource or deployment workflow; frontend tests and production build pass.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Hybrid search changes rankings | Incorrectly grounded or less relevant answers | Evaluate dense and hybrid on the same reviewed bilingual relevance set before chat cutover |
| Filter omitted from one prefetch | Unauthorized or stale candidates may enter fusion | Assert department and exact source-version filters are present on both branches and retain post-retrieval validation |
| Free-cluster/model support differs by account | Migration may fail or incur an unexpected charge | First smoke-test both model IDs and hybrid query on the existing cluster; stop before reindex/cutover if unsupported |
| Sparse schema is mixed with old dense collection | Invalid writes or incompatible queries | Use a new named-vector collection; never mutate or delete the old collection in this rollout |
| DynamoDB TTL physical deletion is delayed | Expired records remain stored after five minutes | Enforce expiry at read time and test the application boundary; treat DynamoDB cleanup as eventual |

## Open Questions / Gates

- Resolved: the existing cluster accepted both server-side models and returned live hybrid results. No cluster upgrade or new Qdrant resource was used.
- AWS staging, migration, chat cutover, and cache enablement were explicitly authorized and completed on existing resources. The previous dense-only collection remains available for rollback.

## References

- Qdrant [hybrid search and RRF](https://qdrant.tech/documentation/search-tuning/hybrid-search/) documents named dense/sparse vectors, IDF, prefetch, RRF, and the need to evaluate ranking quality on a labeled query set; its server-side BM25 example requires Qdrant v1.15.3 or later.
- Qdrant [Cloud Inference model availability](https://qdrant.tech/documentation/cloud/inference/) lists multilingual E5 small and BM25, including their hosted-model availability and cost notes.
- Qdrant [Cloud Inference hybrid tutorial](https://qdrant.tech/documentation/tutorials-basics/cloud-inference-hybrid-search/) documents server-generated dense/BM25 vectors, named-vector schema and hybrid RRF query shape.
