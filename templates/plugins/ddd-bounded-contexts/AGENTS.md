# AGENTS: DDD Bounded Contexts Plugin

This plugin defines context boundaries used by harnessing agents in a single repo.

## Convention

- Keep one context owner per slice of work.
- Agents should avoid editing files outside the context paths in `context-boundaries.yaml` unless explicitly coordinated.
- Raise a cross-context dependency explicitly in your task frontmatter and run `kan agent claim` before editing.

## Suggested future extension

- Add context-specific slash commands.
- Add review helpers for architectural invariants per context.
- Add generated skilllets for frequent DDD checks.
