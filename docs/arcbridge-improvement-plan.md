# ArcBridge Improvement Plan — June 2026 (updated July 2026)

Status: **Phases A–E all DONE and released through v0.10.0.** Phase A shipped
v0.6.2/v0.6.3; monorepo per-service indexing (unplanned but load-bearing) shipped
v0.7.0; Phase C `arcbridge adopt` shipped v0.8.0; Phase B (demo GIF, FAQ, example
repo) landed July 2026; v0.9.0 moved building blocks to `05-building-blocks.yaml`
for clean GitHub rendering; **v0.10.0 (2026-07-08)** bundled Phase D (drift GitHub
Action), Phase E1 (e2e MCP lifecycle suite), and Phase E2 (breaking tool
consolidation 35 → 25). **What remains open: E3 (arc42 sections as MCP resources)
and the whole "Phase F+" roadmap below.**
Baseline (June 2026): v0.6.1 — 34 MCP tools, 7 templates, 5 adapters, 4 language indexers, 534 tests.
Now: v0.10.0 — 25 MCP tools, 600 tests, 7 templates, 5 adapters, 4 indexers, route analysis for 7 frameworks.

This plan turned the June 2026 project assessment into workstreams, ordered by
release. The original thesis: ArcBridge was engineering-mature but had no brownfield
adoption path and no public visibility — so the headline investment was `arcbridge
adopt`, with everything else de-risking it (hardening, tests) or amplifying it
(demo assets, CI action). **That arc is now complete.** The next arc (Phase F+,
below) is reframed around a different gap — see [Phase F+ — Roadmap beyond
v0.10.0](#phase-f--roadmap-beyond-v0100).

```
v0.6.2/.3  Phase A: Hardening (quick wins)             DONE
v0.7.0     (unplanned) Monorepo per-service indexing   DONE — enabled dogfooding + adopt
v0.8.0     Phase C: arcbridge adopt                    DONE — the headline
—          Phase B: Demo & adoption assets             DONE — GIF, FAQ, example repo
v0.9.0     (unplanned) Building blocks as .yaml        DONE — clean GitHub rendering
v0.10.0    Phase D: GitHub Action for drift            DONE — in-repo composite action
v0.10.0    Phase E1: Integration tests                 DONE — e2e MCP lifecycle suite
v0.10.0    Phase E2: MCP tool consolidation 35→25      DONE — breaking; contract-pinned by E1
—          Phase E3: arc42 sections as MCP resources   OPEN (stretch)
0.11.0 →   Phase F+: Prove the thesis, build the moat  NEXT — see roadmap below
```

> Version note: Phase C was originally slated for v0.7.0, but v0.7.0 shipped the
> monorepo per-service indexing that dogfooding (Phase A6) surfaced as a
> prerequisite, so `adopt` released as v0.8.0. Phase D/E landed together in v0.10.0.

---

## Phase A — Hardening (v0.6.2/v0.6.3) — DONE

Closes the silent-failure modes found in the June 2026 audit. All items are small,
independent, and each ships with a regression test.

### A1. Atomic YAML/markdown writes
- Add `atomicWriteFileSync(filePath, content)` to `packages/core/src/utils/`
  (write to `<file>.tmp.<pid>` in the same directory, then `renameSync` — same-volume
  rename is atomic on POSIX and effectively so on Windows/NTFS).
- Replace every `writeFileSync` that touches user source-of-truth files:
  - `core/src/sync/yaml-writer.ts` (all sync/add/delete functions)
  - `core/src/generators/arc42-generator.ts` (`writeMarkdownWithFrontmatter`)
  - any other generator writing into `.arcbridge/`.
- Test: inject a write failure (mock `renameSync` throw) and assert the original
  file is untouched.

### A2. `refreshFromDocs` failure safety
- `core/src/generators/db-generator.ts` (~line 364): the clear+repopulate runs with
  FK checks off and only a `finally` restoring the pragma. Wrap `refresh()` in
  try/catch: on any populate error, roll back the transaction, restore
  `PRAGMA foreign_keys = ON`, and rethrow with a message naming the offending YAML
  file. The DB must never be left half-populated.
- Test: fixture with valid building-blocks but malformed phases.yaml → refresh
  throws AND building_blocks still contains pre-refresh rows.

### A3. Scope the component-table delete by service
- `core/src/indexer/component-analyzer.ts:335` does a global `DELETE FROM components`.
  Change to `DELETE FROM components WHERE symbol_id IN (SELECT id FROM symbols WHERE
  service = ?)` and run it inside the indexing transaction. Matters for the
  fullstack-nextjs-dotnet template where two services share one DB.
- Test: index service A, index service B, assert A's component rows survive.

### A4. Stop swallowing errors silently
- Add a tiny stderr logger (`logWarn` in core) — stderr only, so `--json` stdout and
  MCP stdio framing stay clean.
- Apply at the known swallow sites: `core/src/indexer/dotnet-indexer.ts`
  (`findDotnetProject` and friends), `mcp-server/src/tools/get-symbol.ts` file-read
  catch, `core/src/db/connection.ts` rollback catches.
- Rule going forward: every `catch` either rethrows, returns a typed fallback AND
  logs, or has a comment stating why silence is correct.

### A5. Path containment helper
- Add `resolveWithin(root, relPath)` to core: `path.resolve` + verify
  `path.relative(root, resolved)` doesn't start with `..` (and isn't absolute);
  throw otherwise.
