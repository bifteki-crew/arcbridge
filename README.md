# ArcBridge

An MCP server that gives AI coding agents architectural awareness. It bridges arc42 documentation, structured planning, and code-level intelligence into a single queryable interface.

> **Early Access** — ArcBridge is under active development. The core features are stable and used in production, but APIs and templates may change between minor versions. We welcome feedback via [issues](https://github.com/bifteki-crew/arcbridge/issues).

[![npm version](https://img.shields.io/npm/v/@arcbridge/mcp-server)](https://www.npmjs.com/package/@arcbridge/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## The Problem

Your AI agent starts every coding session blind to your architecture. It sees the current file, maybe some imports — but it doesn't know which module it's in, what quality requirements apply, or whether the change it's about to make violates a boundary the team agreed on last week.

ArcBridge fixes this by giving the agent a structured mental model of your project: building blocks with declared boundaries, testable quality scenarios, phased task plans, and drift detection that catches when code and docs diverge.

## How It Works

ArcBridge follows a repeatable convention: **Plan → Build → Sync → Review**.

```
  ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌──────────┐
  │  PLAN   │ ───▸ │  BUILD  │ ───▸ │  SYNC   │ ───▸ │  REVIEW  │
  │         │      │         │      │         │      │          │
  │ Init    │      │ Code    │      │ Reindex │      │ Phase    │
  │ arc42   │      │ with    │      │ Detect  │      │ gates    │
  │ docs,   │      │ arch    │      │ drift   │      │ Quality  │
  │ phases, │      │ context │      │ Verify  │      │ checks   │
  │ quality │      │         │      │ quality │      │ Arc42    │
  │ goals   │      │         │      │         │      │ updates  │
  └─────────┘      └─────────┘      └─────────┘      └──────────┘
       ▲                                                    │
       └────────────────────────────────────────────────────┘
```

### Plan — define your architecture and goals

Run `arcbridge init` to scaffold a starting point tailored to your project type (Next.js, React, Angular, .NET, Unity, or API service). The generated building blocks, quality scenarios, and phase plans are **examples of the shape, not the plan to follow** — they show you the structure ArcBridge expects and give you something to iterate on immediately.

The real value comes when you bring in your own specification — whether that's an existing design doc, a product brief, or a conversation with the Architect agent — and use it to create building blocks, phases, and quality scenarios that match *your* system. ArcBridge provides the tools to do this:

- **Building blocks** — named architectural modules (e.g. `auth-module`, `api-layer`) with declared code paths and interfaces. These are the backbone of drift detection: if code imports across blocks without a declared interface, ArcBridge flags it.
- **Quality scenarios** — testable requirements like "all API routes require authentication" or "no circular dependencies between modules", each linked to a building block and a category (security, performance, accessibility, reliability, maintainability).
- **Phase plan** — phases with concrete tasks, each tied to building blocks and quality scenarios. You can create, reorder, and extend phases throughout the project's lifetime — not just at the start.
- **Agent roles** — 7 specialized roles (Architect, Implementer, Security Reviewer, Quality Guardian, Phase Manager, Onboarding, Code Reviewer) plus a UX Reviewer for frontend projects. Each role has a system prompt, curated tool access, and quality focus.

As the project grows, this architecture documentation grows with it. When you add a new feature, you plan it as a new phase with tasks, the Architect proposes building block and arc42 updates, and the code index expands — giving you a clear history of how the architecture evolved and why.

### Build — code with architectural context

During development, the AI agent has access to 34 MCP tools. Instead of working file-by-file, it knows:

- Which **building block** a file belongs to, and what quality scenarios apply
- What **tasks** are in the current phase and their acceptance criteria
- Which **ADRs** (Architecture Decision Records) are relevant to the code being changed
- What **patterns** are established (error handling, validation, logging) in crosscutting concerns

When you add a new API route, the agent can tell you: *"This route is in the api-layer block. Quality scenario SEC-01 requires auth on all routes — should I add the middleware?"*

### Sync — detect drift between docs and code

After a coding session (or in CI via `arcbridge sync`), the sync loop runs in seconds:

1. **Reindex** — scan source code for symbols, dependencies, components, routes
2. **Detect drift** — compare architecture docs against code reality:
   - *Undocumented module* — code exists but no building block claims it
   - *Missing module* — a building block's code path is empty
   - *Dependency violation* — cross-block import without a declared interface (this blocks phase completion)
   - *Unlinked test* — a quality scenario points to a test file that doesn't exist
   - *Stale ADR* — a decision references deleted files
   - *New dependency* — a package was added without an ADR
3. **Verify quality** — run tests linked to quality scenarios and update pass/fail status
4. **Infer progress** — mark tasks as done when their acceptance criteria are met

### Review — enforce quality at phase boundaries

When you're ready to move to the next phase, the Phase Manager checks gates:

- All tasks in the current phase must be done
- No drift errors (warnings are OK, dependency violations are not)
- Quality scenarios linked to the phase must have passing tests

If gates pass, the Architect proposes arc42 updates based on what changed. You review them in seconds instead of writing docs from scratch. If gates fail, you get specific blockers — not vague warnings.

## What Gets Created

When you run `arcbridge init`, it generates:

```
.arcbridge/
├── config.yaml                    # Project configuration
├── index.db                       # SQLite database (queryable via MCP)
├── arc42/
│   ├── 01-introduction.md         # Goals and stakeholders
│   ├── 02-constraints.md          # Technical, organizational, legal constraints
│   ├── 03-context.md              # System scope
│   ├── 04-solution-strategy.md    # Technology decisions and architecture approach
│   ├── 05-building-blocks.md      # Architecture decomposition
│   ├── 06-runtime-views.md        # Key scenarios
│   ├── 07-deployment.md           # Infrastructure
│   ├── 08-crosscutting.md         # Patterns and conventions
│   ├── 09-decisions/              # ADRs (one per file)
│   ├── 10-quality-scenarios.yaml  # Testable quality requirements
│   └── 11-risks-debt.md           # Risks and tech debt
├── plan/
│   ├── phases.yaml                # Phase plan
│   ├── tasks/                     # Task files per phase
│   └── sync-log.md                # Architecture sync events
└── agents/
    ├── architect.md               # Canonical agent role definitions
    ├── implementer.md
    ├── security-reviewer.md
    ├── quality-guardian.md
    ├── phase-manager.md
    ├── onboarding.md
    ├── code-reviewer.md
    └── ux-reviewer.md             # Only for UI templates (nextjs-app-router, react-vite)
```

Plus platform-specific configs:
- **Claude Code:** `CLAUDE.md`, `.claude/agents/`, `.mcp.json`
- **GitHub Copilot:** `.github/copilot-instructions.md`, `.github/agents/`
- **Codex CLI:** `AGENTS.md`, `.agents/skills/`
- **Gemini:** `.gemini/settings.json`, `.gemini/styleguide.md`, `.gemini/agents/`, `GEMINI.md`, `.agents/skills/`
- **OpenCode:** `opencode.json`, `OPENCODE.md`, `.opencode/agents/`, `.opencode/skills/`

## Quick Start

```bash
npm install -g arcbridge        # Install the CLI
cd your-project
arcbridge init                   # Initialize ArcBridge (auto-detects project type)
```

Then connect the MCP server to your AI agent:

**Claude Code** — create `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "arcbridge": {
      "command": "npx",
      "args": ["@arcbridge/mcp-server"]
    }
  }
}
```

**Codex CLI** — add to `~/.codex/config.toml`:

```toml
[mcp_servers.arcbridge]
command = "npx"
args = ["-y", "@arcbridge/mcp-server"]
```

**Gemini** — runs automatically when `--platform gemini` is passed during init. Creates `.gemini/settings.json` with MCP config, `.gemini/styleguide.md` for project instructions, and `.gemini/agents/` for role-based subagents.

**OpenCode** — runs automatically when `--platform opencode` is passed during init. Creates `opencode.json` with MCP config, `OPENCODE.md` for project instructions, and `.opencode/agents/` for role-based subagents.

Restart your AI agent — approve the MCP server when prompted, and all 34 architecture tools become available.

When running `arcbridge init`, use `--platform` to generate platform-specific instruction and configuration files for your selected AI agent(s). Multiple platforms can be combined (e.g., `--platform claude --platform codex`).

See the [walkthrough](docs/walkthrough.md) for a full step-by-step guide.

## Project Templates

ArcBridge auto-detects your project type and tailors the scaffolded architecture, building blocks, quality scenarios, and phase plans accordingly.

| Template | Building Blocks | Quality Scenarios | Detected By |
|----------|----------------|-------------------|-------------|
| **Next.js App Router** | auth, public-pages, api-layer, data-layer | 12-15 (incl. server/client boundary checks) | `next.config.*` |
| **React + Vite** | ui-shell, feature-modules, api-client, state-management | 12-15 (incl. bundle size, accessibility) | `vite.config.*` + React |
| **Angular** | app-shell, feature-modules, shared-lib, api-services | 12-15 (incl. change detection, lazy loading) | `angular.json` |
| **API Service** | api-gateway, business-logic, data-access, integration | 10-12 (incl. latency, auth, rate limiting) | Express/Fastify/Hono |
| **.NET Web API** | controllers, services, data-access, middleware | 10-12 (incl. DI, EF Core, middleware ordering) | `*.csproj` + ASP.NET |
| **Unity Game** | game-core, player-systems, ui-system, scene-management | 10-12 (incl. frame budget, memory, input) | `ProjectSettings/` |

## Language Support

ArcBridge indexes code symbols and dependencies to power `search_symbols`, `get_symbol`, and `get_dependency_graph`. Language is auto-detected from project files.

| Language | Status | Detection | Symbols | Dependencies |
|----------|--------|-----------|---------|--------------|
| **TypeScript** | Stable | `tsconfig.json` | Full (TS compiler API) | imports, calls, extends, implements, type usage, JSX renders, context |
| **C#/.NET** | Stable | `.csproj` / `.sln` / Unity markers | Full (Roslyn or tree-sitter) | imports, calls, extends, implements, type usage |
| **Python** | Experimental | `pyproject.toml` / `requirements.txt` / `setup.py` | Functions, classes, methods, async, constants, docstrings | calls, extends, type usage |
| **Go** | Experimental | `go.mod` | Functions, structs, interfaces, methods, constants, doc comments | calls, struct/interface embedding, type usage |

> **Experimental** means the indexer works and is tested, but has not been validated on a wide range of real-world projects. No project templates or route analysis for Python/Go yet — use `arcbridge init` with an existing template and customize, or set up `.arcbridge/` manually.

## Agent Roles

ArcBridge ships with 7 core roles plus a UX Reviewer for frontend templates. Each role specializes AI behavior with a system prompt, tool access constraints, and quality focus areas. Platform adapters translate these into Claude Code agents, Copilot agents, Codex skills, or Gemini subagents.

| Role | Purpose | When It Runs |
|------|---------|--------------|
| **Architect** | Design decisions, building block decomposition, ADR creation | Phase gates |
| **Implementer** | Feature development within established architecture | Phase gates |
| **Security Reviewer** | OWASP checks, auth, secrets, boundaries | Phase gates |
| **Quality Guardian** | Performance, accessibility, coverage, circular deps | Phase gates |
| **Phase Manager** | Task progress, phase gate enforcement, sync triggers | Phase gates |
| **Onboarding** | Explains the project to new or returning developers | On-demand |
| **Code Reviewer** | Logic bugs, edge cases, pattern violations, simplicity | On-demand |
| **UX Reviewer** | Usability, accessibility, design consistency (frontend only) | On-demand |

The first 5 roles participate in the automatic Plan → Build → Sync → Review loop. Onboarding, Code Reviewer, and UX Reviewer are opt-in — invoke them when you want a second pair of eyes.

Roles are loaded from `.arcbridge/agents/*.md` files. Edit the markdown frontmatter to customize tools, quality focus, and model preferences per role.

## MCP Tools (34)

### Lifecycle

| Tool | Description |
|------|-------------|
| `arcbridge_init_project` | Initialize ArcBridge in a project directory |
| `arcbridge_get_project_status` | Current phase, task completion, quality summary |

### Architecture

| Tool | Description |
|------|-------------|
| `arcbridge_get_building_blocks` | All blocks with code paths and quality links |
| `arcbridge_get_building_block` | Deep dive: one block with ADRs, tasks, scenarios |
| `arcbridge_get_quality_scenarios` | Quality requirements, filterable by category/status |
| `arcbridge_get_relevant_adrs` | ADRs for a file path or building block |

### Planning

| Tool | Description |
|------|-------------|
| `arcbridge_get_phase_plan` | Phase plan with tasks — filterable by phase_id, status, include_completed |
| `arcbridge_get_current_tasks` | Tasks for the current or a specific phase (via phase_id) |
| `arcbridge_update_task` | Mark tasks in-progress, done, or blocked |
| `arcbridge_create_task` | Add a task to any phase |
| `arcbridge_delete_task` | Remove one or more tasks permanently (batch via task_ids array) |
| `arcbridge_create_phase` | Add a new phase to the project plan |
| `arcbridge_delete_phase` | Remove a phase and all its tasks permanently |

### Code Intelligence

| Tool | Description |
|------|-------------|
| `arcbridge_reindex` | Index/re-index code symbols — TypeScript, C#, Python (experimental), Go (experimental) |
| `arcbridge_search_symbols` | Search symbols by name, kind, file path, or building block |
| `arcbridge_get_symbol` | Full symbol detail: signature, source code, relationships |
| `arcbridge_get_dependency_graph` | Import/dependency graph for a module |

### React & Next.js

| Tool | Description |
|------|-------------|
| `arcbridge_get_component_graph` | Component hierarchy with props, state, and context flow |
| `arcbridge_get_route_map` | Next.js App Router routes with layouts, middleware, auth |
| `arcbridge_get_boundary_analysis` | Server/client boundary analysis and potential leaks |

### Architecture Bridge

| Tool | Description |
|------|-------------|
| `arcbridge_check_drift` | Detect drift between architecture docs and code |
| `arcbridge_get_guidance` | Context-aware guidance for a file path or building block |
| `arcbridge_get_open_questions` | Unresolved architectural questions and risks |
| `arcbridge_propose_arc42_update` | Generate arc42 update proposals from recent code changes |
| `arcbridge_get_practice_review` | 5-dimension review: architecture, security, testing, docs, complexity |
| `arcbridge_update_arc42_section` | Read or update any arc42 markdown section (frontmatter preserved) |

### Roles & Sync

| Tool | Description |
|------|-------------|
| `arcbridge_complete_phase` | Validate phase gates (tasks, drift, quality) and transition |
| `arcbridge_activate_role` | Load agent role with tools, quality focus, and pre-loaded context |
| `arcbridge_verify_scenarios` | Run linked tests for quality scenarios and update pass/fail status |
| `arcbridge_update_scenario_status` | Manually update scenario status and link test files |
| `arcbridge_run_role_check` | Run a role's quality checks against a file or building block |

### Metrics

| Tool | Description |
|------|-------------|
| `arcbridge_record_activity` | Record agent activity — model, tokens, cost, duration, quality snapshot |
| `arcbridge_get_metrics` | Query and aggregate activity by model, task, phase, tool, or day |
| `arcbridge_export_metrics` | Export metrics to JSON, CSV, or Markdown for git commits |

## CLI

The `arcbridge` CLI enables CI integration and command-line workflows.

```bash
arcbridge init                  # Initialize ArcBridge (auto-detects project type)
arcbridge sync                  # Reindex, detect drift, infer tasks, update sync point
arcbridge status                # Show project status
arcbridge drift                 # Check for architecture drift

arcbridge sync --json           # JSON output for CI pipelines
arcbridge status --dir /path/to/project
```

The `sync` command runs the full sync loop: reindex symbols, detect drift, infer task statuses, and store a git sync point. The generated GitHub Action workflow (`.github/workflows/arcbridge-sync.yml`) uses this command automatically.

## Development

### Prerequisites

- Node.js 22.16+
- pnpm 9+

### Build from source

```bash
pnpm install
pnpm build
```

For local development, point your MCP config at the built output:

```json
{
  "mcpServers": {
    "arcbridge": {
      "command": "node",
      "args": ["/path/to/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Commands

```bash
pnpm check      # typecheck + lint + test
pnpm test        # vitest
pnpm lint        # eslint
pnpm typecheck   # tsc --noEmit
pnpm build       # tsup (all packages)
```

### Package Structure

```
packages/
├── core/        # Schemas, DB, templates, generators, indexer, drift, git, sync (no MCP dependency)
├── adapters/    # Claude + Copilot + Codex + Gemini + OpenCode config generators
├── cli/         # CLI binary (arcbridge init, sync, status, drift)
└── mcp-server/  # MCP server with tool registration
```

## Roadmap

- **Phase 0** (done): Scaffolding, schemas, templates, generators — 10 MCP tools
- **Phase 1** (done): TypeScript Compiler API — symbol extraction, dependency graphs — 14 MCP tools
- **Phase 2** (done): React & Next.js — component graphs, route maps, server/client boundaries — 17 MCP tools
- **Phase 3** (done): Architecture bridge — drift detection, guidance, open questions — 20 MCP tools
- **Phase 3.5** (done): Git integration — arc42 update proposals, practice reviews — 22 MCP tools
- **Phase 4** (done): Planning & sync loop — phase gates, role activation, task inference, sync triggers — 24 MCP tools
- **Phase 5** (done): Polish & hardening — roles loaded from files, CLI binary with sync/status/drift commands, test runner integration (`verify_scenarios`), 3 project templates (nextjs-app-router, react-vite, api-service) — 25 MCP tools
- **Phase 5.5** (done): Release prep — `arcbridge init` CLI command, walkthrough docs, CI workflows, npm publish setup — 32 MCP tools
- **v0.2.x** (done): Unity game template, `create_phase`/`delete_phase` tools, batch task deletion, post-init tailoring guidance — 33 MCP tools, 5 project templates
- **v0.3.x** (done): Codex + Gemini adapters, `update_arc42_section` tool, arc42 sections 02+04, extensible quality categories, phase filtering, react-vite component graph fix, shared skills, `--force` flag — 34 MCP tools, 4 platform adapters
- **v0.4.x** (done): Angular template, Angular `@Component` detection in indexer, dependency updates (all security vulnerabilities resolved), OpenCode platform adapter, README restructure — 6 project templates, 5 platform adapters, 457 tests
- **v0.5.0** (done): Python and Go indexer support (experimental) via tree-sitter WASM, Windows MCP config support, language-scoped incremental indexing, init resilience improvements — 510 tests

See [`docs/arcbridge-project-plan.md`](docs/arcbridge-project-plan.md) for the full specification and [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## License

[MIT](LICENSE)
