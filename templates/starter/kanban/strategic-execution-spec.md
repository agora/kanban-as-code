---
id: strategic-execution-spec
type: strategic-execution-spec
status: active
title: Strategic Execution Spec
owner: "@platform"
created: 2026-02-20
lastUpdated: 2026-02-20
summary_landing: Long-horizon position and execution principles for planning discipline.
summary_developers: Preserve continuity while allowing short-cycle delivery.
---

# Strategic Execution Specification

## Positioning

The system is a low-friction planning plane:

- portable markdown artifacts
- strict validation in CI
- machine-readable queries for humans and agents
- clear life-cycle for durable vs tactical artifacts

## Durable vs Tactical

- `kanban/roadmap` and strategy docs are durable decisions.
- `docs/` stores long-lived architecture, contracts, and decisions.

## Quality bar

- every initiative must have stable IDs and explicit problem statements
- every long-horizon doc must have owner and update cadence
- every execution transition should pass lint checks before promotion
