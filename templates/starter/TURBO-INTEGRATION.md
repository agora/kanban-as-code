# Turborepo Integration (Optional)

This starter remains fully functional without Turborepo. The host repo can keep everything unchanged and still run `kan lint` directly.

If you do want Turborepo-native orchestration, use this minimal option:

1. Ensure this starter payload is in the repo (`kan init`, or copy `templates/starter`).
2. Add one root package script in the host repo:

```json
{
  "scripts": {
    "kanban-lint": "kan lint --json > .kan/lint.json"
  }
}
```

3. Add one task to your existing `turbo.json` (merge if file already exists):

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

Then run `turbo run kanban-lint`.

This keeps the planning system independent:
- no changes to `kanban/` structure,
- no changes to docs schema,
- optional host-level task wiring only.
