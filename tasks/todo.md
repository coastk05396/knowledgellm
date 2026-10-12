# Delivery Checklist: Hybrid Search and Five-Minute Cache

- [x] Implement hybrid dense + BM25/RRF retrieval, schema validation, and versioned ingestion manifests.
- [x] Implement the department/version-scoped fixed-question DynamoDB cache with a 300-second logical expiry.
- [x] Add bilingual `Cached Hit` and authenticated `Unlocked` labels with frontend tests.
- [x] Run backend/frontend tests, production build, Terraform validation, and migration dry-run.
- [x] Obtain independent code/simplification, security, and source-level web-performance approvals.
- [x] Deploy the existing ingestion Lambda, migrate and verify 12 S3 versions, evaluate 30 bilingual retrieval cases against the dense baseline, and preserve the old collection.
- [x] Cut the existing knowledge Lambda over to hybrid search, enable the existing DynamoDB cache, and verify live cache miss/hit, scope isolation, citations, and Traditional Chinese output.
- [ ] Deploy the frontend to its hosting provider and verify the labels in the hosted authenticated UI; this checkout contains no frontend hosting deployment workflow.
- [ ] Submit the signed pull request after final branch/check review.
