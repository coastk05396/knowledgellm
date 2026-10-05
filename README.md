# KnowledgeLLM

KnowledgeLLM is a permission-aware knowledge assistant prototype. Cognito manages username/password sign-in; a Python API applies Cognito group access before listing S3 documents or retrieving Qdrant chunks. Answers cite only approved, retrieved documents. The included content is fictional.

## Local development

Requirements: Node.js 20.19+ or 22.12+, npm, Python 3.12, and Git. Install the web app and run the local checks:

```sh
cd web
npm install
npm run dev
npm test
npm run build
npm run format:check
```

To test the API, install its package in a Python 3.12 virtual environment and run pytest:

```sh
cd api
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
python -m pytest
```

The frontend starts without credentials but disables sign-in. Copy `web/.env.example` to `web/.env.local` and set `VITE_API_URL`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_ISSUER`, `VITE_COGNITO_CLIENT_ID`, and `VITE_REDIRECT_URI` from the deployed stack outputs. Cognito managed login receives the username and password; the app never handles or stores the password. Account switching signs out, clears the current workspace, and requires a fresh login.

## AWS prototype setup

The SAM template creates a Cognito user pool, managed-login domain, OAuth client, three department groups, a private encrypted/versioned S3 bucket, a JWT-protected HTTP API, and Lambda functions for access-scoped documents, chat, and ingestion. Choose a globally unique lowercase `CognitoDomainPrefix`, and set the callback/logout URLs and `WebOrigin` for the exact web origin before deployment. The browser client uses authorization code with PKCE and has no client secret. Self-registration is disabled; create users administratively and add each user to exactly one of `finance`, `operations`, or `people`.

Create Qdrant and Groq credentials outside the repository and save each in AWS Secrets Manager. Pass their secret ARNs and the Qdrant URL to SAM; the Lambdas read secret values at runtime. Review current AWS, Qdrant, and Groq charges, retention terms, quotas, account eligibility, and region before provisioning anything. No cloud resources are created by the local development commands.

Validate and package the infrastructure template locally with the AWS SAM CLI:

```sh
sam validate --template-file template.yaml
sam build --template-file template.yaml
```

After environment-specific values and provider secrets are ready, an authorized operator can run `sam deploy --guided`. Deployment provisions billable cloud resources and is intentionally separate from local setup.

After an approved deployment, upload only the fictional samples to the bucket output, preserving department folders. S3 sends object-created events through EventBridge to the ingestion Lambda. The API uses FastEmbed on CPU, Qdrant department filters, and Groq JSON answers with server-validated citation IDs. Set both `GroqInputRatePerMillionUsd` and `GroqOutputRatePerMillionUsd` from current pricing to show cost estimates; otherwise cost is reported as unavailable.

## Access and prototype limits

API Gateway validates JWTs. The API derives access only from the verified `cognito:groups` claim; request department values are ignored. S3 stays private, source links expire after 120 seconds, and unknown or cross-department document IDs return the same not-found response. Ingestion accepts only catalogued Markdown keys up to 1 MB. Document IDs are opaque single path segments; S3 keys remain department-prefixed.

The PII guardrail currently detects and redacts common email, phone, and U.S. SSN patterns. This is a prototype filter, not comprehensive PII detection or a compliance control. Keep real company data out of the sample until provider handling, deployment region, retention, and organizational approval have been reviewed. Provider errors do not return prompts or source excerpts. See [the product spec](docs/superpowers/specs/2026-10-06-knowledgellm-design.md) for architecture, failure behavior, and cost assumptions.
