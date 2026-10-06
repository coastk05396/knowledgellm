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

- Keep the graphite theme, department accents, responsive desktop/sidebar and mobile/accordion layouts, keyboard focus, reduced motion, descriptive icon labels, and 44px touch targets.
- On mobile, fit all three compact persona cards without horizontal scrolling, including the active verification label. Place the question composer and access caption above the PII guardrail/token-cost panel; use compact line spacing and room for two input lines.
- Use the persona cards as the sign-in entry points on mobile and desktop; omit the separate initial Sign in button and Cognito username/password instruction.
- On mobile, keep the verification dot inline with the centered first line of its label, and give the Department Folders heading 20px of space above it.
- While an answer is pending, animate the source-checking star and trailing dots on desktop and mobile. Keep a stable accessible status message and disable animation when reduced motion is requested.
- After authentication and successful authorized document listing, show a small green `AWS Cognito Verified` line under the active name and a success toast. Remove its folder lock, display its document count, and expand its files. Keep other folders locked; clear verification on switching or listing failure.
- Provide five document-based question buttons per authorized department instead of the identity introduction and permission badges. Clicking fills and focuses the composer without submitting; disable during pending requests and clear on switching or New chat.
- Open documents and citations through authorized, short-lived S3 links. Preserve the conversation when opening a source.
- Answer only from authorized supporting documents. If evidence is insufficient, state that the available documents do not contain enough information; do not invent facts or citations.
- Preserve conversation on provider errors and show a retryable unavailable state without leaking protected text.

## Backend, Infrastructure, and Cost Constraints

- Use React/Vite/TypeScript, Python 3.12 Lambda, API Gateway HTTP API, private encrypted/versioned S3, EventBridge ingestion, FastEmbed CPU embeddings, department-filtered Qdrant, and Groq generation.
- Declare AWS resources and changes in `infra/terraform/`; keep maintained SAM configuration consistent. Use remote state and review plans for drift and unintended resources.
- Chunk source text with trusted department/source metadata; create required Qdrant filter indexes. Store FastEmbed and Hugging Face caches under Lambda's writable `/tmp`.
- Keep provider keys backend-only in SSM Parameter Store SecureString. Never commit credentials or put secrets in frontend variables.
- Minimize demo cost through eligible free allowances and request-based services. Avoid always-on compute, NAT gateways, provisioned concurrency, and other fixed charges. Free eligibility and quotas must be checked for the target account; a zero bill is not guaranteed.
- Use seven-day CloudWatch log retention and billing alerts. Record latency, token usage, guardrail outcomes, and configured inference-cost estimates without raw questions, answers, document excerpts, or PII. Estimated inference cost is not an invoice or total AWS cost.
- Block PII in questions/output and mask retrieved-source PII before generation. Current regex coverage is common email, phone, and US SSN patterns, not comprehensive detection. Treat source text as data, not instructions; validate citations against authorized context.
- Display backend guardrail outcomes explicitly: pending, passed, question/output blocked, source masked, unavailable. Missing status must never imply success; missing usage/rates means cost unavailable.

## Acceptance Criteria

- [x] All three demo personas receive real Cognito tokens and see only their two permitted sample documents; other folders remain locked.
- [x] One-click switching, green verification, success toast, folder expansion, and session restoration work without frontend passwords.
- [x] `DEMO_MODE=false` and unknown users reject custom sign-in.
- [x] Authorized sample chat returns a grounded answer and working citation; input PII refusal reports its outcome.
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
