# KnowledgeLLM Requirements

All product requirements, constraints, acceptance criteria, and future work belong here. Update this file when the intended behavior changes. README owns architecture and setup; `docs/superpowers/plans/` records implementation history and verification evidence; AGENTS owns contributor rules.

## Goal and Scope

Build a responsive, permission-aware document assistant for Alex / Finance, Sam / Operations, and Priya / People. Support department documents, grounded chat, citations, and visible guardrail/token outcomes. Use fictional documents for the public demo. Enterprise SSO, document editing, collaboration, billing, and compliance certification are outside the current scope.

## Authentication and Access

- Preserve one-click persona switching without popups or manual credentials using Cognito `CUSTOM_AUTH`, with Define/Create/Verify challenge Lambda triggers. Cognito issues the access token; no `/demo-token` endpoint or stored demo passwords are required.
- Enable automatic challenge approval only when `DEMO_MODE` is exactly `true`; allowlist Alex, Sam, and Priya and reject unknown users. This grants public access to fictional demo personas, not proof of a visitor's real identity.
- Clear the previous session, conversation, and draft when switching. Restore a valid session after reload; fail closed for missing, invalid, or expired tokens.
- Derive permissions exclusively from verified Cognito access-token groups. Request bodies or browser state cannot grant departments.
- Apply the same policy to document listing, source links, and vector retrieval. Never expose unauthorized document names, counts, contents, or chunks to the browser or inference provider.
- Configure API Gateway JWT validation consistently with the issued access tokens; do not require an OAuth scope absent from those tokens.

## Interface and Chat

- Show `Loading...` in English and `讀取中...` in Traditional Chinese while department documents load; animate the three trailing dots in sequence while keeping a stable accessible status label, and disable animation for reduced motion. Use a compact 32px status row with 16px spacing before the folders.
- Keep the graphite theme, department accents, responsive desktop/sidebar and mobile/accordion layouts, keyboard focus, reduced motion, descriptive icon labels, and 44px touch targets.
- On mobile, fit all three compact persona cards without horizontal scrolling, including the active verification label. Place the question composer and access caption above the PII guardrail/token-cost panel; use compact line spacing and room for two input lines.
- Use the persona cards as the sign-in entry points on mobile and desktop; omit the separate initial Sign in button and Cognito username/password instruction.
- On mobile, keep the verification dot inline with the centered first line of its label, and give the Department Folders heading 20px of space above it.
- While an answer is pending, animate the source-checking star and trailing dots on desktop and mobile. Keep a stable accessible status message and disable animation when reduced motion is requested.
- After authentication and successful authorized document listing, show a small green `AWS Cognito Verified` line under the active name and a success toast. Remove its folder lock, display its document count, and expand its files. Keep other folders locked; clear verification on switching or listing failure.
- Provide five document-based question buttons and two guardrail demonstration questions per authorized department instead of the identity introduction and permission badges. Include English and Traditional Chinese versions of every question. Guardrail examples contain clearly fictional email addresses or phone numbers and must trigger question PII blocking before retrieval or generation; label their fictional/demo purpose. Keep these examples outside the original 15-question persistent cache catalog. Clicking fills and focuses the composer without submitting; disable during pending requests and clear on switching or New chat.
- Open documents and citations through authorized, short-lived S3 links. Preserve the conversation when opening a source.
- Answer only from authorized supporting documents. If evidence is insufficient, state that the available documents do not contain enough information; do not invent facts or citations.
- Preserve conversation on provider errors and show a retryable unavailable state without leaking protected text.

## Backend, Infrastructure, and Cost Constraints

