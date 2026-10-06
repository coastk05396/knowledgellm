# KnowledgeLLM

🔐 KnowledgeLLM is a permission-aware knowledge assistant prototype. Cognito manages username/password sign-in; a Python API applies Cognito group access before listing S3 documents or retrieving Qdrant chunks. Answers cite only approved, retrieved documents. The included content is fictional.

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

Pages serves static assets without a Docker container. Keep provider keys in the backend secret store; all `VITE_*` configuration is visible in the browser bundle. Cloudflare's static asset requests are free and unlimited, subject to other platform limits; AWS and external providers have separate charges. See [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/) and the Cloudflare deployment checklist in [promt.md](promt.md).

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

After deployment, upload only the fictional samples to the `documents_bucket_name` output, preserving department folders. S3 sends object-created events through EventBridge to the ingestion Lambda. Ingestion creates Qdrant keyword indexes for `department` and `document_id` before replacing filtered records. The API uses FastEmbed on CPU, Qdrant department filters, and Groq JSON answers with server-validated citation IDs. Set both `groq_input_rate_per_million_usd` and `groq_output_rate_per_million_usd` from current pricing to show cost estimates; otherwise cost is reported as unavailable. Terraform resources and provider usage can still incur charges, including Cognito domain, S3 storage, Lambda, API Gateway, and Secrets Manager. `terraform destroy` removes the managed AWS resources; versioned bucket objects must be removed before destroy.

See [promt.md](promt.md) for the pre-deployment, demo, and cleanup checklist. The Terraform-managed private Lambda artifact bucket is temporary deployment storage and is force-removed during `terraform destroy`; keep its contents limited to the built code package.

## Access and prototype limits

API Gateway validates JWTs. The API derives access only from the verified `cognito:groups` claim; request department values are ignored. S3 stays private, source links expire after 120 seconds, and unknown or cross-department document IDs return the same not-found response. Ingestion accepts only catalogued Markdown keys up to 1 MB. Document IDs are opaque single path segments; S3 keys remain department-prefixed.

The PII guardrail currently detects and redacts common email, phone, and U.S. SSN patterns. This is a prototype filter, not comprehensive PII detection or a compliance control. Keep real company data out of the sample until provider handling, deployment region, retention, and organizational approval have been reviewed. Provider errors do not return prompts or source excerpts. See [the product spec](docs/superpowers/specs/2026-10-06-knowledgellm-design.md) for architecture, failure behavior, and cost assumptions.
