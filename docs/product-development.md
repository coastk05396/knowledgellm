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
| Responsive Cognito UI and account switching | Frontend worker | Complete; 15 frontend tests/build/browser checks pass |
| Cognito/SAM setup docs, acceptance checks, and review | Coordinator | Complete locally; PR blocked because origin has no branches or default `main` |

## Verification Evidence

- AWS Cognito documentation confirms managed login accepts username/password and `prompt=login` requests re-authentication: [authorization endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html).
- Reference images are checked in under `docs/design/reference/`.
- `web/`: `npm ci` reports zero vulnerabilities; `npm test` passes (15 tests); `npm run build` passes with TypeScript checking; source formatting check passes. Temporary Chromium screenshots at 390px and 1440px show no horizontal overflow; account switching, keyboard folder controls, cited answers, and New chat were exercised.
- `api/`: `PYTHONPATH=api/src python3 -m pytest -q api/tests` passes (33 tests) using Python 3.14 and pytest isolated under `/tmp/knowledgellm-test-deps`; local Python 3.12.3 lacks `pip` and `venv`, so direct Python 3.12 test setup did not work. `compileall` passes.
- `template.yaml`: `cfn-lint template.yaml` passes. `sam validate` is not run because AWS SAM CLI is not installed in the environment.
- `web/`: Prettier check passes; `npm audit --audit-level=moderate` reports zero vulnerabilities.
- No cloud deployment has been authorized.

## Unresolved Issues

- Real AWS pool, API, S3 bucket, Qdrant, and Groq credentials are intentionally unset. Deployment requires environment-specific configuration and separate cost review.
- The user has not provided real company documents; sample content must remain fictional.

## Next Action

Local implementation and review are complete. Open a PR after the remote repository has a real `main` branch. SAM build/deployment and Cognito login require configured AWS resources and were not run.
