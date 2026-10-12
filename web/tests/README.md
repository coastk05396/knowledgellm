# Browser regression tests

Frontend unit/component tests remain beside their source in `src/`; backend tests
are in `api/tests/`. Repeatable Chromium browser tests live in `tests/e2e/`.

From `web/`:

```sh
rtk npm ci
rtk npx playwright install chromium
rtk npm run test:e2e
rtk npm run test:e2e:types
```

The default suite starts a loopback Vite server on port 5180 and uses mocked
authentication/document responses. It checks responsive overflow, pointer press
feedback, keyboard activation, touch hover gating, folder label alignment and click-to-expand behavior, and toast entry/exit with
normal or reduced motion. It does not establish live authentication or API access.

To check a running preview against real Cognito and the real document API:

```sh
rtk env E2E_BASE_URL=https://your-preview.trycloudflare.com npm run test:e2e:live
```

This explicit live suite switches between the three public fictional demo
personas and checks document loading and folder isolation. It does not generate
chat answers or change deployed resources. The preview must use `/api` on the
same origin; direct API requests from random tunnel origins fail deployed CORS.
See the build/tunnel commands in `../../AGENTS.md` at the repository root.

Failure screenshots are written to ignored `test-results/`. Traces and videos
are disabled so authentication responses and tokens are not persisted. Real-phone
touch, keyboard, and safe-area behavior still requires physical-device testing.
