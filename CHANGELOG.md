# Changelog

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
