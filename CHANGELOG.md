# Changelog

## 0.5.0 (2026-04-24)

### New Features

- **Python indexer (experimental)** — tree-sitter WASM-based indexer for Python projects. Extracts functions, classes, methods, async functions, constants (ALL_CAPS), variables, decorators, docstrings, and return type annotations. Dependency extraction covers calls, class inheritance, and type usage. Auto-detected via `pyproject.toml`, `requirements.txt`, or `setup.py`.
- **Go indexer (experimental)** — tree-sitter WASM-based indexer for Go projects. Extracts functions, structs (as class kind), interfaces, methods with receiver qualification (e.g. `User.DisplayName`), constants, variables, and doc comments. Dependency extraction covers calls, struct/interface embedding, and type usage. Auto-detected via `go.mod`. Excludes test files (`*_test.go`) and generated code (`*_gen.go`, `*.pb.go`).
- **Windows MCP configuration** — all platform adapters now generate Windows-compatible MCP config (`cmd /c npx`) when running on Windows.

### Improvements

- **Language-scoped incremental indexing** — all indexers (TypeScript, C#, Python, Go) now scope hash lookups, symbol queries, and dependency cleanup by language. Prevents cross-language data loss when multiple languages are indexed under the same service.
- **`removeScopedSymbolsForFiles`** — new DB helper that scopes symbol deletion by service + language, replacing the unscoped `removeSymbolsForFiles` in all tree-sitter and TypeScript indexers.
- **`arcbridge_reindex` accepts `python` and `go`** — the language parameter now includes all four supported languages.
- **Init resilience** — `indexProject` returns a `skippedReason` instead of throwing when no tsconfig.json is found, with clear messaging in the init summary distinguishing "skipped" from "failed".
- **Language detection reordered** — `package.json`-only check moved below Go/Python to avoid misdetecting polyglot projects. `tsconfig.json` still takes top priority.
- **`IndexerLanguage` type** — new compile-time type for language parameters, preventing invalid values.

### Stats

- 34 MCP tools, 510 tests passing, 0 lint errors, 0 type errors
- 6 project templates, 5 platform adapters, 4 language indexers

## 0.4.2 (2026-04-11)

### New Features

- **OpenCode platform adapter** — 5th platform adapter, generated via `--platform opencode`. Creates `opencode.json` (MCP config with instructions reference), `OPENCODE.md` (project instructions), `.opencode/agents/` (role definitions with frontmatter: description, mode, permission), and `.opencode/skills/` (sync + review skills in OpenCode's native location).

### Improvements

- **README restructured** — new "The Problem" and "How It Works" sections explain the Plan → Build → Sync → Review workflow with an ASCII diagram, concrete definitions of building blocks, quality scenarios, drift detection, and phase gates. Clarifies that scaffolded architecture is a starting point to be tailored, not a fixed plan.
- **Init tool summary** — completion output now lists generated files for all 5 platforms (previously only showed Claude and Copilot)
- **Init tool description** — platforms param description now names all supported platforms

### Refactoring

- **Shared adapter utilities** — extracted `writeWithMarkerMerge` (marker-merge.ts), `generateInstructions` (instructions.ts with prefix/suffix options), and parameterized `generateSkills` (accepts custom base directory). Removes ~200 lines of duplication across Gemini, Codex, and OpenCode adapters.

### Stats

- 34 MCP tools, 457 tests passing, 0 lint errors, 0 type errors
- 6 project templates, 5 platform adapters

## 0.4.1 (2026-04-09)

### Security

- **0 vulnerabilities** — added pnpm overrides for `hono >=4.12.12`, `@hono/node-server >=1.19.13`, `vite >=7.3.2`. `pnpm audit` now returns clean.

### Fixes

- **SQL ESCAPE clause** — all LIKE queries using `escapeLike()` now include `ESCAPE '\\'` and escape backslashes in addition to `%` and `_`
- **DB migration v4** — existing installs get `idx_tasks_phase` and `idx_phases_status` indexes via `migrate()`
- **Stale docs** — Node.js version 20+ → 22.16+, added Angular/Unity/Codex/Gemini to project-overview and walkthrough, fixed "C# indexer planned" message

### Stats

- 34 MCP tools, 439 tests passing, 0 vulnerabilities, 0 lint errors, 0 type errors

## 0.4.0 (2026-04-07)

### New Features

- **Angular project template** (`angular-app`) — 6th project template targeting modern Angular with standalone components. Reuses the existing TypeScript indexer with Angular-specific templates, quality scenarios, and component detection.
  - 6 building blocks: app-shell, core-services, shared-components, feature-modules, models, api-client
  - Angular-specific quality scenarios: bundle size (<200KB gzipped), OnPush/signal change detection, lazy loading on feature routes, bypassSecurityTrust audit
  - 4 phases: Project Setup, Foundation, Core Features, Polish & Launch
  - Auto-detection via `angular.json` (prefers `defaultProject`)
  - UX reviewer role included
  - ADR: "Use Angular with Standalone Components" (documents component graph limitation)

- **Angular `@Component` detection** — the TypeScript symbol extractor and component analyzer now detect Angular `@Component`-decorated classes:
  - Classified as `kind: "component"` (consistent with React components)
  - Extracts selector from decorator metadata
  - Detects signal-based state (`signal()`, `computed()`) via AST
  - Extracts standalone component `imports` array
  - `arcbridge_get_component_graph` returns Angular components with selectors and state

- **Dependency updates** — all 5 security vulnerabilities resolved:
  - `@modelcontextprotocol/sdk` 1.27.1 → 1.29.0 (fixes path-to-regexp CVEs)
  - `picomatch` forced to safe versions via pnpm overrides
  - `yaml`, `web-tree-sitter`, `eslint`, `typescript-eslint` updated

### Stats

- 34 MCP tools, 439 tests passing, 0 lint errors, 0 type errors
- 6 project templates, 4 platform adapters

## 0.3.3 (2026-04-06)

### New Features

- **Phase filtering** — `arcbridge_get_phase_plan` now accepts `phase_id`, `status`, and `include_completed` params to reduce output for large projects. `arcbridge_get_current_tasks` accepts `phase_id` to target a specific phase.
- **React-vite component graph** — all Vite components are now correctly marked `is_client=1` since there's no server component concept. The `client_only` filter on `get_component_graph` now works for react-vite projects.

### Improvements

- **Architect role** — added `update_arc42_section` to required tools
- **Init tool** — platforms param validates against `z.enum()` matching config schema (rejects invalid platforms at input)
- **`get_project_status`** — shows template and platforms, consolidated 3 meta queries into 1
- **CI workflows** — `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` on all workflows (suppresses Node.js 20 deprecation warnings)
- **Client-only detection** — explicit `CLIENT_ONLY_TEMPLATES` set in indexer for extensibility
- **`phase_id` exact lookup** — bypasses `include_completed` flag (fetching by ID always returns the phase)

### Stats

- 34 MCP tools, 432 tests passing, 0 lint errors, 0 type errors

## 0.3.2 (2026-04-06)

### New Features

- **Gemini adapter** — 4th platform adapter. Generates `.gemini/settings.json` (MCP config with smart merge), `.gemini/styleguide.md` (project instructions), `GEMINI.md` (CLI instructions), and `.gemini/agents/*.md` (ArcBridge roles as Gemini subagents with per-tool access control and model preferences).
- **Shared skills** — `.agents/skills/` generated by both Codex and Gemini adapters (agentskills.io standard). Skills are only written if missing — existing content is preserved.
- **`--force` flag** — `arcbridge generate-configs --force` regenerates skills and other preserved files, useful after ArcBridge template updates.
- **README early access badge** — repo prepared for public visibility with early access notice and npm/license badges.

### Improvements

- **CLI help updated** — lists all 5 templates (including `unity-game`) and all 4 platforms (`claude`, `copilot`, `codex`, `gemini`)
- **Gemini agent tool access** — per-tool `mcp_*_<tool>` wildcards instead of blanket access, respecting `read_only` role constraints
- **YAML-safe frontmatter** — agent descriptions and model values are quoted when containing YAML-significant characters
- **Marker merge helper** — extracted `writeWithMarkerMerge()` for DRY styleguide/GEMINI.md generation
- **Platforms default aligned** — `generate-configs` falls back to `["claude"]` matching the schema default

### Stats

- 34 MCP tools, 426 tests passing, 0 lint errors, 0 type errors
- 4 platform adapters: Claude Code, GitHub Copilot, Codex CLI, Gemini

## 0.3.1 (2026-04-05)

### New Features

- **Extensible quality categories** — quality categories are no longer restricted to a hardcoded 5-item enum. Any lowercase kebab-case string is now accepted, enabling ISO 25010 categories (`usability`, `portability`, `compatibility`) and custom ones (`data-integrity`, `compliance`, `auditability`) without schema changes.

### Refactoring

- **Shared DB row types** — extracted `PhaseRow`, `TaskRow`, `BlockRow`, `ScenarioRow`, `AdrRow`, `SymbolRow`, `CountRow` into `packages/mcp-server/src/db-types.ts`. Updated 20 tool files, eliminating 250+ lines of duplicated interface declarations.
- **YAML reader helpers** — extracted `readTaskFile()` and `readPhasesFile()` in `yaml-writer.ts`, eliminating 6x duplication of the read-parse-validate pattern. Helpers return discriminated errors (`"not-found"` vs `"invalid"`) to preserve specific warning messages.

### Docs

- README arc42 directory listing now includes all sections (02-constraints, 04-solution-strategy, 08-crosscutting)

### Stats

- 34 MCP tools, 409 tests passing, 0 lint errors, 0 type errors

## 0.3.0 (2026-04-01)

### New Features

- **Codex CLI adapter** — ArcBridge now supports OpenAI Codex CLI as a target platform. Generates `AGENTS.md` (project instructions with workflow, tool references, MCP setup) and two reusable skills (`.agents/skills/arcbridge-sync/`, `.agents/skills/arcbridge-review/`). Pass `platforms: ["codex"]` during init.
- **`arcbridge_update_arc42_section`** (34 tools total) — read or update any arc42 markdown section. Frontmatter is preserved automatically. Covers introduction, constraints, context, solution strategy, runtime views, deployment, crosscutting concepts, and risks/debt.
- **Arc42 sections 02 + 04** — init now generates all standard arc42 sections including `02-constraints.md` (Architecture Constraints) and `04-solution-strategy.md` (Solution Strategy).

### Improvements

- **Phase 0 starts as `planned`** — all phases now generate with status `planned`. Agents tailor building blocks, scenarios, and tasks first, then explicitly start Phase 0. Aligns with the "TAILOR FIRST, BUILD SECOND" workflow.
- **`get_current_tasks` fallback** — when no phase is in-progress, falls back to the first `planned` phase instead of returning an error. Works immediately after init.
- **Dynamic role table in AGENTS.md** — generated from actual AgentRole[] instead of hardcoded, includes ux-reviewer when applicable.
- **Codex adapter merge safety** — AGENTS.md uses marker-based merge to preserve user content, role table appended with fallback if placeholder is removed.

### Fixes

- **Non-throwing frontmatter parser** — `splitFrontmatter` returns gracefully on unterminated frontmatter instead of crashing tool handlers.
- **No unnecessary DB refresh** — `update_arc42_section` skips `refreshFromDocs` since plain markdown sections aren't indexed.
- **No duplicate headings** — read mode skips prepending heading when section body already starts with one.

### Stats

- 34 MCP tools, 406 tests passing, 0 lint errors, 0 type errors
- 3 platform adapters: Claude Code, GitHub Copilot, Codex CLI

## 0.2.1 (2026-03-31)

### New Features

- **`arcbridge_delete_phase`** (33 MCP tools) — delete a phase and all its tasks permanently. Guards against deleting in-progress or complete phases.
- **Batch task deletion** — `arcbridge_delete_task` now accepts `task_ids` array for deleting multiple tasks in one call. Single `task_id` still supported for backward compatibility.
- **Post-init tailoring guidance** — architect role now includes a "Post-Init Tailoring" section explaining how to customize building blocks, quality scenarios, and phase tasks before writing code. Init output changed from "PLAN FIRST" to "TAILOR FIRST" with specific editing instructions and file paths.
- **Building block interfaces documentation** — architect role documents the `interfaces` field with a full schema example, explaining how drift detection uses it.

### Fixes

- **Phase status check** — `delete_phase` correctly checks for `"planned"` status (not `"done"` which doesn't exist in the schema)
- **YAML failure handling** — `delete_task` only reports a task as deleted when YAML write succeeds; parse failures go to warnings
- **TOCTOU fix** — `deletePhaseFromYaml` uses try/catch ENOENT instead of `existsSync` + `unlinkSync`
- **DB sync consistency** — `delete_task` now uses `refreshFromDocs` (single refresh after all YAML deletes) instead of per-task manual DB DELETE

### Stats

- 33 MCP tools, 389 tests passing, 0 lint errors, 0 type errors

## 0.2.0 (2026-03-30)

### New Features

- **Unity game project template** (`unity-game`) — 5th project template targeting code-heavy Unity C# game development. Reuses the existing C# tree-sitter indexer with Unity-specific templates, quality scenarios, and agent guidance.
  - 8 building blocks: game-core, input-system, player-systems, gameplay-systems, ui-framework, audio-system, data-layer, editor-tools
  - 8 Unity-specific quality scenarios: frame rate (60 FPS / 16.7ms budget), GC allocations, draw calls, memory budget, input latency, scene load time, accessibility, error handling (plus shared scenarios merged at init)
  - 4 phases: Project Setup, Core Systems, Gameplay Features, Polish & Launch
  - Unity-specific crosscutting concepts: scripting architecture, asset management, scene management, physics, input, audio, VFX, object pooling, save system
  - Auto-detection via `ProjectSettings/` + `Assets/` directories (before .sln check, since Unity auto-generates .sln files)
  - UX reviewer role included for game UI
  - ADR documents agent limitations and recommends [Unity-MCP](https://github.com/IvanMurzak/Unity-MCP) for editor access

### Improvements

- **Unity language detection** — `detectProjectLanguage()` recognizes Unity projects as C# before checking for tsconfig/package.json
- **C# indexer Unity ignores** — tree-sitter indexer skips Unity-managed directories (Library/, Temp/, Logs/, UserSettings/, Packages/, ProjectSettings/) anchored to root level to avoid false matches in non-Unity .NET projects
- **Unity test runner** — config template uses `unity -batchmode -runTests` instead of `dotnet test`

### Stats

- 32 MCP tools, 384 tests passing, 0 lint errors, 0 type errors

## 0.1.6 (2026-03-29)

### New Features

- **`arcbridge_create_phase`** (32 MCP tools) — add new phases to the project plan beyond the initial template. Supports explicit phase numbering or auto-assignment, with gate requirements.

### Fixes

- **Retry-safe phase creation** — YAML write happens first (source of truth), DB synced via `refreshFromDocs()` instead of manual INSERT. Retrying `create_phase` with the same inputs no longer risks YAML/DB inconsistency.
- **No orphan task files on conflict** — `addPhaseToYaml` checks for phase_number conflicts before writing the task file.
- **Correct phase number assignment** — DB is refreshed from YAML before computing the next phase number, preventing stale duplicates.

### Docs

- Fixed MCP tool count: 26 → 32
- Added UX Reviewer to agent roles (7 core + UX Reviewer for frontend templates)
- Updated test count: 371 → 377
- Added `create_phase` to project plan spec

### Stats

- 32 MCP tools, 377 tests passing, 0 lint errors, 0 type errors

## 0.1.5 (2026-03-28)

### New Features

- **`arcbridge_update_scenario_status`** (31 MCP tools) — manually update quality scenario status (passing/failing/partial) and link test files. Auto-upgrades verification from manual to semi-automatic when tests are linked.
- **CLAUDE.md merge** — `init_project` now preserves existing CLAUDE.md content, appending ArcBridge workflow section below a marker comment instead of overwriting.
- **Template-specific guidance** — `get_guidance` returns language-appropriate advice per project type: React/Next.js patterns for frontend, C#/ASP.NET patterns for dotnet, Node.js patterns for API services.
- **Git-scoped reviews** — `get_practice_review` and `run_role_check` now filter changed files to the project directory, fixing false positives in monorepo setups.

### Improvements

- **Spec parameter on init_project** — pass project requirements text directly, saved to `.arcbridge/spec.md`
- **Default quality priorities** include `maintainability` (MAINT-01/MAINT-02 scenarios now generated)
- **Dotnet code_paths** auto-detect `src/<ProjectName>/` convention from dotnetServices
- **Reindex output** clearly separates "Architecture Docs" (always refreshed) from "Code Symbols"
- **Validation errors** include field paths (`title: Required` instead of just `Required`)
- **Route analyzer** checks `src/app/` for Next.js projects (common convention)
- **.next/ excluded** from TypeScript indexer source files
- **Quality-guardian role** now has `update_scenario_status`, `verify_scenarios`, `run_role_check` tools

### Stats

- 31 MCP tools, 371 tests passing, 0 lint errors, 0 type errors

## 0.1.4 (2026-03-27)

### Fixes (from cross-team agent orchestrator test)

- **Init catch-22 resolved** — `init_project` no longer blocks when config.yaml exists but DB is missing. Partial inits auto-recover the database from existing config.
- **Vite+React indexer fixed** — handles tsconfig with `references` (standard Vite layout). Falls back to `tsconfig.app.json` when root tsconfig delegates via project references.
- **FK constraint on building block edits** — `refreshFromDocs` disables FK checks during repopulation and nullifies orphaned task→block references. Manual arc42 edits no longer corrupt the database.
- **Practice review works without git commits** — `getChangedFiles` now merges committed diffs AND uncommitted changes (staged + unstaged). Code review role is functional for in-progress work.
- **Git status path parsing fixed** — pre-existing bug where `.trim()` stripped leading space from porcelain status column, truncating filenames.

### Improvements

- **Phase IDs shown in tool output** — `get_phase_plan` and `create_task` now display phase IDs so agents can use them directly.
- **Tasks for Phase 2-3** — react-vite and nextjs templates now include example tasks for later phases. Phase 0-1 tasks are concrete; Phase 2+ are examples to replace with project-specific tasks.
- **Framework deps excluded from ADR warnings** — react, react-dom, next, vite, tailwindcss, express, etc. no longer trigger "undocumented dependency" drift.
- **Template-specific ADRs** — react-vite gets "Use React with Vite" ADR, api-service gets "Use Node.js API Service" ADR (previously all non-dotnet templates got "Use Next.js App Router").
- **Planning guidance in roles** — architect and phase-manager roles emphasize proper task planning across all phases before implementation.
- **Init output includes next steps** — guides agents to review phases, plan tasks, and activate architect role.
- **Template descriptions** — `init_project` template parameter now describes each template type.

### Stats

- 355 tests passing, 0 lint errors, 0 type errors

## 0.1.3 (2026-03-27)

### Breaking Changes

- **Minimum Node.js version is now 22.16** (was 20.0) — required for built-in `node:sqlite`

### Changes

- **Replaced `better-sqlite3` with Node.js built-in `node:sqlite`** — eliminates the last native C/C++ dependency. `npm install arcbridge` no longer requires a C compiler, Visual Studio Build Tools, or any build toolchain. Pure JavaScript + WASM.
- **Transaction helper** — `transaction(db, fn)` replaces `db.transaction(fn)()`. Supports nested transactions via SAVEPOINTs.
- **Undefined-to-null parameter conversion** — `node:sqlite` rejects `undefined` parameters (unlike `better-sqlite3`). Automatically patched in `db.prepare()`.

### Stats

- Zero native dependencies
- 351 tests passing, 0 lint errors, 0 type errors

## 0.1.2 (2026-03-25)

### New Features

- **Agent activity metrics** — 3 new MCP tools (29 total):
  - `record_activity` — log model, tokens, cost, duration, quality snapshot
  - `get_metrics` — query/aggregate by model, task, phase, tool, day
  - `export_metrics` — export to JSON, CSV, or Markdown for git commits
- **Auto-recording** — key tools (`update_task`, `complete_phase`, `reindex`, `check_drift`) auto-record activity when `metrics.auto_record: true` in config
- **`agent_activity` DB table** — schema version 2 with migration for existing installations

### Fixes

- **FK constraint errors in `refreshFromDocs`** — added missing `DELETE FROM contracts` and clear self-referencing `parent_id` before deleting building blocks
- **Misleading `reindex` tool description** — clarified that it syncs architecture docs AND code symbols (not just code)
- **CSV/Markdown export escaping** — properly handles pipe characters and newlines in table cells

### Stats

- 29 MCP tools, 346 tests passing, 0 lint errors, 0 type errors

## 0.1.1 (2026-03-24)

### Changes

- **Web-tree-sitter (WASM)** — replaced native tree-sitter C/C++ bindings with web-tree-sitter. No C compiler required for `npm install`. C# grammar vendored as WASM (5.7MB).
- **`indexProject()` is now async** — required by WASM parser init. All callers updated.
- **Roslyn global tool auto-detection** — `arcbridge-dotnet-indexer` global tool is detected on PATH and preferred over monorepo source. Use `ARCBRIDGE_PREFER_SOURCE=1` to force monorepo source.
- **NuGet publish workflow** — `dotnet tool install -g arcbridge-dotnet-indexer` publishes alongside npm on version tags. Version derived from git tag.
- **CI enabled** — workflow runs on push to main and PRs. .NET 8 SDK added for Roslyn tests.
- **Security fixes** — resolved `flatted` (high) and `hono` (moderate) vulnerabilities via pnpm overrides.
- **All lint and typecheck errors fixed** — 0 lint errors, 0 type errors, 325 tests passing.

## 0.1.0 (2026-03-24)

First release of ArcBridge — an MCP server and CLI that gives AI coding agents architectural awareness via arc42 documentation. Supports TypeScript/React/Next.js and .NET/C# projects.

### Packages

- `@arcbridge/core` — schemas, SQLite database, TypeScript + C# indexers, drift detection, generators, testing runner, role/config loaders
- `@arcbridge/adapters` — Claude Code and GitHub Copilot config generators
- `@arcbridge/mcp-server` — MCP server with 26 tools for architecture, planning, code intelligence, and sync
- `arcbridge` — CLI with `init`, `sync`, `status`, `drift`, `refresh`, `update-task`, and `generate-configs` commands
- `packages/dotnet-indexer` — .NET/Roslyn C# code indexer (separate .NET console app, requires .NET 8+ SDK)

### Core Features

- **26 MCP tools** covering lifecycle, architecture, planning, code intelligence, React/Next.js analysis, ASP.NET analysis, drift detection, and sync
- **Plan → Build → Sync → Review convention** — structured workflow for AI-assisted development with phase gates, quality checks, and architecture documentation
- **Arc42 documentation** — 9 sections generated and maintained (01 Introduction, 03 Context, 05 Building Blocks, 06 Runtime Views, 07 Deployment, 08 Crosscutting Concepts, 09 Decisions/ADRs, 10 Quality Scenarios, 11 Risks & Debt)

### Code Intelligence

- **TypeScript Compiler API indexer** — symbol extraction, dependency graphs, React component classification, Next.js route analysis, server/client boundary detection, incremental re-indexing via content hashing
- **C# Roslyn indexer** — symbol extraction (classes, interfaces, enums, methods, properties, fields, constants), dependency tracking (extends, implements, calls, uses_type), ASP.NET route detection (controllers + minimal APIs with MapGet/MapGroup/RequireAuthorization), incremental indexing, multi-project .sln support
- **Cross-language content hashing** — SHA-256 first 16 hex chars, verified identical between TypeScript and C# implementations
- **Package dependency tracking** — parses package.json (npm/npm-dev) and .csproj (NuGet PackageReference), stores in `package_dependencies` table

### Drift Detection

- 6 drift kinds: undocumented module, missing module, dependency violation, unlinked test, stale ADR, new dependency (package without ADR)
- .NET framework file ignores (Program.cs, bin/, obj/, Properties/, Migrations/)
- Intelligent package matching — partial name match (Serilog matches Serilog.Sinks.Console), trivial package skip list

### Agent Roles

- 8 roles: architect, implementer, security reviewer, quality guardian, phase manager, onboarding, code reviewer, **UX reviewer** (frontend only)
- **Template-conditional roles** — UX reviewer only generated for nextjs-app-router and react-vite templates
- **Architect role** includes full arc42 section reference table with update triggers, contract awareness (REST, events, gRPC)
- **Implementer role** includes architecture awareness guidance (consult building blocks, crosscutting concepts, runtime views)

### Project Templates

- 4 templates: **nextjs-app-router**, **react-vite**, **api-service**, **dotnet-webapi**
- **Template-aware quality scenarios** — shared scenarios (auth, input validation, API latency, error handling, circular deps, test coverage) plus template-specific ones:
  - Frontend: LCP, WCAG 2.1 AA, keyboard navigation
  - .NET: startup time, GC pressure, async-all-the-way, CORS, health checks, structured logging, DI validation
- **Template-aware building blocks** — smart directory detection (src/ vs root), template-specific entrypoints (layout.tsx for Next.js, main.tsx for Vite, index.ts for API)
- **API client block** for frontend templates with contract-aware acceptance criteria
- **Crosscutting concepts** (Section 08) with template-specific placeholder sections (error handling, auth, logging, validation, DI, API contract, events/messaging)

### Phase Templates

- 4 phases per template with gate requirements
- ADR documentation task in Phase 1 for all templates
- API documentation task for backend templates (OpenAPI as the contract)
- API client setup task for frontend templates (typed interfaces, error handling, contract approach)

### MCP Tool Enhancements

- `search_symbols`, `get_dependency_graph`, `get_route_map` — optional `service` filter for multi-project solutions
- `reindex` — `language` parameter (auto/typescript/csharp), auto-detection from project files
- `get_guidance` — surfaces relevant ADRs, arc42 section hints per action type (e.g., "adding-api-route" suggests updating 03-context.md)
- `complete_phase` — ADR reminder for architectural decisions, full arc42 documentation review checklist

### CLI

- `arcbridge refresh` command — rebuild database from YAML/markdown without full sync loop
- `arcbridge init` — auto-detects .NET projects (.csproj/.sln), multi-project solution discovery, template-conditional role generation
- All commands support `--json` for CI integration

### Developer Experience

- 292 tests passing
- End-to-end agent workflow tests for both TypeScript and C#
- Cross-language content hash verification test
- Shared `detect-layout.ts` helper for consistent path resolution across templates

### Known Limitations

- .NET indexer requires .NET 8+ SDK installed locally (not bundled with npm packages)
- DI container analysis, EF Core model extraction, and middleware pipeline ordering not yet implemented for .NET
- Contracts table exists in schema but is not yet populated or queried (designed for future cross-service contract tracking)
- CI workflow runs on push to main and PRs (Node 20 + 22, .NET 8 SDK)
- Monorepo support (single `.arcbridge/` for multiple services) not yet implemented — each service needs its own `.arcbridge/` directory