- Use React/Vite/TypeScript, Python 3.12 Lambda, API Gateway HTTP API, private encrypted/versioned S3, EventBridge ingestion, multilingual Qdrant Cloud Inference embeddings, department-filtered Qdrant, and Groq generation.
- Declare AWS resources and changes in `infra/terraform/`; keep maintained SAM configuration consistent. Use remote state and review plans for drift and unintended resources.
- Chunk source text conservatively with trusted department/source metadata; create required Qdrant filter indexes. Use Qdrant Cloud Inference's free multilingual `intfloat/multilingual-e5-small` model (384 dimensions) for both documents and questions in a separate model-specific collection. Retain ZIP Lambda packaging; do not download or package FastEmbed/ONNX embedding dependencies.
- Keep provider keys backend-only in SSM Parameter Store SecureString. Never commit credentials or put secrets in frontend variables.
- Minimize demo cost through eligible free allowances and request-based services. Avoid always-on compute, NAT gateways, provisioned concurrency, and other fixed charges. Free eligibility and quotas must be checked for the target account; a zero bill is not guaranteed.
- Use seven-day CloudWatch log retention and billing alerts. Record latency, token usage, guardrail outcomes, and configured inference-cost estimates without raw questions, answers, document excerpts, or PII. Estimated inference cost is not an invoice or total AWS cost.
- Block PII in questions/output and mask retrieved-source PII before generation. Current regex coverage is common email, phone, and US SSN patterns, not comprehensive detection. Treat source text as data, not instructions; validate citations against authorized context.
- Display backend guardrail outcomes explicitly: pending, passed, question/output blocked, source masked, unavailable. Missing status must never imply success; missing usage/rates means cost unavailable.

## Qdrant Cloud Inference and Fixed Demo Answer Cache

- Share one JSON catalog of exactly 15 stable-ID suggested questions (five each for Finance, Operations, People). Match only exact text after trimming leading/trailing whitespace; preserve case and internal whitespace. Custom questions use normal retrieval/generation and never store answers.
- Reindex all twelve approved English/Traditional Chinese S3 Markdown document versions into the separate 384-dimensional `knowledgellm-qdrant-multilingual-e5-small` Qdrant collection for `intfloat/multilingual-e5-small`; never mix embedding dimensions/models or delete the old collection during migration. Reuse Qdrant and Groq service clients. Free-model inference is hosted in the US; the public demo corpus is fictional and sensitive data is out of scope.
- Use one encrypted DynamoDB on-demand table (`pk` string, TTL attribute `expires_at`) for cross-Lambda answer sharing. Cache items expire after 86,400 seconds; check expiry at read time because TTL deletion is asynchronous. Enable with `ANSWER_CACHE_ENABLED=true` only after migration verification; default is disabled. No Redis, embedding cache, or container migration.
- Validate verified login, full authorized department scope, and question PII before any cache read. Key includes fixed question ID/text, full scope, indexed document-version fingerprint, embedding/generation models, collection, prompt version, and guardrail version.
- Store only successful grounded answers with valid authorized citations and passed or safely masked PII outcomes. Never store tokens, presigned links, errors, refusals, or answers without valid sources. Recheck output PII and citation permission on hits.
- Compare current S3 VersionId with completion manifests at `_indexes/{collection}/{document_id}/{sha256(version_id)}.json`; fail unavailable during incomplete indexing rather than serving stale content. Verify versions again before storing a generated answer.
- Fail open from DynamoDB faults to ordinary Qdrant Cloud Inference/Qdrant/Groq processing; retain the safe unavailable behavior for Qdrant faults.
- Preserve `/chat` fields and add `cache_status: hit | miss | bypass`. A hit reports current generation tokens and estimated Groq inference cost as zero; AWS request/storage/embedding costs and free-tier eligibility remain separate.
- Log cache outcomes and per-stage durations without question, answer, source content, or login tokens; compare actual first-request versus hit latency without guaranteed timings.
- Grant chat only GetItem/PutItem on its cache table. Grant ingestion only the required versioned source reads and completion-manifest writes; retain existing authorization, PII, and citation safeguards.
- Deliver code, tests, migration tooling, documentation, and a separate signed PR to `main`; keep UI PR #14 separate. Production deployment needs separate approval. Preserve prior deployment artifact and old collection for rollback; do not move Qdrant region or move generation from Groq to Bedrock.

## Acceptance Criteria

