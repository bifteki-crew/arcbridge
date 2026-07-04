# ArcBridge Drift Check (GitHub Action)

Fails CI when code drifts from the committed [ArcBridge](https://github.com/bifteki-crew/arcbridge)
architecture model. Runs `arcbridge drift --reindex` (self-contained — rebuilds
the index from the committed `.arcbridge/` YAML on a fresh checkout), writes a
job summary, and keeps one sticky PR comment up to date with the findings.

## Usage

```yaml
name: Architecture
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write   # for the sticky PR comment (optional)

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bifteki-crew/arcbridge/action@main
```

Requires a committed `.arcbridge/` directory (run `arcbridge init` /
`arcbridge adopt` once and commit the result). `index.db` does not need to be
committed — it is rebuilt from the YAML sources.

## Inputs

| Input | Default | Description |
|---|---|---|
| `working-directory` | `.` | Directory containing `.arcbridge/` (monorepo support) |
| `severity-threshold` | `error` | Fail on drift at/above this severity: `error`, `warning`, `info` |
| `comment` | `true` | Post/update the sticky PR comment (needs `pull-requests: write`) |
| `arcbridge-version` | `0.9.0` | `arcbridge` npm version to run |
| `node-version` | `22` | Node.js to set up (arcbridge needs ≥ 22.16) |

## Outputs

`error-count`, `warning-count`, `info-count`, `total-count`.

## Behavior

- **Job summary**: a findings table on every run (severity, kind, description, block, file).
- **PR comment**: one sticky comment (marker `<!-- arcbridge-drift -->`), updated in place on
  every push. Best-effort — a missing `pull-requests: write` permission logs a warning
  instead of failing the check.
- **Verdict**: the job fails only when findings at/above `severity-threshold` exist
  (or when `arcbridge drift` itself could not run). The comment is posted before the
  job fails, so the findings are always visible on the PR.
