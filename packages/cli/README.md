# arcbridge

CLI for ArcBridge — architectural awareness for AI coding agents.

## Install

```bash
npm install -g arcbridge
```

## Commands

### `arcbridge init`

Initialize ArcBridge in a project directory. Auto-detects project type from `package.json`.

```bash
arcbridge init
arcbridge init --template react-vite --name my-app
arcbridge init --platform claude --platform copilot
arcbridge init --spec docs/requirements.md
```

### `arcbridge sync`

Run the full sync loop: refresh docs, reindex TypeScript symbols, detect drift, infer task statuses, verify quality scenarios, and update the git sync point.

```bash
arcbridge sync
arcbridge sync --json          # JSON output for CI
arcbridge sync --dir /path/to/project
```

### `arcbridge status`

Show project status: current phase, task progress, quality scenarios, building blocks, and drift.

```bash
arcbridge status
arcbridge status --json
```

### `arcbridge drift`

Check for architecture drift between docs and code.

```bash
arcbridge drift
arcbridge drift --json
```

### `arcbridge refresh`

Rebuild the SQLite database from YAML/markdown source files. Preserves task, phase, and scenario statuses.

```bash
arcbridge refresh
arcbridge refresh --json
```

### `arcbridge update-task`

Update a task's status.

```bash
arcbridge update-task task-1.1-setup done
arcbridge update-task task-1.2-auth in-progress
arcbridge update-task task-1.3-api blocked --json
```

Valid statuses: `todo`, `in-progress`, `done`, `blocked`

### `arcbridge generate-configs`

Regenerate platform agent configs (CLAUDE.md, Copilot instructions) from `.arcbridge/agents/`.

```bash
arcbridge generate-configs
arcbridge generate-configs --json
```

## Global Options

| Option | Description |
|--------|-------------|
| `--dir <path>` | Project directory (default: current directory) |
| `--json` | JSON output for CI pipelines |
| `--help` | Show help |
| `--version` | Show version |

## CI Integration

The `--json` flag on every command makes ArcBridge CI-friendly. A GitHub Action workflow is generated during `arcbridge init`:

```yaml
# .github/workflows/arcbridge-sync.yml
- run: npx arcbridge sync --json
```

## License

[MIT](../../LICENSE)