- [x] All three demo personas receive real Cognito tokens and see only their two permitted sample documents; other folders remain locked.
- [x] One-click switching, green verification, success toast, folder expansion, and session restoration work without frontend passwords.
- [x] `DEMO_MODE=false` and unknown users reject custom sign-in.
- [x] Authorized sample chat returns a grounded answer and working citation; input PII refusal reports its outcome.
- [ ] Verify the 15 catalog questions in both languages retrieve supporting sources from all twelve Markdown versions and preserve department isolation; verify repeat answers across Lambda environments make no embedding/vector/generation calls.
- [ ] Cover invalid tokens, PII, expiry, updated documents, invalid citations, and DynamoDB/Qdrant failures; run frontend/backend tests, frontend build, Terraform validation/plan, and available SAM validation.
- [ ] Recheck cross-department chat, source masking, output blocking, provider failures, and missing telemetry in the deployed demo.
- [ ] Verify the complete keyboard and desktop/mobile journey on the public frontend.

Completed entries reflect recorded implementation evidence, not fresh checks for this documentation change. See the [custom-auth verification record](docs/superpowers/plans/2026-10-06-cognito-custom-demo-auth.md) and [prototype history](docs/superpowers/plans/2026-10-06-knowledgellm-full-stack-prototype.md).

## Deployment and Demo Checklist

- [ ] Reconfirm account allowances, provider quotas/data handling, billing alerts, and current usage before additional deployment.
- [ ] Deploy the frontend to Cloudflare Pages using README setup instructions; configure public frontend variables and matching API CORS/authentication origins.
- [ ] Attach the custom domain and verify DNS, HTTPS, sign-in, source links, and cited chat.
- [ ] Run the remaining acceptance checks above; inspect CloudWatch and billing after the demo.
- [ ] Add GitHub Actions CI/CD and regression checks.
- [ ] Add approved fictional department documents and offline RAG quality evaluation, such as Ragas. Real confidential data requires a separate security/data-handling review.
- [ ] When retiring the demo, remove Pages/DNS, document versions and AWS resources using README cleanup instructions, then remove external provider keys and Qdrant resources.

## Future: Cloudflare Turnstile

- [ ] Add a frontend widget, preserving one-click switching when a valid token is ready; send the token as the custom challenge answer.
- [ ] Verify with Cloudflare Siteverify inside VerifyAuthChallengeResponse; validate hostname/action and reject missing, expired, replayed, invalid tokens and provider failures.
- [ ] Keep only the site key public and the secret backend-only; declare configuration in Terraform and confirm current Free-plan limits before enabling.
- [ ] Retain Cognito quotas and cost monitoring. Frontend-only checks are bypassable; Turnstile cannot guarantee zero bots or eliminate all request costs. Demo personas remain public.

The all-AWS managed architecture in README is an undeployed reference option, not the selected low-cost demo or authorization to provision it.

## Traditional Chinese and Markdown Sources

- Provide complete English and Traditional Chinese (`zh-TW`) interfaces, including authentication states, department names, document/citation titles, suggested questions, errors, and telemetry labels.
- Match the résumé site's grouped `EN` / `CH` language buttons, indicate the active language accessibly, persist the selection, and update the document language. Preserve the current graphite design and responsive layout.
- Maintain six complete Traditional Chinese translations beside the six original English Markdown sources. Use `-ch.md` filenames, such as `finance/expense-policy-ch.md`, preserving every fact, number, rule, and fictional-data notice.
- Store all twelve Markdown sources in the existing private S3 documents bucket under the existing department prefixes. Do not use PDF artifacts for ingestion or source links. Previously uploaded PDF objects may remain as unused history; do not delete runtime objects without an explicit cleanup instruction.
- Send the selected language with document-list, document-open, and chat requests; default older clients to English. Chinese listings, folder source links and citation links must open the matching `-ch.md`; English opens the original `.md`.
- Use language-specific immutable source-version snapshots for retrieval and answer caching, retaining stable logical document IDs, verified department permissions, and safe unavailable behavior for incomplete indexes. Generate grounded answers and guardrail refusals in the selected language.
- Switching languages refreshes document listing, prevents stale responses or URLs from opening the wrong variant, and preserves conversation messages.
- Verify all twelve live S3 Markdown objects and source contents, both-language authorized source/citation links, cross-department denial, responsive persisted toggle behavior, bilingual index isolation and Chinese cited chat/refusals.

Acceptance status is recorded in the [Markdown correction record](docs/superpowers/plans/2026-10-07-traditional-chinese-markdown.md). This supersedes the earlier PDF interpretation.
