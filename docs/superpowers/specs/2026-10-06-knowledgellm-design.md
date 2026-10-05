# KnowledgeLLM Design Spec

**Status:** Draft for user review
**Date:** 2026-10-06
**Source brief:** [Project1 Google Doc](https://docs.google.com/document/d/1RDI7CdBDm-hXj6-bgaUyz03ZATXSiehVcGkjfa0oIVk/edit) and the two supplied desktop/mobile UI references.

## Goal

Build a permission-aware knowledge assistant that lets authenticated department users browse the documents they can access, ask questions about them, and inspect cited sources. The first implementation should be a deployable prototype on AWS, with a strong cost-minimization goal and no promise of zero cost until account-specific service pricing and quotas are checked.

## Users and Core Journey

The product has three initial departments and representative identities matching the visual brief: Alex / Finance, Sam / Operations, and Priya / People. A user signs in with Amazon Cognito username and password. The app shows the authenticated identity, lists only authorized department folders and documents, and lets the user open a document or ask a question. Answers include citations that open the source document. Choosing a different identity starts sign-out and a new Cognito sign-in; the interface never changes the active role by changing client-side state alone.

The desktop layout uses a department/document sidebar and a focused chat panel. Mobile places identity selection and expandable department folders above the chat. Use a graphite terminal-inspired theme with warm amber as the primary accent and restrained department colors. Keep chat text highly readable, and label access, PII, and estimated-token-cost status clearly.

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

- **Web:** React, Vite, and TypeScript. The browser uses Cognito's OAuth authorization-code flow with PKCE. Users enter the selected Cognito account's username and password at sign-in; account switching clears the local app session and returns through Cognito logout to the sign-in page.
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

Avoid Bedrock Knowledge Bases and OpenSearch Serverless for the initial cost-constrained prototype. Treat Lambda, API Gateway, S3, Cognito, Qdrant, embeddings, inference, and monitoring as separate cost/quota items. AWS free allowances and third-party developer tiers vary by account, region, time, and usage; do not describe this design as guaranteed $0. Before deployment, verify current rates and free allowances, configure a budget alert, and require explicit approval before creating billable cloud resources. Store secrets in environment-backed local configuration or AWS Secrets Manager, never in source control. The current Cognito pricing page documents plan capabilities and usage pricing: [Amazon Cognito pricing](https://aws.amazon.com/cognito/pricing/).

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
- **Selected:** React/Vite/TypeScript frontend with a Python Lambda API, matching the screenshot-led UI needs and the AWS/Python architecture in the source brief.
- **Cost status:** The source document's historical free-tier amounts are not treated as current pricing. Verify exact regional/service costs and third-party terms during implementation planning.
- **Data status:** Use synthetic documents for initial acceptance. Any move to real confidential documents requires an explicit review of inference-provider retention, region, and data-processing terms.
- **Department mapping:** Use Finance, Operations, and People from the supplied screenshots as Cognito groups; confirm exact sample-document content during implementation.
