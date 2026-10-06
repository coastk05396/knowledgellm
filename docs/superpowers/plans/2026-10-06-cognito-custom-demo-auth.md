# Cognito Custom Demo Authentication

## Decision

Supersedes the backend `/demo-token` and SSM demo-password approach. Use Cognito `CUSTOM_AUTH` with automatic challenge response to preserve one-click Alex/Finance, Sam/Operations, and Priya/People switching. Cognito issues real access tokens; the API keeps enforcing verified department groups. No demo passwords or token-minting endpoint are needed. Existing users are preserved rather than deleted to remove their old password hashes.

## Current work

- [x] Remove frontend demo passwords and use InitiateAuth / RespondToAuthChallenge.
- [x] Add Define/Create/Verify triggers in one small, dependency-free Lambda.
- [x] Fail closed unless DEMO_MODE is exactly true; allowlist the three personas.
- [x] Declare Lambda, least-privilege logging IAM, Cognito invoke permission, triggers, and custom auth flow in Terraform.
- [x] Mirror configuration in SAM and document public fictional-data access.
- [x] Run Vitest (38 passed), pytest (70 passed), frontend build, and Terraform validation.
- [x] Deploy through reviewed Terraform plans; all three personas receive only their two department documents.
Release follows the repository signed-commit/PR workflow; exclude the unrelated PROMPT.md deletion.

## Next: Cloudflare Turnstile free plan

- [ ] Add a Turnstile widget to the frontend; preserve one-click switching when a valid token is ready.
- [ ] Send the Turnstile token as the custom challenge answer.
- [ ] Verify it inside VerifyAuthChallengeResponse with Cloudflare Siteverify; fail closed.
- [ ] Keep only the site key public; store the Turnstile secret on the backend.
- [ ] Validate expected hostname/action and reject missing, expired, replayed, invalid tokens and provider failures.
- [ ] Declare supporting infrastructure/configuration in Terraform; confirm current Free plan limits before enabling.
- [ ] Keep Cognito quotas and cost monitoring: Turnstile validation happens after initial requests/triggers and cannot eliminate all request costs or bots.

Frontend-only Turnstile is bypassable. Demo personas remain public even with bot protection. Do not expose private production documents. No OTP, magic link, paid Cognito feature upgrade, or Turnstile deployment is part of the current task.

## Verification notes

SAM YAML and route/trigger/IAM configuration checks passed; SAM CLI is not installed, so SAM build/deployment was not run. Prior group-parser tests were updated to reflect supported API Gateway verified comma-separated claims while retaining unknown-group denial. Fictional labels were restored in all six samples to satisfy the existing safety test. Terraform deployments created no demo SSM parameters, DynamoDB counter, or `/demo-token` route.

Live verification: DEMO_MODE=false rejected custom sign-in; enabled mode issued Cognito tokens accepted by API Gateway for Alex/Finance, Sam/Operations, and Priya/People. Unknown users were rejected. Browser checks confirmed one click, no popup/credential form, the green Cognito indicator, successful toast, two visible permitted files, other folders locked, and session restoration after reload. No passwords were sent in any of the six browser Cognito API calls. Final Terraform plan reported no changes. Screenshot: `/tmp/knowledgellm-custom-auth-personas.png` (local verification artifact).
