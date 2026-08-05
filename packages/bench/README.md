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

| Member | Kind | Shape |
|---|---|---|
| `ts-api` | fixture | TS backend — lib / routes / middleware |
| `ts-frontend` | fixture | TS frontend — components / hooks / lib |
| `arcbridge-self` | **live** | This repo — a real TS monorepo with realistic file sizes |
| `example-fullstack` | **live** | [arcbridge-example-fullstack] — Next.js + ASP.NET Core, a real service boundary |

**Fixtures** are copied to a temp dir and put through `init` → `adopt --apply` →
`drift --reindex`. **Live** members are measured *in place* against their existing
committed model: nothing is copied, `adopt` is never run (it would overwrite a
hand-maintained model), and cleanup is a deliberate no-op. Live members are
token-proxy only — the smoke layer exercises the adoption pipeline, which live
repos don't run, and this repo's own drift is already gated by CI's `check` job.

Why a live member matters: the fixtures' baselines are under 1k tokens, so their
absolute numbers aren't credible and the single-symbol case measures *negative*
(a rich tool response exceeds reading a 2-line file). Adding this repo fixed
both — the same symbol question measures **+97.8%** against ~48k tokens of real
code. Known blind spot: this repo is library/CLI code, so it validates
*magnitude* but not *shape* — it never exercises routes, components, or
cross-service DTOs. A purpose-built fullstack example is the next corpus
addition.

## Methodology (token proxy)

- Token counts use a real BPE tokenizer (`gpt-tokenizer`, cl100k_base — the GPT-4
  family encoding). Pure JS, deterministic.
- Baselines — the "files an agent would otherwise read":
  - **structure** → every source file (no map ⇒ read everything);
  - **block** → files under the block's code paths;
  - **symbol** → files that mention the symbol name (grep-then-read);
  - **route** → the files that declare routes (controllers, endpoint groups);
  - **component** → the component and page files;
  - **contract** → *both* halves of the boundary: the client call sites and
    contracts, plus the controllers and DTOs they target.
- **Quality-scenario questions are measured but never scored.** That knowledge is
  not in the source, so no set of files answers it and there is no fair baseline.
  Reported as `n/a` rather than as an infinite saving against zero — "the tool
  answers something the codebase cannot" is the honest finding, and a percentage
  there would be fabricated.

## Reading the numbers (honest caveats)

- **Quote the real-repository numbers.** The report separates live repos from
  fixtures precisely so the fixture artifacts aren't averaged into a headline.
- **Structure/navigation is an upper bound.** Its baseline is "read every indexed
  file" — the worst case, not typical agent behaviour (a real agent would skim a
  README or list directories first). The ratio is real; don't read 99% as a
  typical session saving.
- **Targeted questions are the defensible claim.** One module or one symbol costs
  ~1k tokens through ArcBridge versus tens or hundreds of thousands to read the
  relevant code.
- **The fixtures' negative symbol number is a scale artifact, not a regression** —
  the identical question inverts to ~+98% on a real repo.
- **The cross-service contract number is the least comparable one.** On a clean
  repository `check_drift` answers "no drift detected" in a handful of tokens
  while the baseline reads both sides of the boundary, so the ratio measures the
  cost of *verifying* agreement rather than of producing a rich answer. Genuine
  work — an agent really would have to read both halves to conclude they match —
  but it is a negative result, and quoting ~99% from it would be cherry-picking.
- **Watch `n`.** Route, component and contract are answered by one member so far.
  A median of a single observation is a data point, not an average.

[arcbridge-example-fullstack]: https://github.com/bifteki-crew/arcbridge-example-fullstack
