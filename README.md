# KnowledgeLLM

> **Permission-aware RAG knowledge assistant with department-scoped retrieval, grounded citations, and an optional answer cache.**

A fictional enterprise knowledge demo for Finance, Operations, and People. The browser signs in with Amazon Cognito; the backend enforces document access and answers questions using authorized sources.

## Tech Stack

### Frontend

| Technology | Use case |
|---|---|
| **React 19 + TypeScript** | Typed chat UI, department folders, persona switching, citations, and guardrail/token feedback. |
| **Vite** | Local development server and production asset builds. |
| **Lucide React + IBM Plex fonts** | Interface icons and readable sans-serif/monospace typography. |
| **Vitest + Testing Library** | Component and interaction tests. |

### Backend

| Technology | Use case |
|---|---|
| **Python 3.12** | API handlers, document ingestion, authorization, PII checks, and citation validation. |
| **Amazon Bedrock · Cohere Multilingual v3** | Converts documents (`search_document`) and questions (`search_query`) into 1,024-dimensional vectors in `ap-southeast-1`. |
| **Qdrant Cloud** | Stores document chunks and vectors; searches with authorized department and indexed source-version filters. |
| **Groq Cloud · `openai/gpt-oss-20b`** | Generates structured answers and citation IDs from retrieved excerpts. |
| **boto3 + Qdrant/Groq SDKs** | Connects backend handlers to AWS storage, embeddings, caching, and external providers. |
| **pytest** | Tests authentication, permissions, ingestion, chat, cache behavior, and provider failures. |

### Infra

The hybrid stack is defined in [`infra/terraform/`](infra/terraform/), with a maintained [`template.yaml`](template.yaml) for AWS SAM. This describes the repository configuration; it is not a fresh verification of the live deployment.

| Service / Tool | Use case |
|---|---|
| **Amazon Cognito** | Issues access tokens through custom demo challenges; department groups define each persona's access. |
| **Amazon API Gateway · HTTP API** | Validates JWTs and routes document/chat requests to the knowledge Lambda; configures browser CORS. |
| **AWS Lambda · knowledge** | Serves document listings, authorized source links, and chat; coordinates cache lookup, retrieval, generation, and validation. |
| **AWS Lambda · ingestion** | Reads approved Markdown document versions, chunks text, embeds it, and indexes it in Qdrant. |
| **AWS Lambda · demo-auth** | Handles Cognito Define/Create/Verify challenge triggers for allowlisted fictional personas when `DEMO_MODE=true`. |
| **Amazon S3** | Private, encrypted, versioned source documents and index-completion manifests; a separate bucket holds Lambda ZIP artifacts. |
| **Amazon EventBridge** | Routes S3 Object Created events under `finance/`, `operations/`, and `people/` to ingestion Lambda. Manifest writes under `_indexes/` do not retrigger ingestion. |
| **Amazon DynamoDB** | Encrypted, on-demand answer cache for exactly 15 suggested questions, with a 24-hour TTL and application-side expiry checks. |
| **AWS Systems Manager Parameter Store** | Keeps Qdrant and Groq keys backend-only as SecureString parameters; existing Secrets Manager ARNs are also supported. |
| **AWS IAM** | Separate Lambda roles scope access to documents, manifests, the cache table, embeddings, secrets, and logs. |
| **Amazon CloudWatch Logs** | Captures structured request, cache, token, and guardrail telemetry; Lambda logs have seven-day retention. |
| **Terraform + AWS SAM** | Terraform provisions the hybrid AWS resources with encrypted S3 remote state and locking; SAM maintains an alternative deployment template. |

## Hybrid Workflow

### 1 · Sign-in and Authorized Document Access

```text
┌──────────────────────────────┐
│ React UI · select a persona  │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐     ┌──────────────────────────────┐
│ Cognito · CUSTOM_AUTH        │◄───►│ Demo-auth Lambda             │
│ Finance / Operations / People│     │ Define / Create / Verify     │
└──────────────┬───────────────┘     │ Allowlisted demo personas    │
               │ access token        └──────────────────────────────┘
               ▼
┌──────────────────────────────┐
│ React UI · authenticated API │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ API Gateway · JWT validation │
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Knowledge Lambda             │
│ Enforce Cognito group scope  │
└──────────────┬───────────────┘
               ├── GET /documents ───────► Authorized catalog → UI
               │
               ├── GET /documents/{id} ─► Permission check
               │                          → 120-second S3 link
               │                          → Browser reads source
               │
               └── POST /chat ──────────► Cache / RAG workflow below
```

