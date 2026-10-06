# KnowledgeLLM Design Spec

**Status:** Approved for implementation
**Date:** 2026-10-06
**Source brief:** [Project1 Google Doc](https://docs.google.com/document/d/1RDI7CdBDm-hXj6-bgaUyz03ZATXSiehVcGkjfa0oIVk/edit) and the two supplied desktop/mobile UI references.

**UI references:** [Mobile](../../design/reference/knowledgellm-mobile.png) and [desktop](../../design/reference/knowledgellm-desktop.png).

**Document ownership:** This is the current product requirements and design source. Track execution in the [implementation plan](../plans/2026-10-06-knowledgellm-full-stack-prototype.md); use [README](../../../README.md) for setup instructions.

## Goal

Build a permission-aware knowledge assistant that lets authenticated department users browse the documents they can access, ask questions about them, and inspect cited sources. The first implementation should be a deployable prototype on AWS, with a strong cost-minimization goal and no promise of zero cost until account-specific service pricing and quotas are checked.

## Users and Core Journey

The product has three initial departments and representative identities matching the visual brief: Alex / Finance, Sam / Operations, and Priya / People. A user signs in with Amazon Cognito username and password. The app shows the authenticated identity, lists only authorized department folders and documents, and lets the user open a document or ask a question. Answers include citations that open the source document. Choosing a different identity starts sign-out and a new Cognito sign-in; the interface never changes the active role by changing client-side state alone.

### UI contract from the supplied references

- **Verified identity and folder state:** After Cognito sign-in and a successful authorized document listing, show a small green `AWS Cognito Verified` line beneath the active identity. Its department folder displays a document count and expands without a lock icon; other department folders remain locked. Clear these states immediately when switching begins. A failed document request must not display verified folder access.

- **Desktop:** top brand bar with identity/account controls; a left department sidebar with a monitor panel anchored low; a main conversation area with a section header, identity introduction, flat user/assistant messages, citation chips, and a bottom composer with an access caption.
- **Mobile:** compact brand header; three identity cards; department accordions; conversation; a two-column guardrail/cost panel; and the composer with safe-area spacing. Stack the monitor at narrow widths and allow identity cards to scroll horizontally rather than compressing their labels.
- **Palette:** graphite canvas `#202326`, surfaces `#25292D` and `#292E35`, slate borders `#48535F`, primary text `#EDF0F3`, muted text `#ADB8C6`, Finance coral `#ED9678`, Operations cyan `#62B7C3`, People violet `#B79BDE`, gold `#E3BE73`, and success green `#39BD7B`. Treat these as visual-reference estimates.
- **Type and controls:** IBM Plex Sans for body copy and IBM Plex Mono for compact labels/status; flat messages, thin dividers, restrained shadows, 8–12px control radii, and circle avatars. Provide keyboard focus, descriptive icon labels, reduced motion, and at least 44px touch targets.
- **Security adaptation:** preserve the department shells and accents, but show document names/counts only after authorization. The screenshots reveal multiple groups' file names while Finance is active; the implementation must not reproduce that disclosure.
- **Account switch:** identity cards are sign-out/sign-in entry points, not role selectors. Starting a switch clears the current app session and chat view, signs out through Cognito, and then asks for the next user's username/password.

## Scope

### Included in the prototype

- Cognito authentication and logout/account-switch flow.
- Three department groups: `finance`, `operations`, and `people`.
- Document listing and access-scoped folder expansion.
- Document ingestion from S3, text extraction/chunking, and role metadata.
- Retrieval-augmented answers with source citations.
- Server-side PII checks/redaction and safe handling of out-of-scope questions.
- Basic chat history for the active session, a new-chat action, and visible per-chat token/cost estimates when provider usage data is available.
- A responsive desktop/mobile interface following the supplied references.
- A public Cloudflare Pages frontend with a custom-domain option and Terraform-managed AWS infrastructure. Cloudflare project/domain configuration is a separate setup step.

### Excluded from the first implementation

- A client-side demo identity selector that grants roles without authentication.
- Broad executive/admin access not shown in the selected three-department product scope.
- Enterprise SSO, document editing, collaboration, billing, and production compliance certification.
- Uploading or indexing confidential company data. Initial acceptance uses synthetic/sample documents until external-model data handling is reviewed.

## Architecture

- **Embedding cache:** Chat and ingestion share the FastEmbed factory and store model/download caches under Lambda's writable `/tmp` directory, with the paths declared in Terraform.

- **Web:** React, Vite, and TypeScript, hosted as static assets on Cloudflare Pages for the public demo. The browser uses Cognito managed login with OAuth authorization-code flow and PKCE. Cognito presents the username/password form; the app never handles or stores passwords. Account switching clears the local app session and requires re-authentication with `prompt=login`.
- **API:** Python 3.12 AWS Lambda behind API Gateway HTTP API. The API verifies the Cognito access token and derives user identity/groups only from verified claims. Request bodies never select or override a role.
- **Token contract:** Protected routes require the Cognito `openid` authorization scope and the API accepts only authorizer claims with `token_use=access`. The public health route has no user-data access.
- **Document storage and ingestion:** S3 stores source files in a private bucket. An ingestion worker extracts text, chunks it, adds department/source metadata, and writes vectors to Qdrant. Keep ingestion separate from question answering so extraction work does not lengthen the interactive request path. The API authorizes document opens and issues short-lived links; the browser never receives broad bucket access.
- **Retrieval indexes:** Create Qdrant keyword payload indexes for `department` and `document_id` before filtered queries or replacement writes, including when the collection already exists.
- **Infrastructure:** Terraform in `infra/terraform/` manages AWS resources, including Cognito managed-login branding. The initial prototype used SAM; new deployment work follows Terraform. Cloudflare Pages configuration is documented in README.
- **Retrieval and generation:** Local CPU embeddings (FastEmbed) and Qdrant provide vector search. The API applies an exact department filter before retrieved text enters the prompt. Groq is the proposed external inference provider from the source brief; provider choice remains subject to current free-tier limits, data-retention terms, and deployment-region constraints.
- **Guardrails and telemetry:** Apply input/output PII checks in the API, reject unauthorized or unsupported requests, and log operational metadata without storing raw prompts or document excerpts by default. Show token cost as an estimate and label it as such.

### Access-control invariants

1. Invalid, expired, missing, or malformed tokens fail closed.
2. The backend maps verified Cognito groups to allowed departments; client-provided identity, folder, role, or filter values cannot broaden access.
3. The same authorization policy applies to folder listings, document access, and retrieval. The API checks access before issuing a short-lived document link. Unauthorized document content is never sent to the LLM provider.
4. A department with no configured permission receives no documents and no retrieval results.
5. Citations point only to documents returned by the authorized retrieval query.

## Cost and Configuration

Minimize demo costs by using eligible service allowances; an indefinite $0 bill is not a requirement or guarantee. Avoid Bedrock Knowledge Bases and OpenSearch Serverless for this prototype. Verify account/region eligibility, provider quotas, egress, storage, logging, and data handling before provisioning. Configure a billing alert, obtain deployment authorization before provisioning billable resources, and use synthetic documents for initial acceptance. Never commit credentials or expose provider keys in browser configuration; the selected AWS deployment retrieves keys from Secrets Manager. Setup details and pricing references belong in [README](../../../README.md#aws-prototype-setup-with-terraform).

## Failure Behavior

- Failed authentication returns the user to sign-in without exposing protected data.
- If token verification, authorization mapping, vector filtering, or required guardrails fail, return a clear unavailable/denied state and do not call the LLM.
- If no authorized sources support an answer, say that the available documents do not contain enough information and provide no uncited factual answer.
- If the inference provider is unavailable or rate-limited, preserve the conversation and show a retryable error without leaking prompts to logs.
- If provider token usage is absent, show cost as unavailable rather than inventing a value.

## Acceptance Criteria

1. Alex, Sam, and Priya can sign in independently and see only their department's sample folders and files.
2. Switching identities requires signing out and authenticating the next user; changing browser state or API payloads cannot grant another department's permissions.
3. A question about an allowed sample document returns a grounded answer and a working citation to that document.
4. Cross-department questions do not retrieve or send restricted chunks to the model, and the UI gives a clear access response.
5. PII guardrails and failure states are visible and do not expose protected text in errors or routine logs.
6. The main journey works at desktop and mobile widths with keyboard-accessible identity, folder, citation, and chat controls.
7. Local setup, tests, and deployment steps are documented after the implementation stack is established; cloud deployment cost is verified before resources are provisioned.
8. The Cloudflare Pages production URL, and selected custom domain when configured, support HTTPS sign-in/logout and cited chat using the AWS API. Cognito URLs and API CORS match the deployed origin; frontend assets expose no provider secrets.

## Decisions and Open Items

- **Selected:** Cognito username/password authentication. Passwordless passkeys were considered but rejected because the user chose standard credentials.
- **Selected:** Cognito managed login owns the credential form; selecting another account identity requires a fresh username/password entry. Cognito's `prompt=login` parameter requests re-authentication even if a Cognito session exists. See [AWS authorization endpoint documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html).
- **Selected:** React/Vite/TypeScript frontend with a Python Lambda API, matching the screenshot-led UI needs and the AWS/Python architecture in the source brief.
- **Cost status:** The source document's historical free-tier amounts are not treated as current pricing. Verify exact regional/service costs and third-party terms during implementation planning.
- **Data status:** Use synthetic documents for initial acceptance. Any move to real confidential documents requires an explicit review of inference-provider retention, region, and data-processing terms.
- **Department mapping:** Use Finance, Operations, and People from the supplied screenshots as Cognito groups; confirm exact sample-document content during implementation.

## Department question shortcuts

Replace the chat identity heading, explanatory paragraph, and department/permission badges with five document-based question buttons for the authorized department. Clicking a button fills and focuses the composer without sending. Suggestions change with department access; switching accounts or starting a new chat clears the selected draft.
