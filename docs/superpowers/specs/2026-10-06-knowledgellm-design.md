# KnowledgeLLM Design Spec

**Status:** Approved for implementation
**Date:** 2026-10-06
**Source brief:** [Project1 Google Doc](https://docs.google.com/document/d/1RDI7CdBDm-hXj6-bgaUyz03ZATXSiehVcGkjfa0oIVk/edit) and the two supplied desktop/mobile UI references.

**UI references:** [Mobile](../../design/reference/knowledgellm-mobile.png) and [desktop](../../design/reference/knowledgellm-desktop.png).

## Goal

Build a permission-aware knowledge assistant that lets authenticated department users browse the documents they can access, ask questions about them, and inspect cited sources. The first implementation should be a deployable prototype on AWS, with a strong cost-minimization goal and no promise of zero cost until account-specific service pricing and quotas are checked.

## Users and Core Journey

The product has three initial departments and representative identities matching the visual brief: Alex / Finance, Sam / Operations, and Priya / People. A user signs in with Amazon Cognito username and password. The app shows the authenticated identity, lists only authorized department folders and documents, and lets the user open a document or ask a question. Answers include citations that open the source document. Choosing a different identity starts sign-out and a new Cognito sign-in; the interface never changes the active role by changing client-side state alone.

### UI contract from the supplied references

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

### Excluded from the first implementation

- A client-side demo identity selector that grants roles without authentication.
- Broad executive/admin access not shown in the selected three-department product scope.
- Enterprise SSO, document editing, collaboration, billing, and production compliance certification.
- Uploading or indexing confidential company data. Initial acceptance uses synthetic/sample documents until external-model data handling is reviewed.

## Architecture

- **Web:** React, Vite, and TypeScript. The browser uses Cognito managed login with OAuth authorization-code flow and PKCE. Cognito presents the username/password form; the app never handles or stores passwords. Account switching clears the local app session and requires re-authentication with `prompt=login`.
- **API:** Python 3.12 AWS Lambda behind API Gateway HTTP API. The API verifies the Cognito access token and derives user identity/groups only from verified claims. Request bodies never select or override a role.
- **Document storage and ingestion:** S3 stores source files in a private bucket. An ingestion worker extracts text, chunks it, adds department/source metadata, and writes vectors to Qdrant. Keep ingestion separate from question answering so extraction work does not lengthen the interactive request path. The API authorizes document opens and issues short-lived links; the browser never receives broad bucket access.
- **Retrieval and generation:** Local CPU embeddings (FastEmbed) and Qdrant provide vector search. The API applies an exact department filter before retrieved text enters the prompt. Groq is the proposed external inference provider from the source brief; provider choice remains subject to current free-tier limits, data-retention terms, and deployment-region constraints.
- **Guardrails and telemetry:** Apply input/output PII checks in the API, reject unauthorized or unsupported requests, and log operational metadata without storing raw prompts or document excerpts by default. Show token cost as an estimate and label it as such.

### Access-control invariants

1. Invalid, expired, missing, or malformed tokens fail closed.
2. The backend maps verified Cognito groups to allowed departments; client-provided identity, folder, role, or filter values cannot broaden access.
3. The same authorization policy applies to folder listings, document access, and retrieval. The API checks access before issuing a short-lived document link. Unauthorized document content is never sent to the LLM provider.
4. A department with no configured permission receives no documents and no retrieval results.
5. Citations point only to documents returned by the authorized retrieval query.

## Cost and Configuration

Avoid Bedrock Knowledge Bases and OpenSearch Serverless for the initial cost-constrained prototype. Current published allowances include 10,000 Cognito MAUs for Lite/Essentials and 1 million Lambda requests plus 400,000 GB-seconds per month; API Gateway's published 1 million-call offer is time-limited, and S3's legacy new-account offer is eligibility-dependent. Qdrant Cloud's free cluster is prototype-sized (1 GB RAM, 4 GB disk, no HA). Groq free-plan quotas vary by model; its data policy permits limited reliability/abuse logging for up to 30 days. Use synthetic documents until external-provider data handling is reviewed. The exact price depends on AWS account age/plan, region, traffic, storage, egress, logs, delivery channels, and current third-party terms, so do not promise indefinite $0. Verify current rates and quotas before deployment, configure a budget alert, and require explicit approval before creating billable cloud resources. Store secrets in environment-backed local configuration or AWS Secrets Manager, never in source control. Sources: [Cognito pricing](https://aws.amazon.com/cognito/pricing/), [Lambda pricing](https://aws.amazon.com/lambda/pricing/), [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/), [S3 FAQ](https://aws.amazon.com/s3/faqs/), [Qdrant pricing](https://qdrant.tech/pricing/), [Groq rate limits](https://console.groq.com/docs/rate-limits), and [Groq data handling](https://console.groq.com/docs/your-data).

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

## Decisions and Open Items

- **Selected:** Cognito username/password authentication. Passwordless passkeys were considered but rejected because the user chose standard credentials.
- **Selected:** Cognito managed login owns the credential form; selecting another account identity requires a fresh username/password entry. Cognito's `prompt=login` parameter requests re-authentication even if a Cognito session exists. See [AWS authorization endpoint documentation](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html).
- **Selected:** React/Vite/TypeScript frontend with a Python Lambda API, matching the screenshot-led UI needs and the AWS/Python architecture in the source brief.
- **Cost status:** The source document's historical free-tier amounts are not treated as current pricing. Verify exact regional/service costs and third-party terms during implementation planning.
- **Data status:** Use synthetic documents for initial acceptance. Any move to real confidential documents requires an explicit review of inference-provider retention, region, and data-processing terms.
- **Department mapping:** Use Finance, Operations, and People from the supplied screenshots as Cognito groups; confirm exact sample-document content during implementation.
