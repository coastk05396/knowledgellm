# Traditional Chinese Markdown Correction

## Scope

The user explicitly requires translated Markdown with `-ch.md` filenames and language-matched folder/citation links. This supersedes the earlier PDF interpretation. Maintain the original six English sources plus six faithful Traditional Chinese translations in the existing S3 bucket. Preserve stable document IDs, department authorization, source version checks and language-isolated cache keys. Retain old S3 PDFs as unused history; remove our PDF-specific Git assets, dependency and generator.

## Work and Acceptance

- Backend: six translations, original/Chinese Markdown catalog mapping, UTF-8 extraction, language-selected snapshots/cache citation titles, request validation and migration tooling — implemented and verified.
- Frontend: selected language on list/open requests, refresh listing on switch and reject stale source URLs — implemented and verified.
- Coordinator: requirements/docs, upload all twelve Markdown sources, staged code deployment, real source-content/ACL/browser checks, signed PR update — implemented and verified.
- Independent review: implementation and final citation-label correction approved.

English must open the original `.md`; CH must open the corresponding `-ch.md` and display Traditional Chinese text. All twelve objects use existing department prefixes in the same private bucket. PII, citation validation and permissions remain enforced. Index completion/Chinese grounded chat remains unverified while Cohere reports NOT_AUTHORIZED.

## Initial State

Clean branch main-20261007-feat-traditional-chinese-pdf at b236105. PR #17 is open/draft. AWS account credentials work; Cohere multilingual v3 remains NOT_AUTHORIZED in Singapore. Existing local preview on 5197 and temporary Cloudflare tunnel serve this branch. No unrelated files will be staged.

## Implementation and Deployment Evidence

Coordinator reran 167 backend tests and frontend 51 tests initially and 52 after the citation-label correction, production build and diff checks successfully. Package: 105.4 MiB uncompressed contains all 12 Markdown artifacts and no PDF/pypdf. Independent reviewer passed 79 focused backend checks and read all 6 translations against originals, confirming facts/numbers/literals and catalog/ACL/source/version isolation. Citation title locale consistency was identified and assigned to the frontend builder for correction.

Reviewed targeted Terraform plan: 0 add, 3 change (artifact and two product Lambda code packages), 0 destroy; applied successfully with no configuration/resource changes. Updated package SHA256: 3da4ab3102453036279e892ca2f35b45c2b5ec05b00a7c6e6e9cc4d47fc2128f. Preserved rollback packages for previous ingestion and chat in /tmp. Full follow-up plan shows only unrelated regenerated standalone auth ZIP metadata; no apply for that change.

Uploaded six `-ch.md` translations to the existing bucket. Read-back found the original English objects lacked the repository's fictional-data notice but all policy content otherwise matched; synchronized those six originals too, retaining prior S3 versions. No S3 objects deleted, including earlier unused PDFs.

Real Chrome checks on both localhost:5197 and the temporary Cloudflare URL: Sam CH folder opens actual runbook-procedures-ch.md with Traditional Chinese content and the 10-minute rule; EN opens actual English runbook-procedures.md. No page errors; 390px screenshot has no horizontal overflow. Screenshots updated in docs/screenshots. All 12 authenticated EN/CH source downloads matched repository and S3 bytes, with inline UTF-8 headers. Both-language cross-department denials, invalid-language rejection, and Chinese PII refusals passed for all 3 personas. Independent reviewer re-audited and approved the final citation-label correction and regression test; no implementation blockers remain. Coordinator reran all 52 frontend tests successfully.

Bedrock remains NOT_AUTHORIZED. Markdown source listing/opening is deployed independently; live index completion and grounded chat remain unverified and must not be claimed complete.
