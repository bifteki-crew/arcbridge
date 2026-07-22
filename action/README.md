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

permissions:
  contents: read
  pull-requests: write   # only used for the sticky PR comment — drop it (or set `comment: false`) to run without commenting

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: bifteki-crew/arcbridge/action@v0.12.0
```

Also running on `push` (e.g. to `main`)? Add the trigger but keep
`pull-requests: write` scoped to a PR-only job — the comment is only ever
posted on `pull_request` events, so push runs don't need the grant.

> **Pin your ref.** `@main` can change without your review — prefer a release tag
> like `@v0.12.0` (shown above) or, strictest, a full commit SHA:
> `bifteki-crew/arcbridge/action@<sha>`.

Requires a committed `.arcbridge/` directory (run `arcbridge init` /
`arcbridge adopt` once and commit the result). `index.db` does not need to be
committed — it is rebuilt from the YAML sources.

## Inputs

| Input | Default | Description |
|---|---|---|
| `working-directory` | `.` | Directory containing `.arcbridge/` (monorepo support) |
| `severity-threshold` | `error` | Fail on drift at/above this severity: `error`, `warning`, `info` |
| `comment` | `true` | Post/update the sticky PR comment (needs `pull-requests: write`) |
| `base` | `""` | Only report drift on files changed since this ref (branch/tag/SHA, or `last-commit`/`last-sync`/`last-phase` — prefer an explicit ref in CI) — a PR-incremental check. Empty checks the whole model. Needs full git history (see below). |
| `arcbridge-version` | `0.12.0` | `arcbridge` npm version to run |
| `node-version` | `22.16.0` | Node.js to set up (arcbridge needs ≥ 22.16; default pins the tested minimum) |

### PR-incremental mode (`base`)

> Requires the action **and** CLI at **0.11.0 or later** (the `base` input and
> `arcbridge drift --base` ship together in 0.11.0; the 0.10.0 tag has
> neither).

To comment only on drift the PR actually introduced, pass the base ref — and
fetch enough history for it to resolve (`actions/checkout` is shallow by
default, so the base SHA isn't present without `fetch-depth: 0`):

```yaml
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # --base needs history to diff against
      - uses: bifteki-crew/arcbridge/action@v0.12.0
        with:
          base: ${{ github.event.pull_request.base.sha }}
```

Detection still runs against the full building-block model (so file→block
assignment is unchanged); `base` only scopes the reported findings + the
pass/fail verdict to changed files. Model-level drift with no single file
(e.g. a newly added dependency) is not shown in `base` mode — run without
`base` for the complete picture.

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
