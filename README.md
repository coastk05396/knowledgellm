# KnowledgeLLM

> **Enterprise-grade, permission-aware RAG knowledge assistant with sub-20ms answer caching, zero-trust department isolation, and grounded citation verification.**

Built with **React / TypeScript / Vite**, **AWS Lambda (Python 3.12)**, **Amazon Cognito**, **Amazon DynamoDB**, **AWS Bedrock (Cohere Multilingual v3)**, **Qdrant Cloud**, and **Groq Cloud LLM**, fully provisioned with **Terraform**.

---

## ⚡ Key Engineering Highlights (Portfolio Focus)

- **Sub-20ms Cached Inferences**: Implemented an exact-match DynamoDB Cache-Aside layer for high-frequency suggested prompts, achieving a **99% latency reduction (~15ms vs ~1.8s)** and zero repeated LLM token costs.
- **Cold-Start Elimination (15s $\rightarrow$ <200ms)**: Migrated local model downloads to Singapore-region **AWS Bedrock Cohere Multilingual v3 (1024-dim)**, eliminating Lambda CPU-bound container cold-start delays.
- **Zero-Trust Role-Based Access Control (RBAC)**: User permissions are strictly enforced via verified **Amazon Cognito JWT groups** (`finance`, `operations`, `people`). Department boundaries are applied at both Qdrant vector retrieval and citation validation stages.
- **Zero Hallucination Guardrails**: Prompts enforce `temperature=0` with rigid JSON output schemas. The backend validates that all cited document IDs actually exist in the user's permitted excerpt context before returning answers.
- **Event-Driven Ingestion Pipeline**: S3 Markdown uploads automatically trigger **EventBridge** prefix-filtered rules $\rightarrow$ **Ingestion Lambda** $\rightarrow$ Qdrant upserts and writes immutable **S3 completion manifests** for fail-closed data integrity.

---

## 🏗️ System Architecture & Request Lifecycle

![KnowledgeLLM Advanced RAG & Cache Architecture](docs/design/architecture/knowledgellm-rag-pipeline.svg)

### Minimalist Terminal Architecture (End-to-End Flow)

```text
  [ CLIENT (React) ] ──(Cognito JWT)──> [ API GATEWAY (JWT Authorizer) ] ──> [ ORCHESTRATOR LAMBDA ]
                                                                                       │
                                               ┌───────────────────────────────────────┴───────────────────────────────────────┐
                                               ▼ [Fast Path: Cache HIT]                                                        ▼ [RAG Fallback: Cache MISS]
                                      ┌────────────────────────────────┐                                              ┌────────────────────────────────┐
                                      │    Amazon DynamoDB Cache       │                                              │      AWS Bedrock Cohere v3     │
                                      │  (15 Prompts · SHA256 Key)     │                                              │   (1024-dim, ap-southeast-1)   │
                                      │    ~15ms · 0 Tokens · $0       │                                              └───────────────┬────────────────┘
                                      └────────────────┬───────────────┘                                                              │ Dense Vector [0.012, ...]
                                                       │                                                                              ▼
                                                       │                                                              ┌────────────────────────────────┐
                                                       │                                                              │       Qdrant Vector DB         │
                                                       │                                                              │  (Scoped Dept Payload Filter)  │
                                                       │                                                              └───────────────┬────────────────┘
                                                       │                                                                              │ Top 5 Scoped Chunks
                                                       │                                                                              ▼
                                                       │                                                              ┌────────────────────────────────┐
                                                       │                                                              │         Groq Cloud LLM         │
                                                       │                                                              │   (gpt-oss-20b · temp=0 JSON)  │
                                                       │                                                              └───────────────┬────────────────┘
                                                       │                                                                              │ Answer + Citations
                                                       └───────────────────────────────┬──────────────────────────────────────────────┘
                                                                                       ▼
                                                                        [ 200 OK Grounded Response ]
```

---

## 🍱 Architecture Bento Box (Component Breakdown)

| Layer | Component | Tech Stack | Role & Key Metrics |
|---|---|---|---|
| **01 · Identity** | Custom Demo Auth | **Amazon Cognito User Pool** | Passwordless 1-click persona switching (`finance`, `operations`, `people`) |
| **02 · Gateway** | HTTP API Gateway | **API Gateway v2** | Server-side JWT signature & claims verification, low-latency routing |
| **03 · Fast Path** | Answer Cache | **Amazon DynamoDB** | **~15ms latency**, 0 Groq tokens, 24h TTL for 15 hot demo questions |
| **04 · Embeddings** | Managed Embeddings | **AWS Bedrock Cohere v3** | **1024-dim**, Singapore local (`ap-southeast-1`), eliminates 15s cold starts |
| **05 · Vector DB** | Isolated Retrieval | **Qdrant Cloud** | Metadata-filtered vector search strictly bounded by authorized department |
| **06 · Inference** | Grounded LLM | **Groq Cloud (`gpt-oss-20b`)** | Temperature=0, rigid JSON output schema, mandatory citation enforcement |
| **07 · Ingestion** | Event-Driven Pipeline | **Amazon S3 + EventBridge** | Prefix-filtered triggers (`finance/`, etc.) with immutable completion manifests |
| **08 · IaC** | Cloud Automation | **Terraform & AWS SAM** | Multi-resource orchestration with S3 remote state and automated packaging |

---

## 🔐 Security & Multi-Tenancy Architecture

1. **Server-Enforced Role-Based Access Control (RBAC)**:
   - Users belong to distinct Cognito groups: `finance`, `operations`, or `people`.
   - The backend validates the Cognito JWT access token and extracts group claims server-side.
   - Vector search strictly filters retrieval points by authorized departments:
     ```python
     # Qdrant retrieval strictly bounded by authorized department claims
     models.Filter(must=[models.FieldCondition(key="department", match=models.MatchValue(value=dept))])
     ```
2. **Anti-Hallucination Citation Verification**:
   - The LLM is constrained by system prompts to answer strictly from supplied context excerpts.
   - The backend parses returned citation IDs and checks them against permitted S3 document IDs. If citations are missing, mismatched, or out-of-scope, the request fails closed.
3. **Defense-in-Depth PII Guardrails**:
   - Regex-based guardrails sanitize user input questions and model output answers for sensitive personal data (email, phone, SSN).

---

## 🚀 Quickstart & Local Development

### Prerequisites
- Node.js 20+ / npm
- Python 3.12
- AWS CLI configured with active credentials

### 1. Web App
```sh
cd web
npm install
npm run dev      # Local Vite dev server on http://localhost:5173
npm test         # Run 45 Vitest unit & integration tests
npm run build    # Type-checked production bundle
```

### 2. Backend API
```sh
cd api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest           # Run backend test suite
```

### 3. Deploy Infrastructure (Terraform)
```sh
# 1. Package Lambda artifacts (Linux x86_64 compatible)
bash scripts/package-lambdas.sh

# 2. Deploy AWS Infrastructure
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

---

## 📊 Telemetry & CloudWatch Observability

Chat telemetry is logged as structured JSON metadata to `/aws/lambda/knowledgellm-demo-knowledge`:
- **Latency & Tokens**: Request duration (ms), input/output token counts, and estimated inference cost.
- **Guardrail Outcomes**: Explicit tracking of PII outcomes (`pass`, `question_pii_blocked`, `source_pii_redacted`).
- **Cache Metrics**: Real-time hit/miss logging for DynamoDB performance verification.

---

## 📄 License
Fictional educational prototype created for portfolio and technical demonstration purposes.
