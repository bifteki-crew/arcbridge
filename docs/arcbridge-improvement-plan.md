# ArcBridge Improvement Plan — June 2026

Status: IN PROGRESS — A1–A4 implemented (2026-06-10), rest proposed
Baseline: v0.6.1 — 34 MCP tools, 7 templates, 5 adapters, 4 language indexers, 534 tests.

This plan turns the June 2026 project assessment into six workstreams, ordered by
release. The strategic thesis: ArcBridge is engineering-mature but has no brownfield
adoption path and no public visibility. The headline investment is `arcbridge adopt`
(reverse-engineer building blocks from existing code); everything else either
de-risks it (hardening, tests) or amplifies it (demo assets, CI action).

```
v0.6.2  Phase A: Hardening (quick wins)          ~2 days
—       Phase B: Demo & adoption assets           ~3 days   (parallel to A)
v0.7.0  Phase C: arcbridge adopt                  ~8–10 days
v0.7.1  Phase D: GitHub Action for drift          ~3–4 days
v0.8.0  Phase E: Integration tests, then          ~7–9 days
                 MCP tool consolidation (breaking)
Later   Phase F: Perf, contracts, metrics dashboard
```

---

## Phase A — Hardening (v0.6.2, ~2 days)

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

## Phase B — Demo & adoption assets (~3 days, parallel with A)

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

## Phase C — `arcbridge adopt` (v0.7.0, ~8–10 days) — the headline

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

## Phase D — GitHub Action for drift (v0.7.1, ~3–4 days)

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

## Phase E — Integration tests, then tool consolidation (v0.8.0, ~7–9 days)

Order matters: the test layer lands first because it's the regression net for the
breaking tool changes.

### E1. Integration test layer (~3 days)

- New `packages/mcp-server/src/__tests__/e2e/`: instantiate the real `McpServer`
  via `createArcBridgeServer()` with the SDK's in-memory transport against a
  fixture repo; drive a full Plan → Build → Sync → Review cycle through actual tool
  calls (init → get_guidance → reindex → check_drift → update_task →
  complete_phase). Assert on tool outputs AND on-disk YAML.
- CLI: extend the single existing test file to cover each command's error paths
  (uninitialized dir, malformed YAML, bad task id) and `--json` shapes.
- These tests define the behavioral contract that consolidation must preserve.

### E2. Tool consolidation 34 → ~22 (~4–6 days, breaking)

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

## Phase F — Later (backlog, post-0.8)

In rough priority order; not scheduled:

1. **Indexing performance** — content-hash skipping for the Python/Go tree-sitter
   indexers (TS already has it); investigate scoping dependency re-extraction to
   changed files (cross-file edges make this nontrivial — currently a documented
   full re-extract per service). Add a 1k-file synthetic benchmark to CI as a
   regression tripwire. Becomes urgent as `adopt` pulls in larger repos.
2. **Contracts table population** — schema exists, unpopulated. The route analyzers
   already see both sides in fullstack-nextjs-dotnet (Next.js fetch sites ↔ ASP.NET
   route definitions): populate contracts, add a `contract_violation` drift kind.
   Concrete, demo-able cross-service value no competitor has.
3. **Metrics dashboard** — `record_activity`/`get_metrics` data → static HTML
   report (`arcbridge report`): drift trends per block, scenario pass rates over
   time, agent-session correlation. The "architecture observability for AI teams"
   story.
4. **Git ref caching** — memoize `resolveRef()` (30–60s TTL) to cut subprocess
   overhead in tool calls that resolve refs 2–4×.
5. **Diff-scoped drift** (`drift --base <ref>`) to power PR-incremental action mode.

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
