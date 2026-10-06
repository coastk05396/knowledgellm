# Product Development

## Where to write and read

| Document | Owns | Who updates it |
| --- | --- | --- |
| [Product spec](superpowers/specs/2026-10-06-knowledgellm-design.md) | Requirements, constraints, design decisions, acceptance criteria | Rick defines the requirements; implementation records agreed changes |
| [Implementation plan](superpowers/plans/2026-10-06-knowledgellm-full-stack-prototype.md) | Implementation tasks, deployment/demo checklist, verification evidence | Implementer updates progress and actual results |
| [README](../README.md) | Introduction, architecture diagram, setup/deployment instructions | Implementer updates instructions with code changes |
| [AGENTS](../AGENTS.md) | Coding-agent rules | Repository maintainer |

Edit the product spec when you want to change what KnowledgeLLM should do. Keep each requirement in that spec; link to it from tasks rather than copying it. Record task completion and verification in the plan, and keep executable setup instructions in README.

## Current status

- Prototype implementation is submitted in [PR #1](https://github.com/coastk05396/knowledgellm/pull/1).
- Cloudflare deployment documentation and this reorganization are in [PR #2](https://github.com/coastk05396/knowledgellm/pull/2), which depends on PR #1.
- Public AWS/Cloudflare deployment and live Cognito verification remain pending. Past local checks are recorded in the plan, not evidence of a deployed system.

## Next action

Review the open PRs, then follow the plan's **Deployment and demo checklist** using README's setup instructions. The target account, region, custom domain, provider credentials, and live service costs still need configuration or confirmation before deployment.
