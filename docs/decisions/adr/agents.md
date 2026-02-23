---
id: docs-decisions-adr
type: generic
title: Agents Scope - docs/decisions/adr
status: active
---

# Agents

Scope boundary: `docs/decisions/adr`

Session contract:

- Start with `kan start --json`.
- Use `kan agent claim --scope docs/decisions/adr` or claim by task when parallel edits are likely.
- Keep claims narrow and short-lived.
- If overlap risk appears, pause and re-claim with narrower scope.
