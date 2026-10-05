# KnowledgeLLM Full-Stack Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local runnable, responsive KnowledgeLLM prototype with Cognito username/password login, department-scoped document access, and cited answers.

**Architecture:** A Vite React app uses Cognito managed login authorization-code flow with PKCE and calls an API Gateway HTTP API. The API trusts only API Gateway JWT-authorizer claims, applies department policy before S3 reads or Qdrant retrieval, and passes authorized chunks through PII and grounding guardrails before Groq generation. A separate S3-triggered Lambda indexes synthetic Markdown samples into Qdrant.

**Tech Stack:** TypeScript, React, Vite, `oidc-client-ts`; Python 3.12, pytest, boto3, FastEmbed, Qdrant client, Groq SDK; AWS SAM template; Vitest and Testing Library for web.

**Spec:** `docs/superpowers/specs/2026-10-06-knowledgellm-design.md`

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
- [ ] Commit as `feat: scaffold KnowledgeLLM prototype`.

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

- [ ] Write tests for valid, absent, malformed, and unknown group claims; forged request `department` values; cross-group IDs; private-link TTL.
- [ ] Run focused pytest and confirm failure.
- [ ] Implement allowlisted group mapping, S3 key mapping, and authorization-before-storage access.
- [ ] Configure API Gateway JWT authorizer with Cognito issuer/audience parameters; avoid public document routes.
- [ ] Run `python -m pytest`; confirm unauthorized paths never call storage.
- [ ] Commit as `feat: enforce department scoped document access`.

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

- [ ] Write tests proving index metadata derives from trusted S3 key mappings, query uses exact allowlisted department filters, unauthorized chunks never reach generation, unsupported questions return no uncited facts, PII fails closed, and provider errors do not leak input.
- [ ] Run focused pytest and confirm failure.
- [ ] Implement pure policy/guardrail logic and injected FastEmbed/Qdrant/Groq/S3 adapters.
- [ ] Return only citations for chunks actually included in authorized context. Report cost only when usage and configured rates are present.
- [ ] Run all backend tests, including empty/no-source and timeout cases.
- [ ] Commit as `feat: add guarded retrieval and cited answers`.

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

- [ ] Test login redirect configuration, switch clearing state and requiring fresh login, authorized-folder visibility, citation interactions, loading/error/empty states, and keyboard controls.
- [ ] Confirm tests fail, then implement the screenshot-led layout, provided color tokens, responsive styles, accessible icon labels, and API-backed chat/doc browsing.
- [ ] At 390px show scrollable identity cards and stacked monitor; at desktop show left folder sidebar and centered conversation. Never show unauthorized document titles/counts.
- [ ] Run `npm test` and `npm run build` in `web/`; confirm pass.
- [ ] Commit as `feat: build responsive cognito knowledge interface`.

### Task 5: Setup, Deployment Guidance, and End-to-End Local Verification

**Files:**
- Create: `README.md`, `api/tests/test_acceptance.py`, `web/src/app/acceptance.test.tsx`
- Create or modify: `docs/product-development.md`, `docs/superpowers/plans/2026-10-06-knowledgellm-full-stack-prototype.md`, `.gitignore`, `.env.example`, `template.yaml`

**Interfaces:**
- Document required environment variables, local mock/test commands, Cognito app-client configuration, S3/Qdrant/Groq setup, and SAM deployment commands. No secrets appear in examples.
- Provide a demo fixture mode for local tests only; it cannot be enabled in production builds or substitute for Cognito claims in deployment.

- [ ] Add acceptance tests for Alex/Finance, Sam/Operations, Priya/People; cross-department access denial; cited Q4 budget answer; sign-out/switch; and narrow layout.
- [ ] Run full web/backend verification and record exact results; run SAM template validation if SAM is installed.
- [ ] Audit dependencies/config for secret placeholders, public S3 access, or demo identity authorization paths.
- [ ] Update product status, unresolved configuration requirements, commands, evidence, and next action.
- [ ] Commit as `docs: document local setup and prototype deployment`.
