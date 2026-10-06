# KnowledgeLLM

🔐 KnowledgeLLM is a permission-aware knowledge assistant prototype. Cognito manages username/password sign-in; a Python API applies Cognito group access before listing S3 documents or retrieving Qdrant chunks. Answers cite only approved, retrieved documents. The included content is fictional.

## Documentation

- [Product spec](docs/superpowers/specs/2026-10-06-knowledgellm-design.md): edit requirements, constraints, and acceptance criteria here.
- [Implementation plan](docs/superpowers/plans/2026-10-06-knowledgellm-full-stack-prototype.md): tasks, deployment/demo checklist, and verification results.
- [Project status](docs/product-development.md): document ownership, current status, and next action.
- [Agent instructions](AGENTS.md): coding-agent rules.

## Deployment architecture

Cloudflare Pages hosts the static React/Vite frontend; Terraform manages the AWS backend. This is the planned public deployment layout:

```text
┌─────────────────────────────┐       ┌─────────────────────────────┐
│ Cloudflare Pages            │       │ Amazon Cognito              │
│ React/Vite · custom domain  │       │ Username/password · groups  │
└──────────────┬──────────────┘       └──────────────┬──────────────┘
               │ serves UI                         │ login + tokens
               ▼                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│ Browser · department workspace · chat · source citations          │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS request + access token
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│ AWS API Gateway → JWT validation → Python Lambda                  │
│ Input guardrail → FastEmbed → department retrieval → Groq         │
│ Output guardrail → validated citations → response                 │
└─────┬──────────────┬──────────────┬──────────────┬──────────────────┘
      │              │              │              │
      ▼              ▼              ▼              ▼
┌──────────┐  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐
│ Qdrant   │  │ Groq API   │  │ CloudWatch │  │ AWS Secrets Manager │
│ Vectors  │  │ Inference  │  │ Metadata   │  │ Backend API keys    │
└────▲─────┘  └────────────┘  └────────────┘  └─────────────────────┘
     │ embedded chunks
┌────┴─────────────────────────────────────────────────────────────┐
│ Private S3 documents → EventBridge → ingestion Lambda → FastEmbed │
│ Approved source files are returned through expiring S3 links.     │
└──────────────────────────────────────────────────────────────────┘
```

Pages serves static assets without a Docker container. Keep provider keys in the backend secret store; all `VITE_*` configuration is visible in the browser bundle. Cloudflare's static asset requests are free and unlimited, subject to other platform limits; AWS and external providers have separate charges. See [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/) and [Cloudflare setup](#cloudflare-pages-setup).

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

## AWS prototype setup with Terraform

☁️ Terraform in `infra/terraform/` creates Cognito managed login, the three department groups, private encrypted/versioned document storage, a JWT-protected HTTP API, Lambda functions, and S3-triggered ingestion. The web client uses authorization code with PKCE and has no client secret. Protected API routes require the `openid` scope and accept Cognito access tokens only. Self-registration is disabled; create users administratively and add each user to exactly one of `finance`, `operations`, or `people`.

Create Qdrant and Groq credentials outside the repository and save each in AWS Secrets Manager. Copy `infra/terraform/terraform.tfvars.example` to `terraform.tfvars`, then set the Qdrant URL and both secret ARNs. Never put secret values in Terraform variables or commit the local tfvars file. Build the Lambda package and provision the infrastructure:

```sh
rtk bash scripts/package-lambdas.sh
rtk cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
rtk terraform -chdir=infra/terraform init
rtk terraform -chdir=infra/terraform validate
rtk terraform -chdir=infra/terraform plan
rtk terraform -chdir=infra/terraform apply
```

Set `cognito_domain_prefix` to a globally unique lowercase value and set the web origin, callback, and logout URLs to your exact frontend URLs. Configure the frontend from Terraform outputs (`api_url`, `cognito_issuer`, `cognito_client_id`, and `cognito_domain_url`). The package script needs Python 3.12 and pip. Its Lambda requirements omit `boto3` because the Python 3.12 Lambda runtime includes the AWS SDK; the script checks the 250 MiB uncompressed deployment limit. [AWS Python runtime docs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html) · [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html). Terraform state contains infrastructure metadata; keep it private and use a secured remote backend for shared environments.

```sh
rtk terraform -chdir=infra/terraform output
```

After deployment, upload only the fictional samples to the `documents_bucket_name` output, preserving department folders. S3 sends object-created events through EventBridge to the ingestion Lambda. Ingestion creates Qdrant keyword indexes for `department` and `document_id` before replacing filtered records. The API uses FastEmbed on CPU, Qdrant department filters, and Groq JSON answers with server-validated citation IDs. Set both `groq_input_rate_per_million_usd` and `groq_output_rate_per_million_usd` from current pricing to show cost estimates; otherwise cost is reported as unavailable. Terraform resources and provider usage can still incur charges, including Cognito domain, S3 storage, Lambda, API Gateway, and Secrets Manager. `terraform destroy` removes the managed AWS resources; versioned bucket objects must be removed before destroy.

