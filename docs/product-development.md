# Product Development

## Brief

Build a responsive KnowledgeLLM prototype from the supplied desktop and mobile references. Three Cognito users (Alex/Finance, Sam/Operations, Priya/People) browse department documents, ask grounded questions, and follow citations. The API must enforce access from verified Cognito group claims. Initial content is synthetic.

## Decisions

- Cognito managed login with username/password; passwords never pass through the application. Account switching clears app state and uses `prompt=login` to request fresh credentials.
- React, Vite, and TypeScript for the web app; Python 3.12 Lambda behind API Gateway HTTP API for the API.
- Private S3 documents; Qdrant retrieval with department metadata; FastEmbed and Groq are configured behind provider interfaces.
- No cloud resources are provisioned as part of local implementation. Do not claim the prototype is zero-cost or production certified.
- Match the supplied references while hiding unauthorized document names and counts.

## Tasks and Status

| Task | Owner | Status |
| --- | --- | --- |
| Product/design specification and acceptance criteria | Coordinator | Complete |
| Local project scaffold and synthetic department documents | Coordinator | Complete; tests/build pass |
| API authorization and document access | Coordinator | Complete; covered by full backend suite |
| Ingestion, retrieval, guardrails, and cited chat | Coordinator | Complete; covered by full backend suite |
| Responsive Cognito UI and account switching | Frontend worker | Complete locally; 18 frontend tests and production build pass |
| Post-review auth, retrieval, and citation hardening | Coordinator | Complete locally; backend suite and SAM validation/build pass |
| Cognito/SAM setup docs, acceptance checks, and review | Coordinator | Complete locally; submitted as [PR #1](https://github.com/coastk05396/knowledgellm/pull/1) |

## Verification Evidence

- AWS Cognito documentation confirms managed login accepts username/password and `prompt=login` requests re-authentication: [authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html).
- Reference images are checked in under `docs/design/reference/`.
- `web/`: `npm test -- --run` passes (18 tests); `npm run build` passes with TypeScript checking; Prettier check and `npm audit --audit-level=moderate` pass. Chromium screenshots at 390px and 1440px previously showed no horizontal overflow; account switching, keyboard folder controls, citations, and New chat were exercised.
- `api/`: Python 3.12 pytest passes (37 tests) with pytest isolated under `/tmp/knowledgellm-test-deps`; runtime dependencies are supplied by the SAM build environment. `compileall` passes.
- `template.yaml`: `cfn-lint`, `sam validate --lint`, and `sam build` pass. Each function build directory is 230,640,497 bytes, under Lambda's 262,144,000-byte uncompressed package limit with roughly 31 MB of headroom.
- Post-review fixes add Cognito managed-login branding, require access tokens with the `openid` scope, index Qdrant filter fields before access, preserve the chat when citations open in a new tab, and prevent IME Enter from submitting unfinished text.
- No cloud deployment has been authorized.

## Unresolved Issues

- Real AWS pool, API, S3 bucket, Qdrant, and Groq credentials are intentionally unset. Deployment requires environment-specific configuration and separate cost review.
- The user has not provided real company documents; sample content must remain fictional.

## Next Action

Local implementation and review are complete in [PR #1](https://github.com/coastk05396/knowledgellm/pull/1). SAM packaging validation passed, but deployment and live Cognito sign-in require configured AWS resources and were not run.
