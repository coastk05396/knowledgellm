# Interaction polish and authenticated preview verification

Verified on 2026-10-12 after integrating merged PR #20 from `origin/main`
(`3094309e228ddb5fe4f3fa512b35cbdcaae23dcb`). The signed integration commit is
`96127f877cc04427e519ccc9da2c365a62d3f6b2`; browser runner corrections below
were tested on that source tree before their final commit. This record supersedes
the earlier pre-integration counts and signed-out-only preview evidence.

## Observed checks

| Command (from `web/` unless noted) | Result |
| --- | --- |
| `rtk npm test` | 65 frontend tests passed |
| `rtk env PYTHONPATH=/tmp/knowledgellm-polish-api-deps python3.12 -m pytest` (from `api/`) | 175 backend tests passed using isolated Python 3.12 dependencies |
| `rtk npm run test:e2e` | 11 offline browser tests passed with an automatically started loopback Vite server |
| `rtk env E2E_BASE_URL=https://numbers-recorded-drawn-explorer.trycloudflare.com npm run test:e2e:live` | One live scenario passed, covering Alex, Sam, and Priya sequentially |
| `rtk npm run test:e2e:types` | Strict browser-test TypeScript check passed |
| `rtk npm run build` | Type checking and production Vite build passed |
| `rtk npx prettier --check src playwright.config.ts tests/e2e vite.config.ts` | Passed; final config/spec corrections were also checked by QA |
| `rtk npm audit --audit-level=high` | Zero vulnerabilities |
| `rtk git diff --check` | Passed |

The offline tests cover four responsive widths, fine-pointer hover/press,
keyboard Space activation, disabled controls, touch hover gating, reduced-motion
press opacity, and manual/automatic toast dismissal with normal/reduced motion.
Toast assertions inspect real transition endpoints and retention before unmount.
Existing component tests also cover repeated dismissal, unmount/replacement
cleanup, and the latest callback without extending the notification lifetime.

The live scenario verifies same-origin `/api/documents` responses with status
200, two visible documents for each selected persona, other folders locked,
and an enabled composer. No chat generation is performed.

## Reproduced preview failure and correction

The original production preview called API Gateway directly. Cognito sign-in
succeeded, but the document request was blocked by CORS because the temporary
Cloudflare origin was not in the deployed allowlist. Rebuilding only the preview
with `VITE_API_URL=/api` routes through the existing Vite proxy. No deployed
authentication, CORS, or infrastructure settings changed.

Both localhost port 5179 and the public tunnel now serve that isolated preview
build, including PR #20. A fresh public Sam sign-in returned `/api/documents`
status 200, showed `Unlocked` and `AWS Cognito Verified`, and had no unavailable
banner. The [verified Sam screenshot](evidence/preview-sam.png) was visually
inspected; it contains only fictional demo content.

## Test infrastructure corrections

- Readiness waits for Vite's startup output through `rtk proxy`; the initial HTTP probe of an unused port hung in this environment.
- API mocks match root `/api/` paths, preserving Vite's `/@fs/.../api/src/.../demo_questions.json` module import from the integrated code.
- Transition endpoints are captured on DOM insertion/class changes, avoiding a timing race with the 80ms reduced-motion transition.
- Authentication traces, videos, request bodies, and tokens are not persisted. Failure screenshots and reports are ignored under `test-results/`.

## Limits and rollback

Independent code and motion review: **APPROVED**, with no actionable findings.
The reviewer examined the integrated task diff plus the final runner corrections,
independently checked strict test types/whitespace, and inspected the authenticated
screenshot. Suite/build results above were supplied by the coordinator and QA.

Chromium touch emulation does not establish real-phone keyboard, touch, or
safe-area behavior. The conditional edge-to-edge change remains deferred.
This work updates the review branch and a temporary preview; it does not merge
PR #21 or deploy a production frontend. The unrelated documentation moves in
the worktree are preserved and excluded from this task's commits.

To roll back the UI, revert the polish commit and rebuild the frontend through
its existing release process. To retire the temporary preview, stop this task's
Vite preview and Cloudflare tunnel. No data or infrastructure migration is needed.
