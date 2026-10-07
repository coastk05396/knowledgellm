# KnowledgeLLM

Permission-aware RAG demo for Finance, Operations, and People, with grounded citations and optional answer caching.

## Tech Stack

**Frontend:** React 19 · TypeScript · Vite · Lucide React · IBM Plex · Vitest · Testing Library

**Backend:** Python 3.12 · boto3 · Bedrock Cohere Multilingual v3 · Qdrant Cloud · Groq (`openai/gpt-oss-20b`) · pytest

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
                                          │          │
                                         HIT    MISS / BYPASS
                                          │          ▼
                                          │    Bedrock Cohere → Qdrant
                                          │          │ scoped excerpts
                                          │          ▼
                                          │      Groq → Validation
                                          │          ├── Eligible write → DynamoDB
                                          ▼          ▼
                                        Answer + citations → UI

INGESTION
  S3 upload → EventBridge → Ingestion Lambda → Bedrock Cohere
                                  ▲                  │ vectors
                                  │ read version     ▼
                                  S3 ◄── Manifest ── Qdrant

SUPPORTING SERVICES
  Lambdas → Parameter Store (keys) / CloudWatch (logs)
  IAM → Scoped permissions · Terraform / SAM → AWS resources
```

Cache: exactly 15 suggested questions, 24-hour TTL, disabled by default. Custom questions bypass caching; source-version changes invalidate earlier entries. [Operations guide](docs/cohere-demo-cache-operations.md).

## All-AWS Reference

Undeployed alternative using Bedrock Knowledge Bases, Titan embeddings, OpenSearch Serverless, Nova Pro, and Step Functions.

![KnowledgeLLM All-AWS Managed Reference Architecture](docs/design/architecture/knowledgellm-all-aws-architecture.webp)

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
