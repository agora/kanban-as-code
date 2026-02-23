# DDD Bounded Contexts Plugin

This plugin is a scaffold for isolating agent execution by domain context.

Install with:

```bash
kan plugin install ddd-bounded-contexts
```

File included:

- `manifest.json` — plugin metadata (required by `kan plugin`).
- `context-boundaries.yaml` — list of bounded contexts and owned paths.
- `AGENTS.md` — execution policy for this plugin family.

The scaffold is intentionally minimal: teams should expand this plugin with
their own context-specific agent instructions and boundary-aware rules.
