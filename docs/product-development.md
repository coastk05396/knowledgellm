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
| API authorization and document access | Coordinator | Complete; 7 backend tests pass |
| Ingestion, retrieval, and chat | Coordinator | Planned |
| Grounded chat, PII guardrails, citations, and provider adapters | Coordinator | Planned |
| Responsive Cognito UI and account switching | Coordinator | Planned |
| Local verification, setup/deployment docs, and review | Coordinator | Planned |

## Verification Evidence

- AWS Cognito documentation confirms managed login accepts username/password and `prompt=login` requests re-authentication: [authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html).
- Reference images are checked in under `docs/design/reference/`.
- `web/`: `npm test` passes (1 test); `npm run build` passes with TypeScript checking.
- `api/`: `python3 -m pytest -q` passes (7 tests) using Python 3.14 and pytest installed under `/tmp/knowledgellm-test-deps`; local Python 3.12.3 lacks both pip and venv modules, so direct 3.12 test setup did not work.
- No cloud deployment has been authorized.

## Unresolved Issues

- Real AWS pool, API, S3 bucket, Qdrant, and Groq credentials are intentionally unset. Deployment requires environment-specific configuration and separate cost review.
- The user has not provided real company documents; sample content must remain fictional.

## Next Action

Implement ingestion, retrieval, guardrails, and chat in Task 3 while frontend implementation proceeds independently.
