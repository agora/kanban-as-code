---
id: backlog-grooming
type: runbook
title: Backlog Grooming
status: active
summary_landing: Lightweight pre-work triage for execution queue quality and risk.
summary_developers: Run this before scope changes or parallel work starts.
---

# Backlog Grooming

Use this runbook when starting a new work cycle or before large refactors.

## 0) Run groom command

```bash
kan backlog:groom --scope kanban --type initiative
kan grooming --scope kanban/roadmap/initiatives --status ready
```

Expected output:
- error/warning count split by severity,
- stale/blocked/in-progress counts,
- suggestedNext actions for the highest-priority items.

## 1) Blocker triage

- Fix all `error` entries first (especially schema, duplicate IDs, missing IDs, invalid transitions).
- Leave warnings that are intentionally deferred in docs with a follow-up task or review note.

## 2) Sequence

- `status: blocked` requires `blocking_reason`.
- Active initiatives must keep problem statements and owner context.
- Active slices should keep `initiative_id`, `acceptance_criteria`, and status-appropriate requirements.
- Missing `agent_workspace` is a warning for parallel-safe execution.

## 3) Scope plan

1. `kan agent claim --scope <groomed-path> --agent <name>`
2. Execute planned changes inside claimed path.
3. `kan agent unclaim --agent <name> --scope <groomed-path>` after merge or handoff.

## 4) Recheck before merge

Run:

```bash
kan groom --scope <scope>
kan lint --json
```

Both should report no blocking errors in the target scope before opening or finalizing a PR.