### 2 · Chat, Answer Cache, and RAG

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ React UI → API Gateway (JWT) → Knowledge Lambda                          │
│ Enforce department scope → validate question / block input PII           │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ S3 · compare current source versions with completion manifests           │
│ Build index fingerprint; incomplete indexing → unavailable response      │
└─────────────────────────────────────┬────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Exact suggested question + cache enabled? → DynamoDB lookup              │
│ Key: question + full scope + index + model / prompt / guardrail versions │
└─────────────────┬──────────────────────────────────────┬─────────────────┘
                  │ valid HIT                            │ MISS / BYPASS
                  ▼                                      ▼
┌────────────────────────────────────┐ ┌────────────────────────────────────┐
│ Recheck expiry, permissions,       │ │ Bedrock · Cohere Multilingual v3   │
│ output PII, citations, and         │ │ Embed question · search_query      │
│ current source versions            │ └─────────────────┬──────────────────┘
│ Skip embeddings / Qdrant / LLM     │                   │
└─────────────────┬──────────────────┘                   ▼
                  │                    ┌────────────────────────────────────┐
                  │                    │ Qdrant Cloud                       │
                  │                    │ Department + version filters       │
                  │                    │ Retrieve supporting chunks         │
                  │                    └─────────────────┬──────────────────┘
                  │                                      │
                  │                                      ▼
                  │                    ┌────────────────────────────────────┐
                  │                    │ Knowledge Lambda → Groq Cloud      │
                  │                    │ Mask source PII; supply question   │
                  │                    │ + prompt + authorized excerpts     │
                  │                    │ Generate answer + citation IDs     │
                  │                    └─────────────────┬──────────────────┘
                  │                                      │
                  │                                      ▼
                  │                    ┌────────────────────────────────────┐
                  │                    │ Knowledge Lambda                   │
                  │                    │ Check output PII / citations       │
                  │                    │ Recheck current source versions    │
                  │                    └─────────────────┬──────────────────┘
                  │                                      │
                  │                                      ├── Eligible answer → DynamoDB
                  │                                      │   24-hour TTL
                  └───────────────────┬──────────────────┘
                                      ▼
                  ┌──────────────────────────────────────┐
                  │ API Gateway → React UI               │
                  │ Answer / refusal + citations         │
                  │ Guardrail, usage, and cache status   │
                  └──────────────────────────────────────┘
```

Custom questions bypass cache storage. Invalid or expired cache entries use the RAG path; DynamoDB faults fall back to normal generation. A valid hit reports zero new generation tokens, while AWS request and storage costs still apply. Cache is disabled by default; enable it only after index verification. See the [Cohere/cache operations guide](docs/cohere-demo-cache-operations.md).

### 3 · Event-Driven Document Ingestion

```text
┌────────────────────────────────────────────────────────────────────┐
│ Upload approved Markdown → private, encrypted, versioned S3 bucket │
│ finance/ · operations/ · people/                                   │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │ Object Created event
                                  ▼
                 ┌─────────────────────────────────┐
                 │ EventBridge · prefix filtering  │
                 └────────────────┬────────────────┘
                                  ▼
                 ┌─────────────────────────────────┐
                 │ Ingestion Lambda                │
                 │ Read immutable S3 version       │
                 │ Chunk text + trusted metadata   │
                 └────────────────┬────────────────┘
                                  ▼
                 ┌─────────────────────────────────┐
                 │ Bedrock · Cohere Multilingual v3│
                 │ Embed chunks · search_document  │
                 └────────────────┬────────────────┘
                                  ▼
                 ┌─────────────────────────────────┐
                 │ Qdrant Cloud · upsert vectors   │
                 │ Department + document + version │
                 └────────────────┬────────────────┘
                                  ▼
                 ┌─────────────────────────────────┐
                 │ S3 · write completion manifest  │
                 │ _indexes/{collection}/…         │
                 │ Chat can verify indexed versions│
                 └─────────────────────────────────┘

