# Compound Engineering Plugin

This plugin enables the canonical compound loop command:

- `kan loop --stage <stage>`

Supported stages:

- `plan`
- `work`
- `review`
- `compound`

Install with:

```bash
kan plugin install compound-engineering
```

Then capture loop artifacts using `--promote` and `--emit-skill`:

```bash
kan loop --stage plan --initiative my-initiative --scope kanban/roadmap/initiatives/my-initiative --objective "Plan"
kan loop --stage work --scope kanban/roadmap/initiatives/my-initiative --result "coded changes"
kan loop --stage review --scope kanban/roadmap/initiatives/my-initiative --result "validation complete"
kan loop --stage compound --scope kanban/roadmap/initiatives/my-initiative --promote --emit-skill execution-guidelines
```

Artifacts and prompt memory land in:

- `docs/compounds/*.md`
- `docs/brainstorms/system-prompts.md`
