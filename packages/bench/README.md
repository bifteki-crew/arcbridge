# @arcbridge/bench — validation corpus + token-savings harness (F0)

Not published. This package is the substrate for the "prove the thesis" lens of
the [Phase F+ roadmap](../../docs/arcbridge-improvement-plan.md): a small pinned
corpus of projects plus two harness layers that run against it.

## Layers

1. **Functional smoke (gating).** `pnpm --filter @arcbridge/bench smoke` runs the
   real adoption pipeline — `init` → `adopt --apply` → `drift --reindex` — via the
   built CLI on every corpus fixture, then drives the consolidated MCP tools
   (`get_building_blocks`, `query_symbols`) against the result. Hard failures
   (crashes, empty/failed tool responses, no symbols indexed) exit non-zero. A
   fixture *having drift* is reported, not failed. This is the real end-to-end
   integration signal; CI gates on it.

2. **Deterministic token proxy (non-gating report).** `pnpm --filter
   @arcbridge/bench bench:tokens` asks a fixed set of questions two ways — via
   ArcBridge tool calls vs. reading the source files an agent would otherwise open
   — and compares token counts. It writes `reports/token-savings.md` (gitignored;
   regenerate any time). CI runs it non-gating and posts the report to the job
   summary.

Both require a build first: `pnpm build`.

## What it is *not*

The **live-agent eval** — a real model driving tool calls vs. raw file reading,
measured by tokens-to-*complete* a multi-step task — is deliberately **out of
scope here**. It is non-deterministic and costs money per run, so it belongs in a
periodic/manual job, never a PR gate.

## Corpus

Committed fixtures under `corpus/`, spanning shapes that exercise different code
paths. Each is copied to a temp dir and prepped fresh per run (nothing mutates the
committed tree):

| Fixture | Template | Shape |
|---|---|---|
| `ts-api` | `api-service` | TS backend — lib / routes / middleware |
| `ts-frontend` | `react-vite` | TS frontend — components / hooks / lib |

Follow-ups (see the roadmap): add a fullstack/monorepo fixture (needed for the
0.12.0 contract work anyway) and at least one **real, larger repo** — the current
fixtures are small, which understates the symbol-lookup case (below).

## Methodology (token proxy)

- Token counts use a real BPE tokenizer (`gpt-tokenizer`, cl100k_base — the GPT-4
  family encoding). Pure JS, deterministic.
- Baselines — the "files an agent would otherwise read":
  - **structure** → every source file (no map ⇒ read everything);
  - **block** → files under the block's code paths;
  - **symbol** → files that mention the symbol name (grep-then-read).
- Intent/quality-scenario questions are excluded: that knowledge isn't in the code,
  so there's no fair token baseline (and it's context file-reading can't provide).

## Reading the numbers (honest caveats)

- **Structure/navigation (~90%+) is the load-bearing result** — understanding a
  codebase's layout otherwise means reading everything; ArcBridge answers it with a
  compact building-block map.
- **Single-symbol lookup is negative on the current tiny fixtures**, and that's an
  artifact, not a regression: `query_symbols` returns the symbol's source *plus* its
  signature, caller/callee graph, and owning block — richer than reading a 2-line
  file with one caller. On realistically-sized files with callers spread across many
  files (where an agent greps-and-reads several candidates), the same response wins.
  A larger real repo in the corpus is the fix.
- `adopt` yields one coarse block on these small single-service trees, so the
  "module detail" number is closer to "whole-project detail" here; it separates out
  on larger, multi-module projects.
