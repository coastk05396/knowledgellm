# Demo TODO checklist

Use this list to finish the KnowledgeLLM demo safely. Check each item only after verifying it in the target AWS account.

## Before AWS setup

- [ ] Confirm the AWS account, region, and current Free Tier eligibility.
- [ ] Review current AWS, Qdrant, and Groq quotas, prices, and data handling terms.
- [ ] Create Qdrant and Groq API keys, then store them in AWS Secrets Manager.
- [ ] Set a billing alert and choose a unique Cognito domain prefix.
- [ ] Build the Python 3.12 Lambda package with `rtk bash scripts/package-lambdas.sh`.
- [ ] Review `rtk terraform -chdir=infra/terraform plan`; confirm it contains only the expected demo resources.

## Deploy and configure

- [ ] Copy `infra/terraform/terraform.tfvars.example` to `infra/terraform/terraform.tfvars` and fill in non-secret endpoints and secret ARNs.
- [ ] Run `rtk terraform -chdir=infra/terraform init`, `validate`, `plan`, then `apply`.
- [ ] Copy Terraform outputs into the local web environment file.
- [ ] Create demo users administratively and place each in exactly one department group.
- [ ] Upload only fictional sample documents under their matching department prefixes.
- [ ] Verify each user's document list and chat citations only include their own department.

## Cloudflare Pages deployment

Deploy the static frontend to Cloudflare Pages and keep the Python API, Cognito, ingestion, and secret storage in AWS. This checklist records planned work; no Cloudflare infrastructure is currently provisioned by the repository's Terraform.

- [ ] Review the current [Pages free-plan limits](https://developers.cloudflare.com/pages/platform/limits/) and [pricing](https://developers.cloudflare.com/pages/functions/pricing/); domain registration and backend services have separate costs.
- [ ] In Cloudflare Workers & Pages, create a Pages project connected to this GitHub repository. Select the branch containing the approved frontend; use `main` for production once the implementation is merged.
- [ ] Set the root directory to `web`, build command to `npm run build`, and output directory to `dist`. Use a supported Node.js version (22.12+). See the [Vite deployment guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/).
- [ ] Choose the stable frontend origin, such as `https://knowledgellm.pages.dev` or `https://knowledge.example.com`.
- [ ] Set Terraform `web_origin` to that origin, and `web_callback_url` and `web_logout_url` to the same URL with a trailing `/`. Review the plan and apply it to update API CORS and Cognito URLs.
- [ ] Add production Pages build variables from Terraform outputs: `VITE_API_URL`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_ISSUER`, and `VITE_COGNITO_CLIENT_ID`. Set `VITE_REDIRECT_URI` to the exact Cognito callback URL.
- [ ] Keep Groq/Qdrant keys and AWS credentials out of all `VITE_*` variables. Pages build settings and GitHub Secrets do not supply credentials to the running AWS Lambda.
- [ ] Deploy or rebuild after setting variables; verify sign-in, account switching, document access, chat citations, and page refresh on the stable production URL.
- [ ] For a custom domain, add it in the Pages project's Custom domains settings and complete the required DNS setup. Follow the [custom-domain guide](https://developers.cloudflare.com/pages/configuration/custom-domains/).
- [ ] When changing domains, update Terraform CORS/callback/logout values and the Pages redirect variable, then rebuild and verify HTTPS login/logout again. Preview URLs require their own allowed URLs; do not assume every preview can authenticate against the production stack.

## Observability and demo checks

- [ ] Ask a normal question and check CloudWatch for token counts, estimated cost, latency, and department.
- [ ] Use Logs Insights on Terraform output `knowledge_log_group_name` to group events by `guardrail_action`.
- [ ] Try a question containing an email/phone/SSN pattern and verify the guardrail outcome is logged without recording the question.
- [ ] Check that retrieved source PII is redacted and an answer containing PII is blocked.
- [ ] Verify both Lambda log groups have seven-day retention and inspect sample logs for accidental prompt, answer, document, or PII content.
- [ ] Confirm the CloudWatch account usage remains within the current free allowance; review billing after the demo.

## Clean up

- [ ] Remove the Pages project and its associated custom-domain DNS records if the public demo is no longer needed.
- [ ] Remove all object versions from the demo S3 bucket.
- [ ] Run `rtk terraform -chdir=infra/terraform destroy` and confirm the Terraform-managed resources are gone.
- [ ] Delete external Qdrant/Groq demo keys or clusters if they are no longer needed.
