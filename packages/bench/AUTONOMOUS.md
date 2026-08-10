# The autonomous-loop benchmark (F1 Part B)

```bash
pnpm --filter @arcbridge/bench bench:loop
```

**This spends real money on the authenticated account and is not deterministic.**
It is a manual/periodic measurement, never a CI gate — a nondeterministic gate is
worse than no gate.

## The question

Part A (`bench:tokens`) measures how many tokens it costs to *answer* a question.
This measures something harder: **does an agent working unattended stay
architecturally coherent?**

Tokens are the secondary axis here. The primary one is **drift accumulated at the
end of a multi-step change** — whether having a map of the architecture makes an
agent build inside it, or whether it wanders.

## Method

A live model performs the same multi-step task twice:

| Arm | Sees `.arcbridge/` | MCP tools | Drift gate |
|---|---|---|---|
| `baseline` | no — removed from its copy | no | no |
| `arcbridge` | yes | yes | **no** |

Both get the same task text, model, turn budget and file-editing tools. Each runs
in a throwaway copy of the subject repository.

### The measuring instrument

After a run finishes, the **pristine committed model is restored** onto the result
and `drift --reindex` is run against it.

That is what makes the comparison fair: **the architecture model is the ruler,
applied identically to both arms — only one arm could see it while working.** The
baseline is not penalised for lacking a file; it is measured against the same
architecture it was unknowingly building inside. The ArcBridge arm's own copy of
the model is discarded before measuring too, since an arm that edited the model
would otherwise be marking its own homework.

The instrument is calibrated: on an unmodified copy it reads **zero** drift, so
anything it reports afterwards is attributable to the agent.

### What the baseline has removed

`.arcbridge/`, `.mcp.json`, `CLAUDE.md` and `.claude/`. Withholding only the
tools would leave the baseline reading a generated convention describing a model
it cannot see. This is the honest counterfactual for "a project without
ArcBridge": no architecture document either.

The baseline receives an extra paragraph telling it to orient itself in the
codebase and stay consistent — the guidance the ArcBridge arm gets from the
generated `CLAUDE.md`. Without it the baseline would be handed a deliberately
vaguer brief, and the difference would partly measure prompt quality.

## Why there is no drift gate

The roadmap phrases this as "with gates vs. without". Taken literally that
produces a near-tautology: an arm *forced* to clear the drift gate before
finishing ends at zero drift by construction, which measures the gate's existence
rather than whether architectural awareness helps.

So the ArcBridge arm here runs **ungated**. The question is whether having the map
makes an agent naturally more coherent. A gated third arm is worth one run as an
upper bound, but its result is close to a foregone conclusion.

## Reading the output

`reports/autonomous-loop.md`, and these caveats travel with the numbers:

- **Compare drift first**, and compare tokens only between runs that actually
  COMPLETED. An arm that gave up early looks cheap for the wrong reason, which is
  why completion is measured objectively (the backend must build, and each
  required artifact must exist) rather than taken on the agent's word.
- **Token totals include cache.** `input_tokens` alone is misleading — a session
  that read 18k tokens of cached context reports 2. Cache behaviour also differs
  systematically between arms (small tool responses versus large file reads), so
  the reported total is input + output + cache-creation + cache-read, alongside
  the cost the CLI reports.
- **The treatment is bundled**: tools *and* documentation *and* convention. This
  does not isolate which of the three helps. A third arm with the docs present as
  plain markdown but no tools would separate that — a deliberate future
  refinement, not something this measures.
- **Small n.** Treat a difference smaller than the observed spread as noise. Every
  run is published individually for that reason.
- **One task, one repository.** The current task is a greenfield addition, which
  is where ArcBridge should help *least* — little existing structure has to be
  respected. A modification to existing code is the harder test and the natural
  next scenario.

## Knobs

| Variable | Default | Purpose |
|---|---|---|
| `ARCBRIDGE_LOOP_REPEATS` | `3` | Runs per arm. `1` for a cheap pilot. |
| `ARCBRIDGE_LOOP_MODEL` | `claude-sonnet-5` | Pinned so results are attributable. |
| `ARCBRIDGE_LOOP_MAX_TURNS` | `60` | Bounds the cost of a run that flails. |
| `ARCBRIDGE_LOOP_KEEP` | unset | `1` keeps the produced trees for inspection. |
| `ARCBRIDGE_BENCH_FULLSTACK` | sibling checkout | Subject repository. |

The run refuses to start, with reasons, if the `claude` CLI is missing, the
subject has no committed model, or the .NET SDK is absent.
