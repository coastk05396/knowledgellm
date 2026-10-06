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