- Apply where DB- or param-sourced paths are joined into reads/writes:
  `mcp-server/src/tools/get-symbol.ts:78` (`symbol.file_path` from DB),
  `update-arc42-section.ts` section path, yaml-writer task/phase file paths.
- Test: symbol row with `file_path: "../../etc/passwd"` → tool returns an error,
  no read attempted.

### A6. Drift check in our own CI
- Dogfood: run `arcbridge init` on the arcbridge repo itself (api-service template,
  blocks = the four packages), commit `.arcbridge/`, and add a drift step to
  `.github/workflows/ci.yml` after `pnpm test`. This is both a guard and the
  fixture for Phase D.

---

## Phase B — Demo & adoption assets — DONE

Shipped July 2026: VHS-rendered `arcbridge adopt` demo GIF as the README hero
(`docs/demo/adopt.gif` + checked-in `.tape`), a Troubleshooting & FAQ section,
and the public worked example
[bifteki-crew/arcbridge-example-bookmarks](https://github.com/bifteki-crew/arcbridge-example-bookmarks).
Original plan (for reference):

No code changes; pure conversion-rate work. A stranger must be able to judge
ArcBridge in 3 minutes without installing it.

### B1. Terminal demo GIF for the README
- Script: `arcbridge init` on a small Next.js app → `.mcp.json` → agent calls
  `get_guidance` on a file → introduce a cross-block import → `arcbridge sync`
  flags the dependency violation.
- Record with VHS (charmbracelet) so the demo is a checked-in `.tape` file,
  re-recordable when output changes. Place the GIF directly under the README title.

### B2. Public example repo
- Publish the walkthrough bookmark app, completed through phase 2, as
  `bifteki-crew/arcbridge-example-bookmarks` with `.arcbridge/` committed and a
  README pointing back. Link it from README and walkthrough.
- Stretch: also publish a brownfield "before/after adopt" branch once Phase C lands.

### B3. README additions
- Troubleshooting/FAQ section: MCP server won't connect (Node version, restart
  agent, `--dir`), init on monorepos (one `.arcbridge/` per service — documented
  limitation), what to do when sync reports a wall of drift on an existing repo
  (points at Phase C once shipped).
- Brownfield section: honest today ("expect to rewrite the template blocks"),
  upgraded when `adopt` ships.
- Package-naming cleanup: keep the CLI as unscoped `arcbridge` (best npx ergonomics);
  make every doc consistently use `arcbridge` for the CLI and
  `@arcbridge/mcp-server` for the server, and state that split explicitly once.

---

## Phase C — `arcbridge adopt` (released v0.8.0) — the headline — DONE

Goal: point ArcBridge at an existing codebase and get a *proposed* architecture
model — building blocks with code paths, candidate interfaces, and evidence — that
a human or agent reviews and applies. Converts brownfield onboarding from
"hand-edit 10 YAML files" to "trim a generated proposal."

### Design

**C1. Core module `packages/core/src/adopt/`**

```
proposeBuildingBlocks(db, {
  projectRoot, service?, maxBlocks?, minFilesPerBlock?
}): AdoptProposal

AdoptProposal = {
  blocks: ProposedBlock[]          // superset of BuildingBlockSchema
  unassigned: string[]             // files no cluster claimed
  stats: { files, symbols, edges, internalEdgeRatio }
}
ProposedBlock = BuildingBlock & {
  confidence: "high" | "medium" | "low"
  evidence: {
    fileCount: number
    internalEdges: number          // deps within the cluster
    inboundEdges: number           // deps from other clusters → interface signal
    outboundEdges: number
    topInboundSymbols: string[]    // most-depended-on exported symbols → candidate interfaces
    routes: string[]               // from routes table, if any land in this cluster
    componentStats?: { client: number, server: number }  // from components table
  }
}
```

