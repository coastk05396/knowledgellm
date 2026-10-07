# Traditional Chinese and PDF Sources

## Scope and Decisions

The existing React/Vite and Python Lambda app gains a Traditional Chinese interface and chat output. The language control follows the reference résumé's grouped EN / CH buttons. The six current fictional sources become text-based PDFs in the existing documents bucket, preserving document IDs, department authorization, original Markdown objects, and S3 version history. Source content stays in its original English; selected Chinese chat answers translate supported facts.

Requirements are maintained in PROMTS.md. No new hosting service or bucket is part of this change. A pull request targets main; merging requires the user's approval.

## Owners and Status

- Coordinator: requirements, deployment inventory, integration, live verification, screenshots, and PR submission — complete.
- Frontend builder: web/ localization, language control, persistence, and request contract — complete.
- Backend builder: api/, scripts/, PDF extraction/assets, catalog keys, and chat language contract — complete.
- Independent reviewer: source/PDF/script review — approved; deployed acceptance pending.

## Initial Evidence

- Worktree /home/rick/orca/workspaces/knowledgellm/translate was clean on coastk05396/translate at 3abcf20. Fetch revealed main had advanced; implementation was preserved with a stash, the branch was fast-forwarded to 9f7528f, and conflicts were assigned to their owners.
- AWS account 768363152398, region ap-southeast-1; both deployed product Lambdas report Successful updates. Current runtime uses Cohere multilingual v3 / knowledgellm-cohere-v3; answer caching is disabled and remains disabled.
- Existing bucket knowledgellm-demo-docs-90feb739268a188cf33a5e41c6 contains exactly the six department Markdown sources. Encryption AES256, versioning Enabled, and all four public-access blocks are enabled.
- Resume HTML retrieved from https://coastk05396.github.io/resume/ for toggle comparison.

## Verification and Next Action

Coordinator reran backend (158 passed), frontend (47 passed with Node 26 webstorage disabled), production build, Terraform validation, and diff whitespace checks successfully. Generated package: 109.0 MiB uncompressed including pypdf. Rollback package downloaded to /tmp/knowledgellm-before-translation.zip and ZIP integrity checked. Targeted staged plan: 0 add, 2 change (ingestion code and artifact), 0 destroy; no environment/resource changes.

## Live Rollout and Blocker

- Applied the reviewed ingestion-only Terraform plan: artifact + ingestion Lambda updated (0 add, 2 change, 0 destroy). Chat Lambda remains on its prior package; prepared chat plan is code-only (0 add, 1 change, 0 destroy) and has not been applied.
- Uploaded all six application/pdf artifacts to the existing bucket without deletion. Markdown originals and all prior versions remain.
- EventBridge invoked ingestion for all six PDFs. Each invocation failed at Bedrock InvokeModel with ValidationException: Operation not allowed. No PDF completion manifests exist yet; no index readiness is claimed.
- AWS GetFoundationModelAvailability: cohere.embed-multilingual-v3 in ap-southeast-1 has agreement, entitlement and region AVAILABLE, authorization NOT_AUTHORIZED.
- Independent administrator InvokeModel probe fails with the same error. IAM simulation permits the ingestion role's model-scoped bedrock:InvokeModel. This is not resolved by PDF parsing or broader Lambda permissions; exact account-side cause remains unconfirmed.
- Current runtime cache remains disabled; no provider/model substitution or account/billing change was made.
- Saved rollback ZIP /tmp/knowledgellm-before-translation.zip; new artifact SHA256 bb6d65c937e2dce7890e69610ea9e9a5ac2fa97f67de606840ed17c59373a561.

## Browser Evidence

Coordinator used real Cognito sign-in and deployed document listing for all three personas with local updated UI. Chinese labels, two authorized documents per persona, five Chinese suggestions, persistent CH selection, EN restoration, and zero page errors verified. Signed-in EN/CH layouts at 768px and 820px have no horizontal overflow; brand-bar bounds are [0,width]. Real screenshots are docs/screenshots/traditional-chinese-desktop.png and traditional-chinese-mobile.png (390px). Builder additionally verified mocked answer/citation flow and 320px/375px layouts; that is fixture evidence, not live grounding.

## Independent Review

APPROVED against origin/main 9f7528f for inspected implementation. Reviewer read all changed source/tests/scripts, validated all six PDFs preserve every normalized source word, checked 15 unique bilingual question IDs/five per department, inspected desktop/375px screenshots, and verified ACL, cache-language isolation, immutable source filtering and infrastructure prefix routing. No blocking source findings. Reviewer did not run suites; coordinator reran them. Follow-up intermediate-width checks were completed by coordinator as recorded above. Full deployed acceptance remains unverified.

## Next Action

After account model authorization is resolved, verify InvokeModel, reindex the current immutable PDF versions using scripts/migrate-cohere-index.py --execute, inspect all six completion manifests, apply the freshly reviewed chat-only Terraform plan, and run all six authorized PDF link downloads plus three Chinese chat/PII-refusal and cross-department denial journeys. Final UI chat screenshots and deployed language verification remain pending. Frontend publication/merge has not been performed. Implementation is submitted for review without claiming deployed completion.

Final S3 read-back verified byte-for-byte equality for all six PDFs, application/pdf content type, AES256 encryption, non-null VersionIds, and continued presence of every original Markdown object. Full Terraform plan after staged apply shows only pending chat code and rebuilt auth ZIP metadata (0 add, 2 change, 0 destroy); it was not applied.
