---
id: strategy-current
type: strategy-current
status: active
title: Strategy Current
owner: "@platform"
created: 2026-02-20
lastUpdated: 2026-02-20
summary_landing: Current execution sequencing and decision focus for the near-term horizon.
summary_developers: Keep every active work item linked to a clear now/next plan.
current_focus:
  - kanban-starter-foundation
next:
  - strategy-and-automation-hardening
owner_summary:
  - owner: "@platform"
    focus: "bootstrap reliability and lint rule confidence"
---

# Strategy Current

## What we are doing now

- Ship the foundational `kanban` + `kan` starter in a single command.
- Keep schema/lint fast and deterministic.

## What is next

- Add richer evolve/move automation commands.
- Add stronger dependency and release planning checks.

## Working convention

- `ready` in roadmap means explicitly authorized to start.
- `in-progress` means active ownership and expected owner visibility.
- `blocked` requires explicit `blocking_reason` and `unblock_owner`.
