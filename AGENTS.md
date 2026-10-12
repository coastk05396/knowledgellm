# Repository Guidelines

## Project Structure & Module Organization

The React/Vite frontend lives in `web/`; the Python Lambda API and synthetic Markdown source files live in `api/src/knowledgellm/`; backend tests are in `api/tests/`. The SAM template is `template.yaml`; implementation history and architecture diagrams are under `docs/`.

## Build, Test, and Development Commands

From `web/`, run `npm install`, `npm run dev` for the local UI, `npm test` for frontend tests, and `npm run build` for the type-checked production bundle. From `api/`, install with `python3.12 -m pip install -e '.[dev]'` and run `python3.12 -m pytest`. Use `sam validate --template-file template.yaml` to validate deployment configuration when AWS SAM CLI is installed. Use the repository's `rtk` command wrapper for shell commands in this environment.

## Coding Style & Naming Conventions

Use English for source code, comments, and documentation. Prefer clean, strictly typed code; use TypeScript or Go for new components when a language choice is needed. Follow the formatter and linter adopted by each language rather than introducing competing styles. Use descriptive, consistent names, and keep changes focused on the task. Never commit secrets; load configuration and credentials from the environment or an approved secret store.

## Testing Guidelines

Frontend tests use Vitest and Testing Library (`*.test.tsx`); backend tests use pytest (`test_*.py`). Add focused behavior tests for changes and run both suites plus the frontend build before submitting. No numeric coverage threshold is set.

Keep reusable browser regression tests in `web/tests/e2e/`; run `rtk npm run test:e2e` from `web/` for offline interaction tests. Run `rtk env E2E_BASE_URL=<preview-url> npm run test:e2e:live` for explicit live persona/document checks before handing off an authenticated preview. Report offline and live results separately, and do not retain authentication tokens in traces, videos, logs, or committed artifacts. See `web/tests/README.md` for setup and coverage.

## UI Preview Handoff

For user-facing UI changes, start a local preview and a temporary Cloudflare tunnel before handing off the result. Provide both the localhost URL with its port and the public HTTPS URL so the user can test the change. Verify that both URLs serve the changed build, and leave the preview running until the user asks to stop it or it is replaced by a new preview. State any authentication, API, or real-device verification limits explicitly.

Prefer serving the production build from a loopback-bound preview server. For temporary public previews, route API requests through the existing same-origin `/api` proxy so the random tunnel origin does not require deployed CORS changes. From `web/`, build into an isolated temporary directory with `rtk env VITE_API_URL=/api npm run build -- --outDir /tmp/knowledgellm-preview-dist`, then start `rtk npm exec vite preview -- --outDir /tmp/knowledgellm-preview-dist --host 127.0.0.1 --port 5179 --strictPort` and `rtk proxy cloudflared tunnel --url http://127.0.0.1:5179 --http-host-header localhost:5179` in separate processes. The proxy must target the configured upstream API URL, not `/api` itself. Verify persona sign-in and authorized document loading through the public URL; a loading homepage alone is insufficient. Reuse an available port or choose another free port when needed. Retire only this task's previous preview; preserve unrelated servers and tunnels. Keep credentials out of the preview and do not change deployed CORS or authentication settings without applicable authorization.

## Commit & Pull Request Guidelines

Use signed Conventional Commits, such as `docs: add contributor guide` or `fix: handle empty input`. Pull requests should target `main`, explain the change and its motivation, link relevant issues when available, and include test results. Add screenshots for changes that affect a user interface.

## Security & Configuration

Do not hardcode API keys, passwords, tokens, or other credentials. Keep local configuration out of version control and provide safe examples when documenting required settings.

All project requirements must be written and maintained in [PROMTS.md](PROMTS.md).
