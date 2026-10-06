# Repository Guidelines

## Project Structure & Module Organization

The React/Vite frontend lives in `web/`; the Python Lambda API and synthetic Markdown source files live in `api/src/knowledgellm/`; backend tests are in `api/tests/`. The SAM template is `template.yaml`; implementation history and architecture diagrams are under `docs/`.

## Build, Test, and Development Commands

From `web/`, run `npm install`, `npm run dev` for the local UI, `npm test` for frontend tests, and `npm run build` for the type-checked production bundle. From `api/`, install with `python3.12 -m pip install -e '.[dev]'` and run `python3.12 -m pytest`. Use `sam validate --template-file template.yaml` to validate deployment configuration when AWS SAM CLI is installed. Use the repository's `rtk` command wrapper for shell commands in this environment.

## Coding Style & Naming Conventions

Use English for source code, comments, and documentation. Prefer clean, strictly typed code; use TypeScript or Go for new components when a language choice is needed. Follow the formatter and linter adopted by each language rather than introducing competing styles. Use descriptive, consistent names, and keep changes focused on the task. Never commit secrets; load configuration and credentials from the environment or an approved secret store.

## Testing Guidelines

Frontend tests use Vitest and Testing Library (`*.test.tsx`); backend tests use pytest (`test_*.py`). Add focused behavior tests for changes and run both suites plus the frontend build before submitting. No numeric coverage threshold is set.

## Commit & Pull Request Guidelines

Use signed Conventional Commits, such as `docs: add contributor guide` or `fix: handle empty input`. Pull requests should target `main`, explain the change and its motivation, link relevant issues when available, and include test results. Add screenshots for changes that affect a user interface.

## Security & Configuration

Do not hardcode API keys, passwords, tokens, or other credentials. Keep local configuration out of version control and provide safe examples when documenting required settings.

All project requirements must be written and maintained in [PROMTS.md](PROMTS.md).