Algorithm (heuristic, deterministic — no LLM in the core path):

1. Ensure fresh index: `indexProject(db, { projectRoot, service })`.
2. Aggregate symbol-level `dependencies` edges to directory-level edges
   (`symbols.file_path` → parent dirs). Both tables already have everything
   needed; no schema change.
3. Seed clusters from the directory tree: children of the source root
   (e.g. `src/*`, or per-service roots from `config.yaml` services).
4. Refine by cohesion:
   - **Merge** sibling clusters whose cross-edge density exceeds a threshold
     relative to their internal density (they're one module split across dirs).
   - **Split** a cluster bigger than `minFilesPerBlock × ~8` whose subdirectories
     have low mutual coupling.
   - Respect `maxBlocks` (default 10 — arc42 level-1 blocks should stay countable).
5. Enrich with evidence: routes in cluster → suggest api-boundary responsibility;
   `components.is_client` density → UI-layer responsibility; top inbound exported
   symbols → `interfaces` candidates.
6. Draft `responsibility` from directory name + dominant symbol kinds + most common
   doc_comment terms, suffixed with `(auto-generated — refine)`. IDs are
   kebab-cased directory names, deduplicated.

This is deliberately the inverse of `drift/detector.ts#detectUndocumentedModules`
(which maps files → blocks by code_path prefix): adopt groups files into prefixes
such that, immediately after applying, drift reports zero `undocumented_module`
entries.

**C2. CLI command `arcbridge adopt`** (follows the `sync.ts` pattern: manual args,
`--dir`, `--json`)

- No `.arcbridge/` present → scaffold a **minimal** init first (config.yaml, arc42
  skeleton, empty plan, roles) — requires a new internal "blank" template variant
  that generates structure without example blocks/scenarios/phases.
- `.arcbridge/` present → propose blocks only for files currently unmatched by any
  existing block's code_paths (incremental adoption; never touches existing blocks).
- Default run: print the proposal (human-readable table + evidence) and write it to
  `.arcbridge/proposals/building-blocks.md` for review. **`--apply`**: serialize
  into `05-building-blocks.md` via the `buildingBlocksTemplate` frontmatter+body
  pattern, then `refreshFromDocs()`. `--json` emits the `AdoptProposal` object.

**C3. MCP tool `arcbridge_propose_building_blocks`** (thin wrapper over C1)

This is what makes adoption *agent-assisted*: the connected agent calls the tool,
gets proposals + evidence, rewrites the auto-generated responsibilities using its
semantic understanding of the code, then persists via the existing
`update_arc42_section`. Add a short "adopting an existing project" flow to
`adapters/src/shared/instructions.ts` so generated platform configs teach agents
this path. (Net +1 tool now; reabsorbed in Phase E.)

**C4. Docs**

- New `docs/adopting-existing-codebases.md`: CLI path, agent-assisted path, how to
  review a proposal, iterating with `check_drift`.
- README brownfield section upgraded to lead with `arcbridge adopt`.

### Acceptance criteria

- Dogfood: `arcbridge adopt` on the arcbridge repo proposes ≥4 blocks aligning with
  `packages/{core,adapters,cli,mcp-server}`; after `--apply`, `arcbridge drift`
  reports zero `undocumented_module` entries.
- One mid-size external OSS repo (100–300 files) produces a sane proposal —
  manual judgment, recorded in the PR description.
- `adopt` on an already-fully-documented repo proposes nothing and says so.
- Runtime < 30s on a 1,000-file repo (indexing dominates; clustering is SQL + memory).

### Known limitations (document in the guide)

- Clustering is structural (imports/calls), not semantic — directory layout that
  doesn't reflect architecture yields mediocre seeds; agent refinement is the
  recommended second pass.
- Symbol-level dependency data only: files with no extractable symbols (configs,
  assets, barrel-only files) land in `unassigned`.
- Level-1 blocks only in v1; no `parent_id` hierarchy proposals.
- Polyglot repos: proposals are per-service, mirroring the existing one-`.arcbridge/`
  -per-service model.

---

## Phase D — GitHub Action for drift — DONE (July 2026)

Shipped as an in-repo composite action (`action/`, used as
`bifteki-crew/arcbridge/action@<ref>`): runs `drift --reindex --json`, writes a
job summary, keeps a sticky PR comment updated, configurable
`severity-threshold`, dogfooded in this repo's CI and the example repo.
Deviation from the plan below: no separate `bifteki-crew/arcbridge-action`
marketplace repo yet — a subdirectory action avoids a second repo; extract it
if marketplace listing is wanted later. Original plan (for reference):

Goal: a marketplace action that makes drift a PR-time gate and a recruitment
channel (every adopting repo shows ArcBridge comments to its contributors).

- **Form:** composite action in this repo under `action/` (action.yml), published
  to the marketplace as `bifteki-crew/arcbridge-action@v1`. Composite (not
  Docker/JS) keeps it trivial: setup-node 22, `npx arcbridge@<pinned> drift --json`,
  post-process with `actions/github-script`.
- **Inputs:** `working-directory` (monorepo support), `severity-threshold`
  (`error` default; `warning` for strict repos), `comment` (bool, default true),
  `arcbridge-version` (default: pinned latest).
- **Outputs/behavior:**
  - Parse `{ drift: DriftEntry[] }` (`kind`, `severity`, `description`,
    `affectedBlock`, `affectedFile`).
  - Always write a `GITHUB_STEP_SUMMARY` table.
  - On PRs: upsert a single sticky comment (HTML marker `<!-- arcbridge-drift -->`)
    listing entries grouped by severity, with file links.
  - Fail the job iff entries at/above the threshold exist (the CLI already exits 1
    on error-severity drift — the threshold logic just decides whether to propagate).
- **Prereq check:** `.arcbridge/` must be committed; index.db is gitignored but
  v0.6.1 already auto-recreates it from YAML on fresh clones, so the action needs
  no extra setup step. Verify this path in the action's own integration test.
- **Dogfood:** enable on the arcbridge repo (uses Phase A6's `.arcbridge/`) and on
  the example repo from B2 — the example repo's PRs become living demos.
- v1 scope cut: whole-repo drift only; diff-scoped drift (`--base <ref>`) is a
  CLI feature for later, noted in the action README.

---

## Phase E — Integration tests, then tool consolidation (v0.10.0) — DONE

Order matters: the test layer lands first because it's the regression net for the
breaking tool changes.

### E1. Integration test layer — DONE (July 2026)

Shipped: `packages/mcp-server/src/__tests__/e2e/lifecycle.test.ts` drives a real
MCP Client ↔ ArcBridge server pair over the SDK's in-memory transport through
the full Plan → Build → Sync → Review cycle (init → adopt → reindex → search →
guidance → drift → task CRUD → phase gates → refresh round-trip), asserting
tool outputs AND on-disk YAML. CLI tests extended with error paths
(uninitialized dir, malformed phases.yaml, unknown service, no-symbols) and
adopt `--json` shapes. This suite is the behavioral contract for E2.
Original plan (for reference):

- New `packages/mcp-server/src/__tests__/e2e/`: instantiate the real `McpServer`
  via `createArcBridgeServer()` with the SDK's in-memory transport against a
  fixture repo; drive a full Plan → Build → Sync → Review cycle through actual tool
  calls (init → get_guidance → reindex → check_drift → update_task →
  complete_phase). Assert on tool outputs AND on-disk YAML.
- CLI: extend the single existing test file to cover each command's error paths
  (uninitialized dir, malformed YAML, bad task id) and `--json` shapes.
- These tests define the behavioral contract that consolidation must preserve.

### E2. Tool consolidation 35 → 25 (breaking) — DONE (July 2026)

Shipped merges 1–8 of the sign-off (user chose 25 tools over the deeper 22 —
the last three candidate merges combined tools with genuinely different
inputs/outputs). Implementation: old tool files became exported handler
modules (bodies untouched — the E1 contract suite pins behavior); thin merged
registrations dispatch on `action`. A guard test fails if any retired tool
name reappears in tool sources, adapters, or role templates.
Original plan (for reference):

Rationale: ~15–20K tokens of tool schemas per session today; mergeable CRUD
clusters degrade agent tool selection. Target ~22 tools / ~9–11K tokens.

Merges (handlers mostly already share helpers, so this is registration-layer work):

| New tool | Replaces | Shape |
|---|---|---|
| `get_building_blocks` | + `get_building_block` | optional `block_id` → detail view |
| `query_symbols` | `search_symbols` + `get_symbol` | `query?` or `symbol_id?`, `include_source?` |
| `manage_tasks` | `create_task`, `update_task`, `delete_task` | `action: create\|update\|delete` discriminated union |
| `manage_phases` | `create_phase`, `delete_phase`, `complete_phase` | `action` union (complete keeps its gate checks) |
| `quality_scenarios` | `get_quality_scenarios` + `update_scenario_status` | `action: list\|update`; `verify_scenarios` stays separate (runs tests) |
| `get_metrics` | + `export_metrics` | optional `format: json\|csv` |
| `arc42` | `propose_arc42_update` + `update_arc42_section` | `action: propose\|update` |

Keep as-is: init_project, get_project_status, activate_role, get_relevant_adrs,
get_open_questions, get_phase_plan, get_current_tasks, reindex,
get_dependency_graph, get_component_graph, get_route_map, get_boundary_analysis,
check_drift, get_guidance, get_practice_review, run_role_check, verify_scenarios,
record_activity, propose_building_blocks (from Phase C).

Migration mechanics:

- **Clean break at 0.8.0** (pre-1.0 semver; no alias layer — MCP has no native
  aliasing and double-registration doubles the schema cost we're cutting).
- Update every hardcoded tool-name reference — the known coupling points:
  `adapters/src/shared/instructions.ts` (~25 refs), `adapters/src/shared/skills.ts`,
  all 5 adapter files, role definitions in
  `mcp-server/src/tools/activate-role.ts:282-433`, README, walkthrough,
  how-agents-use doc. Add a grep-based test asserting no stale tool names exist in
  adapters/templates/docs.
- Users regenerate platform configs with `arcbridge generate-configs --force`;
  CHANGELOG carries an old→new mapping table.

### E3 (stretch, same release). Expose arc42 section content as MCP resources
(`arcbridge://arc42/<section>`) so read-heavy doc fetches stop consuming tool-call
turns. Tools remain the compatibility path since not all clients consume resources.

---

## Phase F+ — Roadmap beyond v0.10.0

**The reframe.** Phases A–E built the *engine* and gave it a brownfield on-ramp.
What's still missing is different in kind: the whole pitch rests on two success
metrics from the project plan that **nothing currently measures**, and the spec's
self-declared *"killer feature — cross-service contract alignment, which no
competitor has"* is only half-built. So the next arc is organized around four
questions, not a flat backlog.

The two unproven north-star metrics (from `arcbridge-project-plan.md`):
- **"Token usage for common tasks is reduced by 60%+ vs raw file reading."**
- **"Arc42 documents stay within 1 session of accuracy — drift is never more than
  one coding session old."**

And the load-bearing risk the plan names explicitly: *"The sync loop is
load-bearing — if it's clunky, slow, or low-quality, the whole convention
collapses."* Its quality is currently untested.

### Four strategic lenses

1. **"Is it true?" — Prove the thesis.** Instrument and benchmark the two metrics
   above. A reproducible harness demonstrating the token reduction is both product
   validation and the "honest marketing" the plan values (0 stars today; a credible
   number beats any GIF).
2. **"Why us?" — Build the moat.** Cross-service **contract alignment**: the one
   capability nothing else has. The route analyzers already parse both sides in
   `fullstack-nextjs-dotnet`; the contracts table is defined but empty.
3. **"Will they stay?" — Make the loop frictionless.** Diff-scoped drift for fast
   PR checks, indexer perf, and — most importantly — actually *evaluating*
   sync-proposal quality and latency.
4. **"Will they find it?" — Distribution & convention.** The meta-goal is ecosystem
   adoption of the *convention*, not the tool (convention guide, case study, VS Code
   surface). Marketing-shaped; runs in parallel, off the engineering critical path.

### The autonomous-loop reframe (2026)

The original metrics assumed **interactive coding sessions with a human in the
loop**. Usage is trending toward **autonomous, orchestrated agent loops** (we
prototyped this early with spawned example builds, and the system works in that
mode). This *sharpens* the four lenses rather than replacing them — the core
concept is untouched:

- **Drift detection stops being a convenience and becomes the enforcement layer.**
  With no human watching in real time, the only thing between an agent and
  accumulated architectural rot is a programmatic gate — exactly what `check_drift`,
  the `complete_phase` gates, and the CI Action already are (Phase D). Lens 3 quietly
  grows to include multi-agent. This machinery is built; it's just framed today as a
  dev convenience rather than the autonomous-era governor it actually is.
- **Token savings compound instead of being a one-session win.** A single session
  saves tokens once; an N-step loop that re-scans files every iteration wastes it
  N×. So the proof point (lens 1) shifts from *"60% per task"* to **"stays
  architecturally coherent across N unattended steps at roughly flat context
  cost."** The 60% doesn't shrink — it's just the wrong framing for a loop.
- **ArcBridge is already a shared-state substrate for orchestration.** The
  YAML-source-of-truth + queryable DB + phase/task model + drift log is the
  "blackboard" spawned agents need to coordinate: what's decided, what's done,
  what's next, what's out of bounds.

**Design guardrail:** ArcBridge is the architectural memory + governance layer an
orchestrator plugs into — it does **not** own the loop. Plenty of orchestrators
exist (subagents, fleet mode, LangGraph, CrewAI); competing with them would betray
the plan's own principle, *"put the brain in the MCP server, put the UX in the agent
config."* "More loop focus" means *be an excellent MCP-native context + governance
provider for orchestrated agents*, never *build our own loop.*

### Milestone sequence

| Milestone | Theme (lens) | Contents |
|---|---|---|
| **0.11.0** | Prove it + fast feedback (1, 3) | **validation corpus + harness (F0)**; token-savings + coherence benchmark on it; `drift --base <ref>` + Action diff mode; Python/Go content-hash skipping; git-ref cache |
| **0.12.0** | The moat (2) | symbol-ID namespacing fix → populate contracts table → `contract_violation` drift → surface tool + demo on the example repo |
| **0.13.0** | Observability + retention (3) | `arcbridge report` metrics dashboard; sync-proposal quality/latency hardening; **E3** arc42 sections as MCP resources |
| Candidate | Orchestration-readiness (3) | parallelizable-task surface from the building-block graph; single-writer reconciliation as the recommended pattern; fleet observability — see sketch below |
| Parallel | Distribution (4) | standalone convention guide (Phase 9); before/after `adopt` case study; VS Code surface (Phase 8, later) |
| Deferred | Breadth | security/quality scanning (Phase 7); deeper .NET DI/EF/middleware (Phase 10); full cross-service tasks/scenarios (monorepo P3) |

Rationale for leading with 0.11.0: proving the token claim is the highest-leverage
*non-obvious* move (the entire pitch rests on an unmeasured number), the pieces are
mostly ready-to-build and low-risk, and `drift --base` also unlocks the Action's
incremental mode — real user value. The release opens with **F0, a small
validation corpus + harness**, because it's the substrate every other item leans on
— F1 can't be honest without it, and it becomes the shared fixture for 0.12.0
(contracts need a fullstack project) and 0.13.0 (drift-staleness) too, so building it
once pays off three times. Contract alignment (0.12.0) is the strategic centerpiece
but is higher-effort and depends on the namespacing fix, so it follows the de-risking
milestone.

### 0.11.0 — detailed breakdown (SHIPPED)

**F0. Validation corpus + harness** — **DONE** (0.11.0; corpus extended in 0.14.0 with two live repositories)
- A small, pinned set of **2–3 projects spanning the shapes that exercise different
  code paths**: a TS frontend (the existing `example-bookmarks`, or a react-vite
  fixture), a backend (`api-service` or `dotnet-webapi` — exercises the C#/route
  paths), and a fullstack/monorepo (needed for 0.12.0 anyway; holds both contract
  sides). Optionally a **brownfield repo with no `.arcbridge/`** to validate `adopt`
  end-to-end. Some can be generated-from-template fixtures (zero maintenance); at
  least one should be a real committed repo (honest + doubles as a public example).
- **Two harness layers, matching two testing modes:**
  - *Functional smoke (gates in CI):* run init/index/`adopt`/drift across the corpus
    and assert sane output + zero unexpected errors. Catches regressions across
    templates, indexers, and languages. (Partly exists today — the `check` job runs
    `drift --reindex` on the dogfood repo — this generalizes it to more shapes.)
  - *Deterministic token proxy (non-gating report in CI):* for a fixed question set,
    compare `tokens(ArcBridge tool response)` vs `tokens(the files an agent would
    otherwise read to answer)`. No live model — fully reproducible, stable enough to
    report on every PR without flakiness.
- **Explicitly out of scope for CI:** the *live-agent* eval (a real model driving
  tool calls vs. raw file reading, measuring tokens-to-*complete*). That is
  non-deterministic and costs money per run — reserve it for a **periodic/manual**
  job once the corpus exists (it's F1's multi-step-autonomous scenario, run
  on-demand, never as a PR gate).
- Acceptance: the corpus is committed/pinned; the functional-smoke job is green in
  CI; the token-proxy job emits a deterministic table.

**F1. Token-savings + coherence benchmark harness** — **Part A (single-shot Q&A) DONE**; Part B (multi-step autonomous) NOT started
- **Two scenario classes, not one** — reflecting the autonomous-loop reframe:
  - *Single-shot Q&A:* realistic agent questions ("where does auth belong?", "what
    calls `verifyToken`?", "what quality constraints apply to this file?") run two
    ways — (a) ArcBridge MCP tools, (b) a raw-file-reading baseline — measuring
    tokens-to-answer. This substantiates the classic "60%+" per-task claim.
  - *Multi-step autonomous:* a small unattended build/change loop (N steps) run
    with-ArcBridge vs. baseline, measuring **two** things: cumulative
    tokens-to-complete *and* **architectural drift accumulated** (drift entries at
    the end) with gates vs. without. This is the loop-era proof point — coherence at
    roughly flat context cost across unattended steps.
- Runs on the **F0 corpus** so results are reproducible by anyone. The single-shot
  class uses F0's deterministic token proxy (CI, per-PR); the multi-step-autonomous
  class is the live-agent eval reserved for a periodic/manual job (not a PR gate).
- Output a small report (numbers + methodology) suitable for the README. Target:
  substantiate or honestly revise both claims. **Do not cherry-pick** — if the real
  number is lower, publish it; a defensible 35% beats an unbelievable 60%.
- Acceptance: `pnpm bench:tokens` (or similar) produces a deterministic table for the
  single-shot class in CI; the multi-step report is regenerated on demand.

**F2. Diff-scoped drift — `arcbridge drift --base <ref>`** — **DONE** (0.11.0)
- Restrict drift analysis to files changed since `<ref>` (e.g. the PR base), so PR
  checks are fast and comment only on what the PR touched.
- Wire an optional `base` input into the composite Action for a PR-incremental mode
  (the v1 Action deliberately cut this — see Phase D scope note).
- Watch the file→block assignment: a changed file must still resolve against the
  *full* building-block set (longest-prefix rule), not just changed blocks.
- Acceptance: on a PR touching one file, drift reports only that file's issues;
  Action comment scopes to the diff; whole-repo mode unchanged by default.

**F3. Python/Go content-hash skipping** *(perf; TS already has it)*
- Extend the content-hash incremental-skip the TS indexer uses to the Python/Go
  tree-sitter indexers, so unchanged files aren't re-parsed every run.
- Add a ~1k-file synthetic-repo benchmark to CI as a regression tripwire (the
  original Phase F item 1).
- Acceptance: second `reindex` on an unchanged Python/Go tree does near-zero parse
  work; benchmark records index time.

**F4. Git-ref caching** *(small perf)*
- Memoize `resolveRef()` with a 30–60s TTL to cut subprocess overhead where a
  single tool call resolves refs 2–4×.
- Acceptance: repeated ref resolution within the TTL issues one `git` subprocess.

> Sequencing within 0.11.0: **F0 first** (the corpus + harness — everything else
> validates against it), then F2 (`drift --base`, highest user value + unblocks the
> Action), then F1 (the benchmark — ideally *use* F2's speed in the "with ArcBridge"
> path), then F3/F4 (perf polish). F1 is the release's headline number; F3/F4 can
> slip to 0.11.x if needed. The live-agent eval is periodic/manual, not part of the
> release gate.

### 0.12.0 — the moat (contract alignment), sketch

The differentiator, detailed enough to size but not yet scheduled:
1. **Symbol-ID namespacing (foundation)** — monorepo P0 from the project plan:
   symbol IDs currently collide across services. Namespace them by service before
   any cross-service feature can be trusted. Migration + tests.
2. **Populate the contracts table** — the schema exists but is empty. Drive it from
   the `fullstack-nextjs-dotnet` route analyzers, which already see both the Next.js
   fetch sites and the ASP.NET route/DTO definitions.
3. **`contract_violation` drift kind** — detect field-name/casing/type/nullability
   mismatches between a frontend client type and its backend DTO; surface via a tool
   and the drift report.
4. **Demo it** — a deliberately-broken contract in the example repo that the tool
   catches, mirroring the `adopt` dogfooding pattern (a permanent fixture + honest
   marketing).

### Native orchestration pattern + orchestration-readiness (candidate)

Running the ArcBridge loop with multiple agents mirrors the loop itself: **pick a
phase → prepare shared context (Plan) → fan out independent sub-tasks (Build) →
gather + Sync/Review.** A single lead/orchestrator owns the shared state; spawned
agents do partitioned code work on their own tasks. We prototyped this early with
spawned example builds; it works.

Two observations reshape the earlier concurrency worry:

- **Concurrency isn't ArcBridge-specific, and the natural shape avoids it.** Two
  agents editing the same source file conflict on *any* project — handled the usual
  way (partition the work, or one writer reconciles). Same for ArcBridge's shared
  task/phase ledger: if the orchestrator is the single writer of status (agents
  report results up, it writes them back through the YAML-sync path), the
  read-modify-write lost-update case never arises. So it's a **known limitation with
  a natural workaround (single-writer / partitioned work)**, not a blocker — document
  it; don't necessarily engineer around it.
- **ArcBridge can tell you what's safe to parallelize — that's the real value-add.**
  Tasks already map to building blocks, and building blocks already declare their
  dependency edges (`interfaces` — the same ones drift uses for
  `dependency_violation`). So the model already knows which sub-tasks touch
  *disjoint, non-dependent* blocks (fan out concurrently) vs. which share a block or
  a dependency edge (serialize). Surfacing that — "here are the tasks you can safely
  run in parallel right now" — is something an orchestrator can't easily derive on
  its own, and it's uniquely ours because we hold the architecture graph.

Candidate scope (not scheduled; pull forward if orchestrated usage becomes a
priority):
1. **Parallelizable-task surface (the differentiated piece).** Extend the work-queue
   idea: return next unblocked tasks *annotated with a parallel-safe grouping*
   derived from building-block boundaries + dependency edges, so an orchestrator
   knows what to fan out vs. serialize.
2. **Single-writer reconciliation as the recommended pattern.** Document it (the
   orchestrator owns shared-state writes). Only if direct concurrent writes are ever
   genuinely needed, add optimistic concurrency (version/mtime check + retry) — the
   read-modify-write path in `core/src/sync/yaml-writer.ts` is corruption-safe but
   not lost-update-safe today.
3. **Fleet observability (leans on 0.13.0).** `record_activity`/`get_metrics` already
   carry `model`/`agent_role`/`session` dimensions — the dashboard becomes
   observability across a fleet of autonomous agents, mostly a framing + reporting
   win on existing data.

> Guardrail (repeat): a first-class *state + governance provider* for orchestrators,
> not an orchestrator. If it starts to look like a scheduler, stop.

### Backlog / deferred (unchanged, mapped into the lenses above)

- **Metrics dashboard** (`arcbridge report`) — static HTML from
  `record_activity`/`get_metrics`: drift trends per block, scenario pass rates over
  time, agent-session correlation → **0.13.0** (lens 3). Also the natural home for
  the "1 session of accuracy" drift-staleness measurement.
- **Sync-proposal quality/latency** — evaluate `propose_arc42_update` output quality
  and hold it to the <10s budget the plan sets → **0.13.0** (lens 3); this is the
  load-bearing risk.
- **E3 — arc42 sections as MCP resources** (`arcbridge://arc42/<section>`) → **0.13.0**.
- **Convention guide, adopt case study, VS Code surface** → parallel distribution
  track (Project-plan Phases 8/9; lens 4).
- **Security/quality scanning** (Project-plan Phase 7), **deeper .NET** (DI/EF/
  middleware, Phase 10), **full cross-service tasks/scenarios** (monorepo P3) →
  deferred breadth; pull in when a concrete user or demo demands them.

---

## Decisions taken in this plan (flag if you disagree)

1. **Clean break on tool names at 0.8.0**, no deprecation aliases.
2. **CLI stays unscoped `arcbridge`** on npm; docs made consistent instead of renaming.
3. **Adopt is heuristic-core + agent-refinement**, not LLM-in-the-loop in core —
   keeps the CLI deterministic and offline-capable; the MCP tool is where
   intelligence gets layered on.
4. **Composite action** (not a JS/Docker action) for v1 of the GitHub Action.
5. **Dogfooding ArcBridge on its own repo** as part of Phase A — gives Phases C and
   D a permanent fixture and is honest marketing.
