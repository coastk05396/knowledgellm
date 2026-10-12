# KnowledgeLLM

Permission-aware RAG demo for Finance, Operations, and People, with grounded citations and optional answer caching.

## Tech Stack

**Frontend:** React 19 · TypeScript · Vite · Lucide React · IBM Plex · Vitest · Testing Library

**Backend:** Python 3.12 · boto3 · Qdrant Cloud Inference (multilingual embeddings) · Qdrant Cloud · Groq (`openai/gpt-oss-20b`) · pytest

The demo embeds both English and Traditional Chinese Markdown with Qdrant Cloud Inference's free `intfloat/multilingual-e5-small` model (384 dimensions). The existing English and translated sources stay in one new, model-specific collection.

**Infra:** Cognito · API Gateway · Lambda · S3 · EventBridge · DynamoDB · Parameter Store · IAM · CloudWatch · Terraform · AWS SAM

## Hybrid Workflow

```text
SIGN-IN
  React UI ⇄ Cognito ⇄ Demo-auth Lambda
                │ access token
                ▼
CHAT / DOCUMENT ACCESS
  React UI → API Gateway (JWT) → Knowledge Lambda
                                  │
                                  ├── Documents → Authorized S3 links → UI
                                  │
                                  └── Chat → Scope / PII / S3 index checks
                                               │
                                               ▼
                                         DynamoDB cache
                                          │                       │
                                         HIT                MISS / BYPASS
                                          │                       ▼
                                          │     Qdrant Cloud Inference (query vector)
                                          │                       │
                                          │                       ▼
                                          │     ┌────────────────────────────────────┐
                                          │     │ Qdrant Cloud · Chunk DB            │
                                          │     │ Chunk 1 · Chunk 2 · Chunk 3        │
                                          │     │ Text + vector + source metadata    │
                                          │     │ Department / version filters       │
                                          │     └─────────────────┬──────────────────┘
                                          │                       │ matching chunks
                                          │                       ▼
                                          │                 Groq → Validation
                                          │                       ├── Eligible write → DynamoDB
                                          ▼                       ▼
                                        Answer + citations → UI

INGESTION
  S3 upload → EventBridge → Ingestion Lambda → Qdrant Cloud Inference
                                  ▲                  │ vectors
                                  │ read version     ▼
                                  S3 ◄── Manifest ── Qdrant Chunk DB

SUPPORTING SERVICES
  Lambdas → Parameter Store (keys) / CloudWatch (logs)
  IAM → Scoped permissions · Terraform / SAM → AWS resources
```

Cache: exactly 15 suggested questions, 24-hour TTL, disabled by default. Custom questions bypass caching; source-version changes invalidate earlier entries. [Operations guide](docs/qdrant-cloud-inference-operations.md).

## All-AWS Reference

Proposed architecture · not deployed.

**Frontend:** React · TypeScript · Vite

**Backend:** Python 3.12 Lambda · Bedrock Knowledge Bases · Titan Embeddings V2 · Nova Pro · Bedrock Guardrails · OpenSearch Serverless

**Infra:** Route 53 · Amplify Hosting · Cognito · API Gateway · S3 · EventBridge · Step Functions · IAM · KMS · CloudWatch · X-Ray · CloudTrail

```text
FRONTEND / SIGN-IN
  Route 53 → Amplify Hosting → React UI ⇄ Cognito
                                  │ access token
                                  ▼
CHAT
  API Gateway (JWT) → Lambda (department scope)
                          │
                          ▼
                 Bedrock Knowledge Bases
                          │
                          ▼
                 Titan V2 (query vector)
                          │
                          ▼
        ┌────────────────────────────────────┐
        │ OpenSearch Serverless · Chunk DB   │
        │ Chunk 1 · Chunk 2 · Chunk 3        │
        │ Text + vector + source metadata    │
        │ Department filters                 │
        └─────────────────┬──────────────────┘
                          │ matching chunks
                          ▼
  Input / source Guardrails → Nova Pro → Output Guardrails
                                             │
                                             ▼
                              Lambda citation checks → UI

INGESTION
  S3 → EventBridge → Step Functions + Lambda
                              │
                              ▼
                  Knowledge Bases ingestion → Titan V2
                                                 │ vectors
                                                 ▼
                                  OpenSearch Chunk DB

SUPPORTING SERVICES
  IAM / KMS → Access / encryption
  CloudWatch / X-Ray / CloudTrail → Logs / traces / audit
```

## Security & Telemetry

Cognito groups enforce department access; the backend checks citations, blocks common PII patterns, and masks source PII. CloudWatch records latency, token counts, cache status, and guardrail outcomes without raw content or authentication tokens.

## Quickstart

Requires Node.js 20.19+ or 22.12+, Python 3.12, and configured AWS credentials.

### 1 · Web App

From `web/`, configure `.env.local` with public API/Cognito values.

```sh
rtk proxy cp .env.example .env.local
rtk npm ci
rtk npm run dev      # http://localhost:5173
rtk npm test
rtk npm run build
```

Optional public preview with [cloudflared](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/): keep Vite running and use a second terminal.

```sh
rtk proxy cloudflared tunnel --url http://localhost:5173 --http-host-header localhost:5173
```

Open the printed HTTPS URL; Ctrl+C stops the tunnel. For API calls, add that URL's origin to API Gateway CORS (`web_origin`).

### 2 · Backend API

From `api/`:

```sh
rtk proxy python3.12 -m venv .venv
rtk proxy .venv/bin/python -m pip install -e '.[dev]'
rtk proxy .venv/bin/python -m pytest
```

### 3 · Deploy Infrastructure (Terraform)

From the repository root, configure `terraform.tfvars`, the S3 state backend, and backend provider secrets before deployment.

```sh
rtk proxy bash scripts/package-lambdas.sh
rtk proxy cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# Fill in terraform.tfvars before initialization and review the plan.
rtk proxy terraform -chdir=infra/terraform init
rtk proxy terraform -chdir=infra/terraform plan -out=tfplan
rtk proxy terraform -chdir=infra/terraform apply tfplan
```

## License

Fictional educational prototype for portfolio and technical demonstration purposes.
