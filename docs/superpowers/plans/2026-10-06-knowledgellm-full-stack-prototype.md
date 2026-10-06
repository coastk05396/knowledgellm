# KnowledgeLLM Full-Stack Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local runnable, responsive KnowledgeLLM prototype with Cognito username/password login, department-scoped document access, and cited answers.

**Architecture:** See the [product spec](../specs/2026-10-06-knowledgellm-design.md#architecture) for the current deployment design. The implemented Vite React app uses Cognito managed login authorization-code flow with PKCE and calls an API Gateway HTTP API. The API trusts only API Gateway JWT-authorizer claims, applies department policy before S3 reads or Qdrant retrieval, and passes authorized chunks through PII and grounding guardrails before Groq generation. A separate S3-triggered Lambda indexes synthetic Markdown samples into Qdrant.

**Tech Stack:** TypeScript, React, Vite, `oidc-client-ts`; Python 3.12, pytest, boto3, FastEmbed, Qdrant client, Groq SDK; Terraform for AWS deployment (the initial implementation used SAM); Vitest and Testing Library for web.

**Spec:** [KnowledgeLLM design](../specs/2026-10-06-knowledgellm-design.md)

**Status:** Tasks 1–6 record the completed initial implementation, including historical SAM work. Terraform is the current deployment path; use [README](../../../README.md#aws-prototype-setup-with-terraform) for commands. Public deployment remains pending.

## Global Constraints

- Never handle or store Cognito passwords in the web app; use Cognito managed login with authorization-code flow and PKCE.
- Derive access only from verified API Gateway JWT claims; ignore user-supplied department, role, identity, and filters.
- Do not reveal unauthorized document names/counts, read their content, retrieve their chunks, or send them to Groq.
- Keep S3 private and authorize before returning a short-lived object URL.
- Use synthetic documents; never add secrets or real personal/company data.
- Fail closed when authentication, authorization, PII checks, retrieval, or provider calls fail.
- Do not provision cloud resources; deployment instructions must state configuration and cost review requirements.
- Match the supplied references and support keyboard use, reduced motion, and 44px touch targets.

## Review Focus

- Missing, malformed, or empty Cognito groups: return no protected documents and do not query providers.
- Forged department in query/body: ignore it and use only authorizer groups.
- Empty or malformed document contents and prompt injection in retrieved content: refuse unsupported answers; never treat source text as instructions.
- PII-like user input and provider output: redact/block before generation/output and never log raw prompts or chunks.
- Provider timeout, rate limit, and missing usage fields: return retryable safe errors and show cost as unavailable.

---

### Task 1: Project Scaffold and Synthetic Content

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`
- Create: `web/src/main.tsx`, `web/src/app/App.tsx`, `web/src/app/config.ts`
- Create: `web/src/test/setup.ts`, `web/src/app/App.test.tsx`
- Create: `api/pyproject.toml`, `api/src/knowledgellm/__init__.py`
- Create: `api/src/knowledgellm/sample_docs/finance/*.md`, `api/src/knowledgellm/sample_docs/operations/*.md`, `api/src/knowledgellm/sample_docs/people/*.md`
- Create: `template.yaml`, `.env.example`
- Modify: `AGENTS.md`

**Interfaces:**
- Produces npm scripts `dev`, `build`, `test`; Python package `knowledgellm`; SAM template with API and ingestion functions.
- Sample documents: Q4 budget overview, Expense policy; Runbook & procedures, Service handoff; Employee handbook, Leave policy. Every sample uses fictional details.

- [x] Write failing smoke tests proving the web shell renders and each department has exactly two fictional sample documents.
- [x] Run `npm test` in `web/` and `python -m pytest` in `api/`; confirm the new tests fail before implementation. (Python 3.12 is installed without pip/venv; used Python 3.14 with pytest isolated under `/tmp`.)
- [x] Scaffold typed web and Python 3.12 packages, sample Markdown and SAM resources without AWS credentials.
- [x] Run web tests/build and backend tests; confirm they pass locally.
- [x] Update `AGENTS.md` commands and established module paths.
- [x] Commit as `feat: scaffold KnowledgeLLM prototype` (`cf5efc0`).

### Task 2: Department Authorization and Document API

**Files:**
- Create: `api/src/knowledgellm/authz.py`, `api/src/knowledgellm/documents.py`, `api/src/knowledgellm/handler.py`
- Create: `api/tests/test_authz.py`, `api/tests/test_documents.py`, `api/tests/test_handler.py`
- Modify: `template.yaml`

**Interfaces:**
- `departments_for_claims(claims: Mapping[str, object]) -> frozenset[str]` recognizes only exact Cognito groups `finance`, `operations`, `people`.
- `list_documents(departments: frozenset[str]) -> list[DocumentSummary]` lists only authorized metadata.
- `open_document(document_id: str, departments: frozenset[str], storage: DocumentStorage) -> DocumentLink` authorizes before generating a short-lived URL.
- `handler(event: dict[str, object], context: object) -> dict[str, object]` serves `GET /documents`, `GET /documents/{id}`, and health status from API Gateway v2 events.

- [x] Write tests for valid, absent, malformed, and unknown group claims; forged request `department` values; cross-group IDs; private-link TTL.
- [x] Run focused pytest and confirm failure.
- [x] Implement allowlisted group mapping, S3 key mapping, and authorization-before-storage access.
- [x] Configure API Gateway JWT authorizer with Cognito issuer/audience parameters; avoid public document routes.
- [x] Run `python -m pytest`; confirm unauthorized paths never call storage (7 tests pass).
- [x] Commit as `feat: enforce department scoped document access` (`acdade7`).

### Task 3: Ingestion, Retrieval, Guardrails, and Cited Chat

**Files:**
- Create: `api/src/knowledgellm/ingest.py`, `api/src/knowledgellm/retrieval.py`, `api/src/knowledgellm/guardrails.py`, `api/src/knowledgellm/chat.py`, `api/src/knowledgellm/providers.py`
- Create: `api/tests/test_ingest.py`, `api/tests/test_retrieval.py`, `api/tests/test_guardrails.py`, `api/tests/test_chat.py`
- Modify: `template.yaml`, `api/pyproject.toml`

**Interfaces:**
- `chunk_markdown(text: str, max_chars: int = 1200, overlap: int = 150) -> list[str]` creates bounded overlapping chunks.
- `department_filter(departments: frozenset[str]) -> dict[str, object]` creates exact Qdrant payload filtering.
- `answer_question(question: str, departments: frozenset[str], retriever: Retriever, generator: Generator, guardrails: Guardrails) -> ChatAnswer` returns grounded text, citations, and optional usage/cost metadata.
- `ingest_s3_object(event: Mapping[str, object], storage: DocumentStorage, index: VectorIndex, embedder: Embedder) -> int` chunks and indexes Markdown with immutable department/source metadata.

- [x] Write tests proving index metadata derives from trusted S3 key mappings, query uses exact allowlisted department filters, unauthorized chunks never reach generation, unsupported questions return no uncited facts, PII fails closed, and provider errors do not leak input.
- [x] Run focused pytest and confirm failure.
- [x] Implement pure policy/guardrail logic and injected FastEmbed/Qdrant/Groq/S3 adapters.
- [x] Return only citations for chunks actually included in authorized context. Report cost only when usage and configured rates are present.
- [x] Run all backend tests, including empty/no-source and timeout cases (28 pass).
- [x] Commit as `feat: add guarded retrieval and cited answers` (`09169a8`).

Ruling: Qdrant document IDs are opaque single path segments while S3 keys retain department paths; this avoids encoded-slash routing ambiguity in API Gateway. S3 ingestion uses EventBridge notifications instead of an S3 Lambda notification to avoid a same-template bucket/function dependency cycle.

### Task 4: Cognito Flow and Screenshot-Led Responsive UI

**Files:**
- Create: `web/src/auth/auth.ts`, `web/src/auth/AuthProvider.tsx`, `web/src/components/IdentityPicker.tsx`, `web/src/components/DepartmentFolders.tsx`, `web/src/components/ChatPanel.tsx`, `web/src/components/Composer.tsx`, `web/src/components/SystemMonitor.tsx`, `web/src/styles/tokens.css`, `web/src/styles/app.css`
- Create: `web/src/auth/auth.test.ts`, `web/src/components/IdentityPicker.test.tsx`, `web/src/components/DepartmentFolders.test.tsx`, `web/src/components/ChatPanel.test.tsx`
- Modify: `web/src/app/App.tsx`, `web/src/app/config.ts`, `web/src/app/App.test.tsx`, `web/package.json`

**Interfaces:**
- `signIn(returnTo?: string): Promise<void>` redirects to Cognito managed login using OIDC code+PKCE and `prompt=login` after explicit account switch.
- `switchIdentity(): Promise<void>` clears chat/query cache and local tokens before Cognito logout and fresh sign-in.
- `loadDocuments(accessToken: string): Promise<DocumentSummary[]>`; `askQuestion(accessToken: string, question: string): Promise<ChatAnswer>`.
- Department identity is rendered from verified API response/token claims; identity cards initiate sign-in and never mutate department state.

- [x] Test login redirect configuration, switch clearing state and requiring fresh login, authorized-folder visibility, citation interactions, loading/error/empty states, and keyboard controls.
- [x] Confirm tests fail, then implement the screenshot-led layout, provided color tokens, responsive styles, accessible icon labels, and API-backed chat/doc browsing.
- [x] At 390px show scrollable identity cards and stacked monitor; at desktop show left folder sidebar and centered conversation. Never show unauthorized document titles/counts.
- [x] Run `npm test` (15 tests) and `npm run build` in `web/`; confirm pass.
- [x] Commit as `feat: build responsive cognito knowledge interface` (`0287266`).

### Task 5: Setup, Deployment Guidance, and End-to-End Local Verification

**Files:**
- Create: `README.md`, `api/tests/test_acceptance.py`
- Create or modify: `docs/product-development.md`, `docs/superpowers/plans/2026-10-06-knowledgellm-full-stack-prototype.md`, `.gitignore`, `.env.example`, `template.yaml`

**Interfaces:**
- Document required environment variables, local mock/test commands, Cognito app-client configuration, S3/Qdrant/Groq setup, and SAM deployment commands. No secrets appear in examples.
- Provide a demo fixture mode for local tests only; it cannot be enabled in production builds or substitute for Cognito claims in deployment.

- [x] Add acceptance coverage for Alex/Finance, Sam/Operations, and Priya/People, forged department denial, cited Q4 chat, account switching, and narrow layout (`api/tests/test_acceptance.py`, `web/src/app/Workspace.test.tsx`).
- [x] Run full web/backend verification and record exact results; `cfn-lint template.yaml` passes. `sam validate` is unavailable because AWS SAM CLI is not installed.
- [x] Audit configuration: examples contain blank credentials, S3 public access is blocked, and no demo identity grants access.
- [x] Update product status, unresolved configuration requirements, commands, evidence, and next action.
- [x] Commit as `docs: document local setup and prototype deployment`.

### Task 6: Independent Review Follow-up and Final Verification

**Files:**
- Modify: `template.yaml`, `api/src/knowledgellm/handler.py`, `api/src/knowledgellm/providers.py`, and focused API/web tests.
- Modify: `web/src/app/App.tsx`, `web/src/components/Composer.tsx`, related UI copy/styles, and product verification notes.

- [x] Add Cognito managed-login branding and require scoped access tokens at protected API routes.
- [x] Create Qdrant keyword indexes for department and document filters before retrieval or replacement.
- [x] Keep the current chat visible when citations open; preserve IME composition in the message composer.
- [x] Refine identity/status/citation UI to match desktop and mobile references while keeping unauthorized document metadata hidden.
- [x] Confirm regression tests fail before fixes and pass after: web 18 tests; API 37 tests.
- [x] Verify frontend production build, Prettier, npm audit, SAM lint validation, and SAM build.
- [x] Push the signed feature branch and open [PR #1](https://github.com/coastk05396/knowledgellm/pull/1) against the published `main` baseline.

## Deployment and demo checklist

These tasks are pending. Use the linked README instructions for commands and configuration; check an item only after verifying it in the target environment.

### Before deployment

- [ ] Confirm AWS account, region, Free Tier eligibility, and current AWS/Cloudflare/Qdrant/Groq prices, quotas, and data handling terms.
- [ ] Set a billing alert; choose a unique Cognito prefix and a stable Pages/custom-domain origin.
- [ ] Create provider keys and store them using the [AWS setup instructions](../../../README.md#aws-prototype-setup-with-terraform).
- [ ] Configure ignored Terraform values, build the Lambda package, and review the plan for expected resources only.

### AWS and Cloudflare setup

- [ ] Provision the reviewed AWS stack using the [Terraform instructions](../../../README.md#aws-prototype-setup-with-terraform).
- [ ] Create each demo user in exactly one department group and upload only fictional sample documents under matching prefixes.
- [ ] Connect the repository to Pages and configure its build using [Cloudflare setup](../../../README.md#cloudflare-pages-setup).
- [ ] Configure public frontend variables and matching Terraform CORS/callback/logout URLs, then rebuild.
- [ ] Attach the custom domain and verify DNS/HTTPS; repeat URL configuration and checks if the domain changes.

### Live acceptance and observability

- [ ] Exercise the [spec's acceptance criteria](../specs/2026-10-06-knowledgellm-design.md#acceptance-criteria) for all three users, account switching, department isolation, citations, desktop/mobile controls, and page refresh.
- [ ] Ask a normal question and check CloudWatch token counts, estimated cost, latency, department, and guardrail outcome using the [README queries](../../../README.md#chat-observability).
- [ ] Submit email/phone/SSN patterns and verify input redaction, retrieved-source redaction, and blocked PII output without logging protected text.
- [ ] Verify both Lambda log groups have seven-day retention and contain no questions, answers, document text, or PII.
- [ ] Review billing and shared CloudWatch allowance usage after the demo; record results here.

### Cleanup

- [ ] Remove the Pages project and its associated custom-domain DNS records when no longer needed.
- [ ] Empty all S3 document versions and destroy the AWS stack using [cleanup instructions](../../../README.md#cleanup).
- [ ] Remove externally created demo secrets, provider keys, and Qdrant clusters when no longer needed.

## Historical local verification

These results were recorded during the initial prototype implementation on 2026-10-06. They have not been rerun for this documentation reorganization. SAM checks apply to the earlier deployment path, not the current Terraform stack.

- AWS Cognito documentation confirms managed login accepts username/password and `prompt=login` requests re-authentication: [authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html).
- Reference images are checked in under `docs/design/reference/`.
- `web/`: `npm test -- --run` passes (18 tests); `npm run build` passes with TypeScript checking; Prettier check and `npm audit --audit-level=moderate` pass. Chromium screenshots at 390px and 1440px previously showed no horizontal overflow; account switching, keyboard folder controls, citations, and New chat were exercised.
- `api/`: Python 3.12 pytest passes (37 tests) with pytest isolated under `/tmp/knowledgellm-test-deps`; runtime dependencies are supplied by the SAM build environment. `compileall` passes.
- `template.yaml`: `cfn-lint`, `sam validate --lint`, and `sam build` pass. Each function build directory is 230,640,497 bytes, under Lambda's 262,144,000-byte uncompressed package limit with roughly 31 MB of headroom.
- Post-review fixes add Cognito managed-login branding, require access tokens with the `openid` scope, index Qdrant filter fields before access, preserve the chat when citations open in a new tab, and prevent IME Enter from submitting unfinished text.
- Cloud deployment and live Cognito verification were not run.


## Follow-up: verified identity, folder access, and writable embedding caches

- [x] Reproduce successful login with blocked document requests at `127.0.0.1:5173`; confirm the API allows `localhost:5173` instead.
- [x] Proxy local development API requests through Vite, preserving bearer-token authorization and production CORS behavior.
- [x] Show the exact green `AWS Cognito Verified` label beneath the authorized identity; keep the other two folders locked, remove the selected folder lock, and expand its files.
- [x] Clear the previous session at switch start; stop claiming a folder is unlocked before document access succeeds.
- [x] Keep mobile verification text inside its card with horizontally scrollable identity controls.
- [x] Pass an explicit `/tmp` FastEmbed cache directory in the shared chat/ingestion factory and declare FastEmbed/Hugging Face cache paths in both Terraform Lambda environments.
- [x] Verify frontend tests (25 passed), production build, changed-file formatting, and Terraform validation. The affected provider/ingestion/chat/handler tests pass (26 tests), including cache regressions that failed before the fix.
- [x] Exercise real Cognito logins for Alex, Sam, and Priya at both local origins. Each sees two documents only from its department. A simulated rejected document request leaves every folder locked and no verified identity badge.
- [x] Capture [desktop](../../design/verification/2026-10-06-cognito-verified-desktop.png) and [mobile](../../design/verification/2026-10-06-cognito-verified-mobile.png) previews. Browser review was performed by the implementer; no independent review was run.
- [ ] Rebuild and deploy the reviewed Lambda package and Terraform cache settings; re-upload an approved fictional document and confirm ingestion writes vectors to Qdrant without read-only filesystem errors.

Existing checks needing follow-up: the full backend suite reports 41 passed and 2 failures in unchanged department-claim and sample-content tests. Repository-wide Prettier reports unchanged `App.test.tsx`, `auth.ts`, and `Toast.test.tsx`; formatting passes for this change's frontend files. These issues also exist on the starting `origin/main` revision. The cache fix has not been deployed to AWS or verified with a real model download in Lambda.

### Live chat failure diagnosis

Read-only CloudWatch inspection on 2026-10-06 confirmed that `knowledgellm-demo-knowledge` fails during the FastEmbed model download with `Read-only file system (os error 30)`. The 13:20:59 UTC request logged `assistant_unavailable`, zero input/output tokens, and a null cost; subsequent requests also failed. The deployed function has no `FASTEMBED_CACHE_PATH` or `HF_HOME` setting. The shared cache fix above remains pending deployment to both Lambdas.

The UI monitor currently waits for a successful chat response: failed requests leave `Awaiting response` and `Unavailable`. Estimated dollar cost also requires configured Groq input/output rates; token counts and guardrail outcomes are available in CloudWatch telemetry. No AWS resources were modified during diagnosis.

### Deployed cache fix and live chat verification

- [x] With Rick's deployment authorization, build the 231.7 MiB uncompressed package and apply the reviewed Terraform plan in `ap-southeast-1`: ZIP plus both Lambdas updated; no additions or deletions. Both functions use writable FastEmbed/Hugging Face caches.
- [x] Reprocess the six existing approved S3 sample documents using a synchronous ingestion invocation; the response reports 12 indexed chunks. S3 source contents were preserved.
- [x] Configure the existing Terraform rate variables in ignored local configuration: input $0.075 and output $0.30 per million tokens, from [Groq's published model rates](https://console.groq.com/docs/models), checked 2026-10-06. Apply changes to the knowledge Lambda only. This configures list-price estimates and does not enroll in a paid plan or verify the account's billing tier.
- [x] Verify live Cognito sign-in and `/chat` in the browser: budget answer returns HTTP 200 with the authorized Q4 source citation, 1,063 input tokens, 337 output tokens, and estimated $0.000180825. An email-pattern question is refused before generation. CloudWatch records `pass` and `question_pii_blocked` with no protected text.
- [x] Fix the UI's session-cost reset on a response without a cost estimate. The regression test failed before the fix; all 26 frontend tests and the production build now pass. A live browser rerun retains `$0.0002 est.` after the refusal.
- [x] Capture the [live chat and monitor preview](../../design/verification/2026-10-06-live-chat-monitor.png).

The earlier pending cache deployment is now completed. Direct invocation verifies ingestion; the S3/EventBridge trigger was previously confirmed and was not retriggered by rewriting documents. Live checks above cover Finance and input PII refusal; output PII and full cross-department chat verification remain separate acceptance checks. Changes are submitted in [PR #5](https://github.com/coastk05396/knowledgellm/pull/5); no merge was performed.

### Department question shortcuts

- [x] Remove the identity introduction and permission badges shown in Rick's screenshots.
- [x] Provide five document-based question buttons for each of Finance, Operations, and People, visible only with matching document access.
- [x] Fill and focus the composer on selection without submitting; clear the selected draft on account switch or New chat. Disable suggestions while an answer is pending.
- [x] Production TypeScript/Vite build passes. Update the existing intro-copy expectation for the new UI; no tests were added or run for this change.

This frontend change builds on PR #5 and does not modify AWS infrastructure.

Previews: [desktop](../../design/verification/2026-10-06-question-shortcuts-desktop.png) and [mobile](../../design/verification/2026-10-06-question-shortcuts-mobile.png). Formatting checks pass for the changed frontend files.
