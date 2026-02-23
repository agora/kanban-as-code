---
id: docs-decisions
type: generic
title: Agents Scope - docs/decisions
status: active
---

# Agents

Scope boundary: `docs/decisions`

Session contract:

- Start with `kan start --json`.
- Use `kan agent claim --scope docs/decisions` or claim by task when parallel edits are likely.
- Keep claims narrow and short-lived.
- If overlap risk appears, pause and re-claim with narrower scope.
