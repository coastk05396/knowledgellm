# Repository Guidelines

## Project Structure & Module Organization

The React/Vite frontend lives in `web/`; the Python Lambda API and synthetic Markdown source files live in `api/src/knowledgellm/`; backend tests are in `api/tests/`. The SAM template is `template.yaml`; product requirements, plans, and reference images are under `docs/`.

## Build, Test, and Development Commands

From `web/`, run `npm install`, `npm run dev` for the local UI, `npm test` for frontend tests, and `npm run build` for the type-checked production bundle. From `api/`, install with `python3.12 -m pip install -e '.[dev]'` and run `python3.12 -m pytest`. Use `sam validate --template-file template.yaml` to validate deployment configuration when AWS SAM CLI is installed. Use the repository's `rtk` command wrapper for shell commands in this environment.

## Coding Style & Naming Conventions

Use English for source code, comments, and documentation. Prefer clean, strictly typed code; use TypeScript or Go for new components when a language choice is needed. Follow the formatter and linter adopted by each language rather than introducing competing styles. Use descriptive, consistent names, and keep changes focused on the task. Never commit secrets; load configuration and credentials from the environment or an approved secret store.

## Testing Guidelines

Frontend tests use Vitest and Testing Library (`*.test.tsx`); backend tests use pytest (`test_*.py`). Add focused behavior tests for changes and run both suites plus the frontend build before submitting. No numeric coverage threshold is set.

## Commit & Pull Request Guidelines

There is no Git history from which to infer an established commit style. Use signed Conventional Commits, such as `docs: add contributor guide` or `fix: handle empty input`. Pull requests should target `main`, explain the change and its motivation, link relevant issues when available, and include test results. Add screenshots for changes that affect a user interface.

## Security & Configuration

Do not hardcode API keys, passwords, tokens, or other credentials. Keep local configuration out of version control and provide safe examples when documenting required settings.

## Cloud Infrastructure & Terraform Guidelines

- **Infrastructure as Code (IaC) Mandate**: Any new or modified cloud infrastructure in AWS must be declared in Terraform under `infra/terraform/`. Do not perform out-of-band manual cloud modifications in AWS Console or CLI without capturing them in Terraform to prevent drift.
- **Zero or Ultra-Low Cost Principle ($0.00 / mo)**:
  - All provisioned infrastructure must strictly maximize the AWS Free Tier and pay-per-request serverless tiers with a target operating cost of $0.00/month for prototype and development traffic.
  - Avoid fixed hourly or monthly charges:
    - Use AWS Systems Manager (SSM) Parameter Store standard `SecureString` parameters ($0.00) instead of AWS Secrets Manager ($0.40/month per secret).
    - Use AWS Lambda (1M free requests/month and 3.2M seconds compute) without provisioned concurrency instead of always-on EC2 or container instances.
    - Use API Gateway HTTP API v2 (1M free requests/month) instead of Application Load Balancers ($16+/month) or NAT Gateways ($32+/month).
    - Set explicit short log retention (7 days) on CloudWatch log groups to prevent unbounded storage charges.
- **API Gateway & Cognito JWT Authorizer Configuration**:
  - When configuring `aws_apigatewayv2_route` with a Cognito JWT Authorizer for routes consumed with Cognito Access Tokens (e.g., `USER_PASSWORD_AUTH` or `aws.cognito.signin.user.admin`), do NOT configure `authorization_scopes = ["openid"]`.
  - **Rationale**: Cognito Access Tokens contain scopes like `aws.cognito.signin.user.admin` and do not include the `openid` scope (which is reserved for IdTokens). Specifying `authorization_scopes = ["openid"]` causes API Gateway to reject valid Cognito Access Tokens with `401 Unauthorized`. Keep `authorization_scopes` unset for access-token protected API routes.

## Project Requirements & Implementation Status (from PROMPT.md)

### 1. Cloud Infrastructure & Security (AWS / Terraform)
- [x] ~~Declare all cloud infrastructure in Terraform (`infra/terraform/`) with zero-cost architecture~~
- [x] ~~Deploy Cognito User Pool with department groups (`finance`, `operations`, `people`)~~
- [x] ~~Enable `ALLOW_USER_PASSWORD_AUTH` on Cognito Client for background 1-click persona auth~~
- [x] ~~Deploy HTTP API Gateway v2 with Cognito JWT Authorizer configured for Access Tokens (no `openid` scope)~~
- [x] ~~Deploy Python 3.12 Lambdas for Knowledge API and EventBridge-triggered S3 document ingestion~~
- [x] ~~Store secrets in AWS SSM Parameter Store standard SecureString ($0.00/mo)~~
- [x] ~~Configure private S3 buckets with AES-256 encryption, versioning, and EventBridge notifications~~
- [x] ~~Set CloudWatch Log Group retention to 7 days to eliminate storage accumulation costs~~
- [x] ~~Configure S3 remote state backend in Singapore (`ap-southeast-1`) with zero drift~~

### 2. Frontend User Experience (React / Vite / TypeScript)
- [x] ~~Build responsive UI shell matching reference design tokens (dark graphite theme, desktop + mobile)~~
- [x] ~~Implement 1-click persona switching (Alex / Finance, Sam / Operations, Priya / People) with zero popups~~
- [x] ~~Add floating toast notification on persona switch (`${name} signed in successfully · ${dept} folder unlocked`)~~
- [x] ~~Hide lock icon and reveal document count badge on authorized department folder~~
- [ ] Ensure clicking Sam (Operations) reliably unlocks Operations folder, removes lock icon, and displays files
- [x] ~~Ensure clicking Alex (Finance) reliably unlocks Finance folder, removes lock icon, and displays files~~
- [x] ~~Ensure clicking Priya (People) reliably unlocks People folder, removes lock icon, and displays files~~
- [x] ~~Auto-expand authorized department folder upon login with files immediately visible~~
- [x] ~~Support accordion toggle to manually expand/collapse department files~~
- [x] ~~Implement document inspection via short-lived presigned S3 URLs in a new tab~~
- [x] ~~Implement chat interface with identity-scoped greetings and grounded response display~~
- [x] ~~Provide system monitor tracking session tokens and estimated API inference costs~~
- [x] ~~Unit test suite passing with 100% green tests in Vitest (21/21 tests)~~
- [x] ~~Production bundle builds cleanly with TypeScript (`npm run build`)~~

### 3. Backend API & RAG Pipeline (Python 3.12)
- [x] ~~Parse Cognito groups reliably from API Gateway JWT claims (`authz.py`)~~
- [x] ~~Filter `/documents` listing to only return documents matching caller's authorized department~~
- [x] ~~Generate short-lived presigned URLs for `/documents/{documentId}` after permission checks~~
- [x] ~~PII redaction and query validation guardrails (`chat.py`)~~
- [x] ~~Qdrant vector retrieval with department metadata filters~~
- [x] ~~Groq LLM inference with server-validated citation verification~~

### 4. Remaining / Future Requirements
- [ ] Connect and deploy static frontend to Cloudflare Pages edge CDN
- [ ] Configure custom domain with automatic SSL on Cloudflare Pages
- [ ] Set up automated CI/CD pipeline via GitHub Actions for end-to-end regression tests
- [ ] Ingest additional custom enterprise corpus or production department documents into S3
- [ ] Implement offline RAG quality and accuracy evaluation benchmarking with Ragas
