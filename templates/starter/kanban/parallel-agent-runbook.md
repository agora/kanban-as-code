---
id: parallel-agent-runbook
type: generic
title: Parallel Agent Runbook
status: active
summary_landing: Baseline coordination for parallel agents working on shared codebases.
summary_developers: Keep agents focused, scoped, reviewed, and continuously compounding.
---

# Parallel Agent Runbook

This runbook defines the baseline coordination flow for multiple agents editing the same repository.

Use the **Plan → Work → Review/Assess → Compound** loop for every coordinated initiative:

1. **Plan (≈80% of effort)**: collective research and design.
2. **Work**: code execution and iterative fixes.
3. **Review/Assess**: parallel validation and risk review.
4. **Compound**: persist hard-won lessons back into the system.

## 1) Plan

Goal: human-led direction, machine-assisted discovery, no premature edits.

Agent tasks in Plan:

- Inspect repository structure and history:
  - `git log --stat --graph --oneline`
  - `rg --files`
  - `rg "TODO|FIXME"`
- Check existing standards and conventions before changing behavior.
- Pull relevant external references/changelogs for model/tool behavior changes.
- Define an explicit blueprint:
  - Objective and acceptance criteria
  - Reference docs/paths
  - Risks and rollback plan
  - Which agent takes which scope

Use `kan query` and `kan lint --json` to locate the authoritative targets.

## 2) Work

Goal: execute in isolated, non-overlapping scopes.

Use `agent_workspace` on task documents to map each task to a repo prefix.

```yaml
type: task
agent_workspace: kanban/roadmap/initiatives/payment-checkout
```

Claim the scope before editing:

- `kan agent claim <task-id>`
- `kan agent claim --scope kanban/roadmap/initiatives/my-initiative`

If a `task` id is provided, `kan agent claim` reads its `agent_workspace` automatically.

## 3) Review/Assess

Goal: reduce risk with parallel validation.

Run these in parallel when possible:

- `kan lint --json`
- `kan agent guard --agent <name>`
- Specialized reviewers (security/performance/architecture) via internal agent roles
- Real execution checks:
  - Playwright MCP for UI paths
  - XcodeBuildMCP for iOS/macOS compile checks

Synthesize and prioritize issues (P1/P2/P3) before moving forward.

## 4) Compound

Goal: convert what was learned into reusable defaults.

- Update docs with durable patterns discovered.
- Record anti-patterns in project docs or skills.
- Promote stable snippets/rules to prompts, helpers, or reusable scripts.

Use:

- `kan loop --stage compound --initiative <id> --scope <scope> --promote --emit-skill`

for automatic compounding.

## 5) Scope release

After Work and Review/Assess are complete:

- `kan agent unclaim --agent <name> --all`
- or release a specific scope:
  - `kan agent unclaim --agent <name> --scope <scope>`

## 6) Recommended branch strategy

- Prefer one branch per agent for broad changes.
- Keep `kan agent claim` as an additional guard for same-tree sessions.
