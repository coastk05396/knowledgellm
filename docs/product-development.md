# Product Development

| Document | Purpose |
| --- | --- |
| [PROMTS.md](../PROMTS.md) | All requirements, constraints, acceptance criteria, and deployment/demo TODOs |
| [README.md](../README.md) | Introduction, architecture diagrams, setup and cleanup instructions |
| [AGENTS.md](../AGENTS.md) | Contributor and coding-agent rules |
| [Implementation history](superpowers/plans/2026-10-06-knowledgellm-full-stack-prototype.md) | Historical work and verification evidence |
| [Custom-auth record](superpowers/plans/2026-10-06-cognito-custom-demo-auth.md) | Cognito implementation and live verification evidence |

Rick defines the requirements in PROMTS.md; implementers update agreed changes and record evidence in the plans. Keep requirements in one place and link to them from other documents.

## Cohere Embeddings and Fixed Demo Cache — 2026-10-07

Brief: implement the approved [requirements](../PROMTS.md#cohere-migration-and-fixed-demo-answer-cache) in an isolated branch, keep visible question labels, verify failure states, and submit an independent signed PR. Production deployment remains separately gated.

| Task | Owner | Status |
| --- | --- | --- |
| Cohere provider, version-scoped ingestion, reusable clients | Backend builder | Implemented and verified |
| Authorized fixed-question cache and security/behavior tests | Coordinator | Implemented and verified |
| Shared catalog, Terraform/SAM, migration and operations tools | Infrastructure builder | Implemented and verified |
| Integration and complete tests/build | Coordinator | Verified |
| Independent source review | Product reviewer | Approved for PR preparation; corrected findings reread |
| Separate signed PR | Coordinator | Submitted as [PR #15](https://github.com/coastk05396/knowledgellm/pull/15); no deployment or merging |

Decisions: DynamoDB on-demand with 24-hour read-checked expiry; cache gate defaults off; exact trimmed question matching; S3-version completion manifests; separate 1024-dimensional Qdrant collection; Groq remains the generator. The UI continues displaying the same 15 questions.

Verification: Python 3.12 backend suite **139 passed**; frontend suite **45 passed** across eight files; type-checked production build and changed-file Prettier checks passed. Terraform formatting/validation and SAM lint validation passed. A read-only plan against the existing remote state passed: **1 add, 7 changes, 0 destroys**, with caching disabled. Terraform's stale SSO cache was bridged using existing AWS CLI credentials only in subprocess memory; no credentials were printed or saved. Rebuilt ZIP is **105.4 MiB** uncompressed, includes the shared catalog, and excludes FastEmbed/ONNX. Migration/evaluation dry runs cover six document keys and 15 questions (45 planned requests). `git diff --check` passed.

Independent review: the read-only reviewer approved the source change after rereading fixes for the verifier's token fields, provider timeouts/request budget, and frontend enum validation. Reviewer checks were source inspection and diff checks; tests/builds above were run by builders/coordinator. See [review evidence](cohere-demo-cache-review.md). Initial provider/version writes preceded the later test-first instruction; subsequent corrective behavior included observed failing-to-passing tests.

Delivery: implementation commit `2c660cc` has a locally verified SSH signature and was pushed in PR #15 targeting `main`. The original UI worktree stayed clean and on its existing branch. Generated packages, Terraform initialization files, and credentials are excluded from Git.

No AWS deployment, index migration, cache enabling, or live Bedrock/Qdrant/Groq calls occurred. All 15 live retrieval/grounding checks, invocation metrics, a second Lambda environment, and actual latency measurements remain pending approved rollout. The remote plan includes rebuilt standalone auth ZIP metadata; authentication source/behavior is unchanged. The Cohere-specific rollout was superseded by the current [Qdrant Cloud Inference migration operations](qdrant-cloud-inference-operations.md).

## Traditional Chinese Markdown Correction

The user clarified that the sources must be translated Markdown (`-ch.md`), not PDFs. Backend owns translations, Markdown storage/catalog, language-specific index versions, migration tooling and tests. Frontend owns language-aware listing/source requests and stale-response protection. Coordinator owns requirements, live S3 upload, deployment, integrated browser verification and PR updates. The existing EN/CH interface stays in place.

Markdown correction is implemented and deployed: all twelve real S3 source downloads, language selection, inline UTF-8 display, and department isolation are verified. Backend 167 tests and frontend 52 tests pass; production build passes. Local and Cloudflare Chrome checks confirm Sam opens actual Chinese -ch.md in CH and original English .md in EN. Bedrock remains NOT_AUTHORIZED; indexing and grounded chat remain unverified. See the [correction record](superpowers/plans/2026-10-07-traditional-chinese-markdown.md).

## Bilingual Guardrail Suggestions

Scope: add two fictional PII demonstration questions per department in English and Traditional Chinese alongside the existing five document questions. Preserve existing click-to-fill, focus, busy-state, department authorization and the original 15-question cache catalog. No changes to guardrail rules or AWS deployment are needed.

Ownership: frontend builder owns frontend data, rendering and interaction tests; coordinator owns requirements, real API/browser verification and PR delivery; product reviewer independently reviews the integrated change.

Verification: backend 167 tests, frontend 58 tests and production build pass. Coordinator submitted all twelve exact EN/CH samples to the deployed API as their department personas; each returned localized `question_pii_blocked`, no citations and cache bypass. Real Chrome repeated all six department/language journeys: seven visible suggestions, both samples fill/focus without submitting, explicit sends receive the actual guardrail refusal, no browser errors. Operations CH screenshots cover 1440px and 390px with no horizontal overflow. Existing backend catalog remains exactly fifteen questions.

Independent reviewer: APPROVED, no actionable findings; 23 focused frontend tests passed, all twelve samples independently verified to refuse before provider/index/cache initialization, backend catalog byte-identical, and both screenshots reviewed. Review base `3f25e2948b0670143aab8ab3da90ad1f35b6a7a6`, captured file-set SHA256 `34ade96f9124dac648db42d0b76483972730bcd0d0996fe05993a93d9527c6c2`. Delivered through existing PR #17; no additional AWS deployment or merge.

## Qdrant Cloud Inference — 2026-10-12

Replace the unsupported local FastEmbed attempt and unauthorized Bedrock embedding invocation with Qdrant Cloud Inference's multilingual `intfloat/multilingual-e5-small` model. English and Traditional Chinese sources use the model-specific 384-dimensional `knowledgellm-qdrant-multilingual-e5-small` collection. Existing S3-version manifests and department/source checks remain in place; the old collection is retained. Migration tooling previews six English Markdown documents and their six `-ch.md` translations, then can invoke a separately staged ingestion Lambda and verify each version manifest. The fixed-question DynamoDB cache remains governed by the existing requirements and rollout gate.

Verification on this branch: backend **167 passed**; frontend **58 passed** with Node's `--localstorage-file` option, production build passed, Terraform formatting/validation passed, SAM lint validation passed, ZIP packaging completed at **105.7 MiB** uncompressed, and the migration dry run reported all **12** documents with the expected model and collection. No final Terraform plan was run because this isolated checkout did not contain the existing deployment's variable values. No AWS infrastructure was applied, no S3 objects or Qdrant collections were changed, and no live model inference or retrieval-quality evaluation was run. The user's Bedrock `NOT_AUTHORIZED` status and agreement state motivated moving embeddings to Qdrant; no Bedrock agreement or authorization was changed.

PR #19 follow-up: independent code review and the limited shared-configuration/splitter simplification were **APPROVED**. The web performance auditor approved the bounded source/artifact and mobile lab audit. Five isolated cold runs measured median LCP **1,288 ms**, CLS **0.0000282**, first CH click **120 ms** and return EN click **40 ms** under 4× CPU slowdown and 150 ms latency; these are lab samples, not field INP or deployed chat latency. Backend **167 tests**, frontend **58 tests**, production build and production dependency audit passed. Web implementation was retained because no failing measured metric justified additional auth/render complexity. Detailed provenance, decisions and rollout limits are in the [review and performance record](qdrant-review-performance.md).
