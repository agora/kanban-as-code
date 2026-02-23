# Kanban Workspace

This folder is the operational planning plane of your repo.  
Everything under `kanban/` is expected to be execution planning data.

- `architecture-reference.md` = permanent architecture source of truth (boundaries, model, contracts).
- `Strategy-Current.md` = live sequencing of what is now/next.
- `strategic-execution-spec.md` = long-horizon positioning and operating principles.
- `roadmap/` for strategic planning and canonical initiatives.

## Multi-agent operations

- `kan agent claim --agent <name> --scope <path>` to claim a workspace slice.
- `kan agent init [--workflow|--no-workflow]` to bootstrap local worktree helpers.
- `kan agent init --workflow` explicitly creates `.github/workflows/kan-agent-scope-guard.yml`.
  - For non-starter repos, `kan agent init` also creates `.github/workflows/kan-compound-autopilot.yml` automatically.
- `kan agent init --no-workflow` skips guard workflow generation.
- `kan agent init` writes `scripts/kan-agent-worktree.sh` for per-agent worktree creation.
- `kan agent worktree <agent-name>` to provision a dedicated agent worktree.
- `kan agent claim <task-id>` or `kan agent claim --scope <path>` for one-command scoped ownership.
- `kan agent guard` before commit to detect conflicting local changes.
- `kan agent unclaim --agent <name> --all` at handoff.
- `parallel-agent-runbook.md` for the practical lock-and-edit procedure.
- `backlog-grooming.md` for a lightweight pre-work triage checklist.
- `docs/brainstorms/` for compounding memories and prompt evolution.
- `docs/compounds/` for machine-readable loop artifacts.
- `kan plugin install compound-engineering` to enable the loop stages.
- `kan plugin install ddd-bounded-contexts` to install the starter DDD boundary scaffold.
- `kan loop --stage plan`, `kan loop --stage work`, `kan loop --stage review`, `kan loop --stage compound` for the 4-stage loop.
- `kan loop --stage compound --auto` for structured autonomous compounding.
- `kan status`, `kan queue`, `kan next` for loop-ready backlog planning.
- `kan backlog summary`, `kan backlog set`, `kan backlog move` for execution-safe planning operations.
- `kan assess` for a compact PASS/WARN/FAIL assessment.

## Repository portability

The kanban system is designed to stay independent of build tooling.

- Use it standalone anywhere with `kan lint`, `kan build`, `kan health`.
- In a Turborepo host, treat `kanban/` and `docs/` as content-only folders.
- Optionally add one host-level task that runs `kan lint` so Turborepo can cache and schedule the check.

For the optional one-step wiring path, see `../TURBO-INTEGRATION.md` from this folder.
