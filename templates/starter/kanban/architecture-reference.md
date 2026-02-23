---
id: architecture-reference
type: architecture-reference
status: active
title: Architecture Reference
owner: "@platform"
created: 2026-02-20
lastUpdated: 2026-02-20
summary_landing: Permanent source of truth for architecture boundaries, data model, and contracts.
summary_developers: Keep architecture intent and invariants stable across execution planning and implementation.
related_docs:
  - "docs/README.md"
---

# Architecture Reference

This is a permanent record of:

- Bounded contexts and ownership boundaries
- core domain model and canonical naming
- integration contracts and extension points
- non-negotiable platform constraints

## Boundaries

- Planning (`kanban/`) is mutable and execution-driven.
- Knowledge (`docs/`) is stable and long-lived.
- Tooling (`kan`) is the bridge that enforces traceability.

## Data Model

The project operates on two core planes:

1. **Execution plane** (`kanban/roadmap`)
2. **Knowledge plane** (`docs`)

`id` is the stable identity across move/rename; file paths are considered implementation detail.
