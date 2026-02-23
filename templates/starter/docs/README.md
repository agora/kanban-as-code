---
id: docs-index
type: generic
title: Docs Index
status: active
summary_landing: Stable documentation index for the repo.
summary_developers: Extend this file into a structured docs tree as the project grows.
---

# Docs Workspace

`docs/` is your stable knowledge index and landing page.

- Keep this as the canonical docs entrypoint in the lean starter.
- Add deeper documents under `docs/` as needed.
- `docs/brainstorms/` collects compounding observations (`system-prompts.md`).
- `docs/compounds/` stores generated loop artifacts for machine analysis.
- `compound.config.yaml` (at repo root) defines autopilot behavior and compound policy when used with `kan agent init`.
- Compound loop stages run via the canonical command:
  `kan loop --stage plan|work|review|compound`.

This docs plane is intentionally free of build-tool assumptions.  
If the host repo is a Turborepo, the docs and kanban collections can be wired in as a lightweight, cacheable task without changing their schema or lifecycle.