Supporting infrastructure:
  Knowledge / ingestion Lambdas → Parameter Store → provider keys
  All three Lambdas             → CloudWatch Logs → runtime telemetry
  IAM roles                     → scoped access to AWS resources
  Terraform                     → AWS resources + S3 state / ZIP artifacts
```

New source versions change the cache fingerprint after indexing completes, so earlier cached answers are not reused for updated documents.

## All-AWS Managed Reference

An **undeployed alternative** for teams choosing AWS-managed retrieval and generation. The hybrid stack above uses Qdrant and Groq; this reference uses Bedrock Knowledge Bases, OpenSearch Serverless, and Nova Pro instead.

![KnowledgeLLM All-AWS Managed Reference Architecture](docs/design/architecture/knowledgellm-all-aws-architecture.webp)

```text
Request path:
  Route 53 → Amplify Hosting → Cognito → API Gateway → Lambda
                                                        │
                                                        ▼
                              Bedrock Knowledge Bases → Nova Pro
                                │                       + Guardrails
                                ▼                            │
                         OpenSearch Serverless               ▼
                         (authorized retrieval)       Answer + citations

Ingestion path:
  S3 → EventBridge → Step Functions → Bedrock ingestion job
                                        │
                                        ▼
                               Titan Embeddings V2
                                        │
                                        ▼
                               OpenSearch Serverless
```

Route 53 and Amplify provide DNS and frontend hosting; Cognito and API Gateway handle identity and API access; Lambda applies authorization. Step Functions coordinates ingestion jobs, Titan embeds documents and queries, OpenSearch stores searchable vectors, and Bedrock generates answers with managed guardrails. These services are reference choices, not additional resources provisioned by the hybrid Terraform stack.

---

## 🔐 Security & Multi-Tenancy

### Server-Enforced RBAC

API Gateway validates the token; the knowledge Lambda derives authorized departments from Cognito group claims and applies that scope to document access, vector retrieval, and citation checks. Browser state cannot grant access.

```python
# Qdrant retrieval — strictly bounded by authorised department claims
models.Filter(
    must=[models.FieldCondition(key="department", match=models.MatchValue(value=dept))]
)
```

### Anti-Hallucination Citation Verification

The LLM is prompted to answer from supplied excerpts. The backend retains citation IDs only when they match authorized retrieved documents; if no valid citations remain, it returns an insufficient-evidence response. Cache storage additionally requires every returned citation ID to be valid. These checks validate source membership, not the factual accuracy of every generated sentence.

### Defense-in-Depth PII Guardrails

Regex-based checks block questions and answers containing common email, phone, and US SSN patterns, and mask PII in retrieved excerpts before generation. This is limited pattern detection, not comprehensive PII protection.

---

## 🚀 Quickstart & Local Development

### Prerequisites

- Node.js 20.19+ or 22.12+ / npm
- Python 3.12
- AWS CLI configured with active credentials

### 1 · Web App

From `web/`, copy `.env.example` to `.env.local` and fill in the public API/Cognito values from your deployment. Keep provider keys in the backend.

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

From the repository root, package the Lambdas and prepare the deployment variables. Review the S3 backend configuration for your account and configure provider secrets through Parameter Store or supported Secrets Manager ARNs.

```sh
rtk proxy bash scripts/package-lambdas.sh
rtk proxy cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
# Fill in terraform.tfvars before initialization and review the plan.
rtk proxy terraform -chdir=infra/terraform init
rtk proxy terraform -chdir=infra/terraform plan -out=tfplan
rtk proxy terraform -chdir=infra/terraform apply tfplan
```

---

## 📊 Telemetry & CloudWatch Observability

Chat telemetry is logged as structured JSON to `/aws/lambda/knowledgellm-demo-knowledge` (with the default project name). Raw questions, answers, source excerpts, and authentication tokens are excluded; inference-cost estimates do not represent the total AWS bill:

| Signal | Fields |
|--------|--------|
| **Latency & Tokens** | Request duration (ms), input / output token counts, estimated inference cost |
| **Guardrail Outcomes** | `pass` · `question_pii_blocked` · `source_pii_redacted` |
| **Cache Metrics** | `hit` / `miss` / `bypass` and per-stage durations for performance verification |

---

## 📄 License

Fictional educational prototype created for portfolio and technical demonstration purposes.
