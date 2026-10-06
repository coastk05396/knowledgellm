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
| Separate signed PR | Coordinator | Ready for submission; no deployment or merging |

Decisions: DynamoDB on-demand with 24-hour read-checked expiry; cache gate defaults off; exact trimmed question matching; S3-version completion manifests; separate 1024-dimensional Qdrant collection; Groq remains the generator. The UI continues displaying the same 15 questions.

Verification: Python 3.12 backend suite **139 passed**; frontend suite **45 passed** across eight files; type-checked production build and changed-file Prettier checks passed. Terraform formatting/validation and SAM lint validation passed. A read-only plan against the existing remote state passed: **1 add, 7 changes, 0 destroys**, with caching disabled. Terraform's stale SSO cache was bridged using existing AWS CLI credentials only in subprocess memory; no credentials were printed or saved. Rebuilt ZIP is **105.4 MiB** uncompressed, includes the shared catalog, and excludes FastEmbed/ONNX. Migration/evaluation dry runs cover six document keys and 15 questions (45 planned requests). `git diff --check` passed.

Independent review: the read-only reviewer approved the source change after rereading fixes for the verifier's token fields, provider timeouts/request budget, and frontend enum validation. Reviewer checks were source inspection and diff checks; tests/builds above were run by builders/coordinator. See [review evidence](cohere-demo-cache-review.md). Initial provider/version writes preceded the later test-first instruction; subsequent corrective behavior included observed failing-to-passing tests.

No AWS deployment, index migration, cache enabling, or live Bedrock/Qdrant/Groq calls occurred. All 15 live retrieval/grounding checks, invocation metrics, a second Lambda environment, and actual latency measurements remain pending approved rollout. The remote plan includes rebuilt standalone auth ZIP metadata; authentication source/behavior is unchanged. See [migration operations](cohere-demo-cache-operations.md) for the gated rollout and rollback procedure.
