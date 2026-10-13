# Delivery Checklist: Hybrid Search and Five-Minute Cache

- [x] Implement hybrid dense + BM25/RRF retrieval, schema validation, and versioned ingestion manifests.
- [x] Implement the department/version-scoped fixed-question DynamoDB cache with a 300-second logical expiry.
- [x] Add bilingual `Cached Hit` and authenticated `Unlocked` labels with frontend tests.
- [x] Run backend/frontend tests, production build, Terraform validation, and migration dry-run.
- [x] Obtain independent code/simplification, security, and source-level web-performance approvals.
- [x] Deploy the existing ingestion Lambda, migrate and verify 12 S3 versions, evaluate 30 bilingual retrieval cases against the dense baseline, and preserve the old collection.
- [x] Cut the existing knowledge Lambda over to hybrid search, enable the existing DynamoDB cache, and verify live cache miss/hit, scope isolation, citations, and Traditional Chinese output.
- [ ] Deploy the frontend to its hosting provider and verify the labels in the hosted authenticated UI; this checkout contains no frontend hosting deployment workflow.
- [x] Submit signed PR #20 to `main` after final branch/check review.
- [x] Fix chat layout so the question composer stays fixed at the bottom of the chat pane while conversation history scrolls vertically above it; keep the composer usable with the on-screen keyboard and in short viewports.

## NotebookLM-Inspired Workspace Redesign

- [x] Review and refine the active Pen design against the Sources / Chat / Studio workflow specification while preserving its current graphite visual style.
- [x] Implement the responsive Sources / Chat / Studio workspace shell and preserve existing persona, permission, grounding, citations, and bilingual behavior.
- [x] Match the supplied screenshots: pin the existing-style composer box to the chat pane bottom edge and make the history area above it independently scrollable, including mobile keyboard and short viewport states.
- [x] Refine source and Studio content hierarchy, plus loading, empty, locked, and error states.
- [x] Add a restrained 160ms opacity/6px answer-entry transition with the existing easing and an 80ms opacity-only reduced-motion version; keep frequent navigation, history scrolling, and the composer still.
- [x] Use persistent mobile Sources / Chat / Studio bottom tabs, keep Chat active initially, and return to Chat and send immediately when a prompt is chosen.
- [x] Verify desktop, tablet, and mobile layouts, keyboard/accessibility behavior, reduced motion, and no horizontal overflow; provide local and temporary public preview URLs.
