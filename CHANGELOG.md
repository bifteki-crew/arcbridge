# Changelog

## 0.1.1

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

- 325 tests passing
- End-to-end agent workflow tests for both TypeScript and C#
- Cross-language content hash verification test
- Shared `detect-layout.ts` helper for consistent path resolution across templates

### Known Limitations

- .NET indexer requires .NET 8+ SDK installed locally (not bundled with npm packages)
- DI container analysis, EF Core model extraction, and middleware pipeline ordering not yet implemented for .NET
- Contracts table exists in schema but is not yet populated or queried (designed for future cross-service contract tracking)
- CI workflow runs on push to main and PRs (Node 20 + 22, .NET 8 SDK)
- Monorepo support (single `.arcbridge/` for multiple services) not yet implemented — each service needs its own `.arcbridge/` directory
