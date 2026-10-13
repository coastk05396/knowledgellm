# Repository Guidelines

## Project Structure & Module Organization

The React/Vite frontend lives in `web/`; the Python Lambda API and synthetic Markdown source files live in `api/src/knowledgellm/`; backend tests are in `api/tests/`. The SAM template is `template.yaml`.

## Build, Test, and Development Commands

From `web/`, run `npm install`, `npm run dev` for the local UI, `npm test` for frontend tests, and `npm run build` for the type-checked production bundle. From `api/`, install with `python3.12 -m pip install -e '.[dev]'` and run `python3.12 -m pytest`. Use `sam validate --template-file template.yaml` to validate deployment configuration when AWS SAM CLI is installed. Use the repository's `rtk` command wrapper for shell commands in this environment.

## Testing Guidelines

Frontend tests use Vitest and Testing Library (`*.test.tsx`); backend tests use pytest (`test_*.py`). Add focused behavior tests for changes and run both suites plus the frontend build before submitting.

Browser regression tests live in `web/tests/e2e/`; see `web/tests/README.md` for the offline and live commands. Report offline and live results separately, and do not retain authentication tokens in traces, videos, logs, or committed artifacts.

## Commit & Pull Request Guidelines

Use signed Conventional Commits, such as `docs: add contributor guide` or `fix: handle empty input`. Pull requests should target `main`, explain the change and its motivation, and include test results. Add screenshots for changes that affect a user interface.
