# PR #19 Code Review and Web Performance Audit

Recorded on 2026-10-12 for [PR #19](https://github.com/coastk05396/knowledgellm/pull/19). Product requirements remain in [PROMTS.md](../PROMTS.md). This review prepares the existing PR for delivery; it does not authorize production cutover.

## Code review and simplification

An independent native reviewer examined all 21 changed files from `origin/main` at `2a17cefe0ce69f75426ffa516366719ff1783287` through `c3c3ee0`. The review covered remote Qdrant inference serialization, department and immutable source-version filters, completion publication after successful upsert, cache identity, migration checks, Terraform/SAM IAM and rollback documentation. Verdict: **APPROVED**, with no blocking correctness, permission or source-version findings. The reviewer independently ran all **167 backend tests**.

The coordinator implemented the review's limited simplifications and the reviewer approved the five-file follow-up diff:

- Define embedding model/collection defaults once in `embedding.py`, and reuse them in answer-cache identity. Environment override behavior is retained.
- Move the existing UTF-8 byte splitter into that shared leaf module. Ingestion no longer imports the provider implementation merely to split text; the provider's existing imported helper remains available to callers.
- Remove the redundant collection alias in `index_versions.py` without changing collection selection.

The splitter's algorithm, 240-byte bound, input/output behavior, cache key contents and provider calls are unchanged. No frontend code was modified for this audit.

## Mobile lab measurements

The coordinator captured the production frontend with Playwright/CDP using headless Chromium **153.0.8010.12** on the local Vite preview. Five cold browser contexts used a **390 × 844** viewport, device scale factor 1, **4× CPU slowdown**, **150 ms network latency**, **187,500 bytes/s download**, **93,750 bytes/s upload**, and disabled HTTP cache. The temporary preview build uses `/api` for its API URL; guest startup makes no authenticated document or chat requests. Measurements therefore do not include Cloudflare round-trip latency or backend generation.

The final sample ran without concurrent coordinator tests/builds. The first baseline produced a 1,244 ms LCP median. A second capture overlapped tests/building and had a 1,280–2,612 ms LCP range; it was excluded from acceptance. The isolated five-run sample below is the reported evidence.

| Run | FCP/LCP (ms) | CLS | First CH click (ms) | Return EN click (ms) |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1,380 | 0.0000282 | 128 | 40 |
| 2 | 1,288 | 0.0000282 | 112 | 88 |
| 3 | 1,532 | 0.0000282 | 120 | 32 |
| 4 | 1,272 | 0.0000282 | 112 | 40 |
| 5 | 1,220 | 0.0000282 | 128 | 48 |
| Median | **1,288** | **0.0000282** | **120** | **40** |

All five runs returned HTTP 200 with no recorded page errors or horizontal overflow. The independent performance auditor reviewed the source, mobile screenshot and raw measurements: **APPROVED for the bounded source/artifact and lab audit**.

Click attribution includes event name, interaction ID, start time and processing timestamps. The first CH switch's median input delay/handler/presentation remainder was **13.5/15.8/91.5 ms**; the EN return was **8.5/10.6/24.4 ms**. Presentation remainder is `startTime + duration - processingEnd`; event durations are quantized, and separate medians need not sum exactly. The aggregate 248 ms sampled-event median includes hover events with interaction ID zero, so it is not language-switch latency. These short scripted samples are **not field INP**.

Initial encoded transfers were **100,607 bytes JavaScript**, **4,454 bytes CSS**, and **100,620 bytes across five WOFF2 fonts**. The ordinary production build reports **100.62 kB gzip JavaScript** and **4.45 kB gzip CSS**; the API URL string accounts for the small preview-bundle difference. WOFF fallback files are emitted but were not downloaded by Chromium. The largest recorded startup long task was **269 ms**; its cause was not attributed by this capture.

Raw capture: `/tmp/knowledgellm-perf-review/baseline-isolated.json`, SHA-256 `722ad8b5466716da86fe7f76fd2637ac0a1d5b4c3154b1d1aeb0df0e4a87e894`. Mobile screenshot: `/tmp/knowledgellm-perf-review/baseline-isolated-mobile.png`. These local artifacts are temporary; the table and method above preserve the reviewed results in the PR.

## Decisions and limits

| Candidate | Evidence | Decision |
| --- | --- | --- |
| Share embedding defaults and move the splitter | Independent review; existing behavior tests pass | Kept; simpler backend dependencies |
| Lazy-load OIDC | Eager SDK import is visible, but initial load and sampled clicks are healthy | Not implemented; no measured failing metric to justify added auth lifecycle complexity |
| Remove WOFF fallbacks or preload/reduce font weights | Browser already uses WOFF2; all five weights are used and have `font-display: swap` | Not implemented; no demonstrated transfer or paint improvement |
| Memoize document lists or virtualize history | Three departments/six logical documents; no large-session profile | Not implemented; no demonstrated render bottleneck |

The first CH paint is slower than the return to EN. Layout, paint or first CJK fallback-font work could contribute, but the causes are unproven without trace attribution. The audit does not establish real-phone performance, field Core Web Vitals, authenticated workspace performance, long-chat rendering cost, deployed API latency or new Qdrant retrieval quality. It claims no performance improvement because no web optimization was retained.

## Delivery verification

The coordinator reran **167 backend tests**, **58 frontend tests**, and the type-checked production build after simplification. Frontend tests used `NODE_OPTIONS=--localstorage-file=/tmp/knowledgellm-review-localstorage` for this Node 26 environment. `npm audit --omit=dev --audit-level=high` reported **zero vulnerabilities** in its current production dependency inventory. The deployment ZIP was rebuilt, and diff whitespace checks passed.

Terraform/SAM sources did not change in this follow-up; their preceding format/validation evidence remains in [product development](product-development.md). No new Terraform plan/apply, live model call, source indexing or AWS deployment was performed. Production readiness still requires the staged twelve-source migration and bilingual retrieval checks in the [operations guide](qdrant-cloud-inference-operations.md). Its cache gate and rollback procedure remain the release controls.
