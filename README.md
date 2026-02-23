# Kanban-as-Code (Open Source)

[![GitHub Repo](https://img.shields.io/badge/GitHub-kanban--as--code-181717?logo=github)](https://github.com/agora/kanban-as-code)
[![License](https://img.shields.io/github/license/agora/kanban-as-code)](https://github.com/agora/kanban-as-code/blob/main/LICENSE)
[![Stars](https://img.shields.io/github/stars/agora/kanban-as-code?style=social)](https://github.com/agora/kanban-as-code/stargazers)
[![Open Issues](https://img.shields.io/github/issues/agora/kanban-as-code)](https://github.com/agora/kanban-as-code/issues)

**Kanban-as-Code is a git-native execution framework that turns planning into versioned, machine-validated markdown so teams can coordinate strategy, scope, and delivery from a single source of truth.**

## Introduction

Kanban-as-Code is a lightweight planning system that stores strategy, roadmap, and task execution data in plain markdown files with strict schema validation. Instead of treating planning docs as static notes, it makes them first-class development artifacts: auditable, reviewable, queryable, and safe for parallel execution.

The `kan` CLI initializes the system, validates frontmatter and cross-references, coordinates agent ownership, and supports a structured loop (`plan → work → review → compound`) so multi-agent work stays consistent over time.

The system is intentionally portable:
- any standalone repo, and
- any existing Turborepo repo with minimal optional wiring.

GitHub: https://github.com/agora/kanban-as-code

It contains:

- `kanban/` planning structure with strategy roots and roadmap documents
- `docs/` knowledge space
- `kan` CLI package (`bin/kan.js`) to bootstrap, lint, and validate the repository
- strict frontmatter schemas (via Zod) + cross-reference checks

## Contributing

PR workflow for the `kanban-as-code` project:

1. Fork and branch from `main`.
2. Keep changes focused and small.
3. Prefer documentation and template improvements over behavior changes in the core CLI unless required.
4. Run `kan lint --json` for planning-plane validation.
5. Open a PR with a short summary of intent and validation notes.

## Reporting bugs

If you find a bug, please submit it to the GitHub repo:

- open an issue: https://github.com/agora/kanban-as-code/issues
- open a pull request with a focused fix: https://github.com/agora/kanban-as-code/pulls

You can use Claude Code, Codex, or other AI coding tools to help with fixes, but please keep PRs small, include validation output, and link to the related issue when possible.

## Usage

### Install and initialize

From a fresh repo root:

```bash
npm init -y
npx kan init
```

For a cleaner dogfood workspace in any repo (empty folders with `agents.md` in every planning/knowledge folder):

```bash
kan init --skeleton
```

### Typical commands

```bash
kan lint
kan start --json
kan status
kan queue
kan next
kan backlog summary --scope kanban/roadmap/initiatives
kan backlog set in-progress <task-id>
kan backlog move kanban/roadmap/initiatives/foo.md docs/archive/foo.md
kan assess
kan docs:index --out .kan/docs-index.json
kan update --dry-run
kan update
kan build
kan update --force
kan health
kan query '.[] | select(.status == "in-progress") | .id'
kan query '.[] | sort_by(.status) | .[0:3]'
kan agent init
kan agent worktree <agent-name> --branch <branch>
kan agent claim --scope <path> --agent <name>
kan evolve initiatives/my-doc-id --to review
kan mv kanban/roadmap/initiatives/foo.md docs/archive/foo.md
kan rm kanban/roadmap/initiatives/old.md --dry-run
kan grooming --scope kanban/roadmap/initiatives --type initiative
```

### Update deployed repos (one-command flow)

If your repo already uses `kanban-as-code`, keep it in sync with template/tool updates:

```bash
kan update --dry-run
kan update --force
```

This is the release update flow for injected deployments:

1. upgrade the `kanban-as-code` source in your environment (or pull the latest starter release),
2. run one command in each downstream repo: `kan update --force`,
3. run `kan lint --json` and address any generated conflicts.

### Release cadence from this repository

Keep upgrades predictable by using Git tags/releases from:

- https://github.com/agora/kanban-as-code/releases
- https://github.com/agora/kanban-as-code/tags

Simple fixed cadence flow:

1. Choose a target release/tag in this repository.
2. Update your local `kanban-as-code` checkout or package to that tag.
3. Run `kan update --force` in each deployed repo.
4. Run `kan lint --json` and resolve conflicts.

This makes updates deterministic: every repo is synced to a known upstream tag/release rather than ad-hoc snapshots.

- `kan update` applies new files from the template and skips existing conflicts.
- `kan update --force` also overwrites starter files so local edits are intentionally refreshed.
- `kan update --json` returns machine-readable change summaries for scripts/CI.

`kan` supports JSON output with `--json` for machine/agent flows.
`kan` also provides optional multi-agent commands:

- `kan agent claim` (claim via target task or explicit scope)
- `kan agent init` (bootstrap local worktree helper and, for non-starter repos, generate a PR agent-guard workflow)
- `kan agent worktree` (provision a dedicated agent worktree)
- `kan grooming` / `kan backlog:groom` (run backlog triage before execution)
- `kan status` / `kan queue` / `kan next` / `kan backlog summary` (execution-readiness plane)
- `kan backlog set` / `kan backlog move` (status updates and scoped movement with lock checks)
- `kan assess` (machine-readable PASS/WARN/FAIL planning health)
- `kan docs:index` (generate docs payload for planning and agents)
- `kan plugin list` / `kan plugin install <name>`
- `kan loop --stage plan`, `kan loop --stage work`, `kan loop --stage review`, `kan loop --stage compound`
- `kan loop --stage compound --auto --scope kanban` for autonomous post-merge compounding mode

`kan agent init` flags:
- `--workflow` to force creating the PR guard workflow even when a starter workflow exists.
- `--no-workflow` to skip generating the PR guard workflow.
- `kan agent init` also writes `scripts/kan-agent-worktree.sh` for dedicated agent worktrees.

## Agent bootstrap contract (required per session)

Every agent session starts with exactly this command:

```bash
kan start --json
```

Read at least these fields before touching state:
- `context.config.exists`
- `context.config.isHealthy`
- `context.collections[].exists`
- `recommendedNext`
- `capabilities`

If `context.config.isHealthy` is false or a config error exists, resolve that first before `evolve`, `mv`, `rm`, or scope-changing work.

## Future work and technical debt (machine ledger)

The canonical roadmap for implemented improvements is now machine-readable:

- `future-ledger.json`
- `future-ledger.schema.json`
- `src/future-notes.js` (compat wrapper + source import path)

`future-ledger.json` is the canonical ledger for triage (diff-safe, machine-parseable, and strict to schema).

Machine-readable outputs:

```bash
node scripts/validate-future-ledger.mjs --json --triage
```

This prints structured validation + triage fields for automation.

## Design in one page

- `kanban/` is the execution planning plane; durable artifacts are:
  - `architecture-reference.md`
  - `Strategy-Current.md`
  - `strategic-execution-spec.md`
- `docs/` is a stable knowledge index for references.
- `docs/brainstorms/` stores compounding prompts and system memory.
- `docs/compounds/` stores loop artifacts from `kan loop` execution.
- IDs are stable (`id` in frontmatter) and should remain stable across renames/moves.
- Every file is plain markdown with YAML frontmatter and is versioned in git.

## Multi-agent collaboration

Recommended pattern:

- Use dedicated git worktrees and one branch per agent for primary isolation.
- For same-worktree sessions, use `kan agent claim` and `kan agent guard` in pre-commit.
- Prefer `kan agent claim --scope <scope>` when a task id is not available.

## Folder quick start

- `templates/starter/` is the bootstrap payload used by `kan init`.
- `kan.config.json` configures collection paths + schemas.

## CI

For non-starter repos, run `kan agent init` to add dedicated pull-request guard and compound loop files:

- `.github/workflows/kan-agent-scope-guard.yml` enforces `kan agent guard` on pull requests.
- `.github/workflows/kan-compound-autopilot.yml` runs `kan loop --stage compound --auto` after merge when the plugin is installed.
- Keep project CI (`kan lint`, `kan build`) in your existing workflow.
- `compound.config.yaml` stores starter autopilot policy defaults for compounds.

## Turborepo injection (optional, simplest path)

Kanban is standalone by default. For host repos that already use Turborepo, follow this minimal path:

1. Copy the starter payload:
   - `kan init` in the host repo, or copy `templates/starter` into it.
2. Keep using the default workflow above as-is (it still runs on any repo).
3. Optional: wire into `turbo` by adding a root script and task that map to `kan lint`.

Example:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "kanban-lint": {
      "outputs": [".kan/lint.json"],
      "inputs": [
        "kan.config.json",
        "compound.config.yaml",
        "kanban/**/*",
        "docs/**/*"
      ]
    }
  }
}
```

Then add a corresponding package script in the host root `package.json`:

```json
"kanban-lint": "kan lint --json > .kan/lint.json"
```

Run with `turbo run kanban-lint` when you want Turborepo-native orchestration.

Author:
Gudjon Mar Gudjonsson
[ Agora & OZ & Alendis ]