Track deployment and demo progress in the [implementation plan](docs/superpowers/plans/2026-10-06-knowledgellm-full-stack-prototype.md#deployment-and-demo-checklist). The Terraform-managed private Lambda artifact bucket is temporary deployment storage and is force-removed during `terraform destroy`; keep its contents limited to the built code package.

Before provisioning, review account-specific allowances and current provider terms: [Cognito](https://aws.amazon.com/cognito/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/), [API Gateway](https://aws.amazon.com/api-gateway/pricing/), [S3](https://aws.amazon.com/s3/faqs/), [Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/), [Qdrant](https://qdrant.tech/pricing/), [Groq rate limits](https://console.groq.com/docs/rate-limits), and [Groq data handling](https://console.groq.com/docs/your-data). Check CloudWatch pricing in the observability section below.

## Cloudflare Pages setup

Cloudflare is configured separately from the AWS Terraform stack. Check [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) before deployment; domain registration and backend services have separate costs.

1. In Cloudflare Workers & Pages, create a Pages project connected to this GitHub repository. Select the approved frontend branch; use `main` for production after the implementation is merged.
2. Set root directory to `web`, build command to `npm run build`, output directory to `dist`, and Node.js to a supported version (22.12+). See the [Vite guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/).
3. Choose a stable origin such as `https://knowledgellm.pages.dev` or `https://knowledge.example.com`. Set Terraform `web_origin` to that origin, and `web_callback_url` and `web_logout_url` to the same URL with a trailing `/`. Review and apply the Terraform plan.
4. Set Pages production build variables from Terraform outputs:

   | Pages variable | Terraform output or value |
   | --- | --- |
   | `VITE_API_URL` | `api_url` |
   | `VITE_COGNITO_DOMAIN` | `cognito_domain_url` |
   | `VITE_COGNITO_ISSUER` | `cognito_issuer` |
   | `VITE_COGNITO_CLIENT_ID` | `cognito_client_id` |
   | `VITE_REDIRECT_URI` | Exact `web_callback_url` |

5. Deploy or rebuild after setting variables. Check HTTPS sign-in, logout, account switching, source links, chat, and page refresh on the stable URL. Provider keys stay in the AWS backend secret store; GitHub Secrets or Pages build settings do not automatically configure Lambda.
6. For a custom domain, add it under the Pages project's Custom domains settings and complete the [required DNS setup](https://developers.cloudflare.com/pages/configuration/custom-domains/). When changing domains, update Terraform CORS/callback/logout URLs and the Pages redirect variable, rebuild, and repeat login checks. Preview URLs need separately allowed URLs; the current stack accepts one configured origin/callback/logout URL.

## Chat observability

📊 Chat telemetry is written as structured metadata to the Terraform output `knowledge_log_group_name`: token counts, estimated model cost, latency, department, retrieved count, and guardrail outcome. It does not log questions, answers, or source text. Terraform sets log retention to seven days and creates no custom metrics or paid dashboards. AWS currently includes 5 GB/month for CloudWatch Logs ingestion, archive storage, and Logs Insights scan data, but this allowance is shared across the account and is not a guarantee of a $0 bill. Review current regional pricing and set AWS billing alerts before deployment. [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/).

In CloudWatch Logs Insights, select that log group to summarize guardrail outcomes:

```text
fields @timestamp, @message
| filter @message like /chat_telemetry/
| parse @message /"guardrail_action":"(?<action>[^"]+)"/
| stats count() by action
```

To review token use by hour:

```text
fields @timestamp, @message
| filter @message like /chat_telemetry/
| parse @message /"input_tokens":(?<input_tokens>\d+)/
| parse @message /"output_tokens":(?<output_tokens>\d+)/
| stats sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens by bin(1h)
```

## Access and prototype limits

API Gateway validates JWTs. The API derives access only from the verified `cognito:groups` claim; request department values are ignored. S3 stays private, source links expire after 120 seconds, and unknown or cross-department document IDs return the same not-found response. Ingestion accepts only catalogued Markdown keys up to 1 MB. Document IDs are opaque single path segments; S3 keys remain department-prefixed.

The PII guardrail currently detects and redacts common email, phone, and U.S. SSN patterns. This is a prototype filter, not comprehensive PII detection or a compliance control. Keep real company data out of the sample until provider handling, deployment region, retention, and organizational approval have been reviewed. Provider errors do not return prompts or source excerpts. See [the product spec](docs/superpowers/specs/2026-10-06-knowledgellm-design.md) for architecture, failure behavior, and cost assumptions.

## Cleanup

Remove the Pages project and its associated custom-domain DNS records if the public demo is no longer needed. Empty all object versions and delete markers in the private document bucket before destroying the AWS resources:

```sh
rtk terraform -chdir=infra/terraform destroy
```

Confirm the managed resources are gone. Secrets created outside Terraform, external Qdrant clusters, and Groq/Qdrant credentials require separate cleanup. Preserve any resources still used by another environment.
