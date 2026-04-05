# ArcBridge

An MCP server that gives AI coding agents architectural awareness. It bridges arc42 documentation, structured planning, and code-level intelligence into a single queryable interface.

> **Early Access** — ArcBridge is under active development. The core features are stable and used in production, but APIs and templates may change between minor versions. We welcome feedback via [issues](https://github.com/bifteki-crew/arcbridge/issues).

[![npm version](https://img.shields.io/npm/v/@arcbridge/mcp-server)](https://www.npmjs.com/package/@arcbridge/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Why

The biggest waste in AI-assisted development isn't token cost — it's the agent lacking *intent* about the system architecture and the developer lacking *visibility* into how architectural decisions accumulate. ArcBridge fixes both by:

- Making architecture, quality scenarios, and phase plans queryable via MCP tools
- Defining a repeatable convention: **Plan → Build → Sync → Review**
- Surfacing the right architectural context at the right time

## What It Does

When you run `arcbridge_init_project`, it creates:

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

Restart your AI agent — approve the MCP server when prompted, and all 34 architecture tools become available.

When running `arcbridge init`, pass `platforms: ["claude"]`, `["codex"]`, or `["claude", "codex"]` to generate the appropriate project instruction files (`CLAUDE.md`, `AGENTS.md`).

See the [walkthrough](docs/walkthrough.md) for a full step-by-step guide.

## Development

### Prerequisites

- Node.js 20+
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
| `arcbridge_get_phase_plan` | All phases with tasks and acceptance criteria |
| `arcbridge_get_current_tasks` | Tasks for the active phase |
| `arcbridge_update_task` | Mark tasks in-progress, done, or blocked |
| `arcbridge_create_task` | Add a task to any phase |
| `arcbridge_delete_task` | Remove one or more tasks permanently (batch via task_ids array) |
| `arcbridge_create_phase` | Add a new phase to the project plan |
| `arcbridge_delete_phase` | Remove a phase and all its tasks permanently |

### Code Intelligence

| Tool | Description |
|------|-------------|
| `arcbridge_reindex` | Index/re-index TypeScript symbols (incremental) |
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

## Agent Roles

ArcBridge ships with 7 core agent roles plus a UX Reviewer for frontend templates, each specializing AI behavior for different tasks. Each role has a system prompt, tool access constraints, and quality focus areas. Platform adapters translate these canonical definitions into Claude Code agents (`.claude/agents/`) and Copilot agents (`.github/agents/`).

| Role | Purpose | Automatic? |
|------|---------|------------|
| **Architect** | Design decisions, building block decomposition, ADR creation | Phase gates |
| **Implementer** | Feature development within established architecture | Phase gates |
| **Security Reviewer** | Security posture checks (OWASP, auth, secrets, boundaries) | Phase gates |
| **Quality Guardian** | Enforces quality scenarios — performance, accessibility, coverage | Phase gates |
| **Phase Manager** | Tracks progress, manages task transitions, triggers arc42 sync | Phase gates |
| **Onboarding** | Explains the project to new team members or returning developers | On-demand |
| **Code Reviewer** | Reviews code for correctness, patterns, edge cases, simplicity | On-demand |
| **UX Reviewer** | Reviews frontend code for usability, accessibility, and design consistency | On-demand |

The first 5 roles participate in the automatic Plan → Build → Sync → Review loop. The **Onboarding**, **Code Reviewer**, and **UX Reviewer** roles are opt-in — invoke them when you want a second pair of eyes or need to get up to speed.

The Code Reviewer focuses on what a senior developer would catch in a pull request: logic bugs, unhandled edge cases, pattern violations, and over-engineering. It deliberately does not overlap with the Security Reviewer (OWASP, auth, secrets) or the Quality Guardian (metrics, coverage, accessibility).

Roles are loaded from `.arcbridge/agents/*.md` files when available, falling back to built-in defaults. Edit the markdown frontmatter to customize tools, quality focus, and model preferences per role.

## CLI

The `arcbridge` CLI enables CI integration and command-line workflows.

```bash
arcbridge sync              # Reindex, detect drift, infer tasks, update sync point
arcbridge status            # Show project status
arcbridge drift             # Check for architecture drift

arcbridge sync --json       # JSON output for CI pipelines
arcbridge status --dir /path/to/project
```

The `sync` command runs the full sync loop: reindex TypeScript symbols, detect drift, infer task statuses, and store a git sync point. The generated GitHub Action workflow (`.github/workflows/arcbridge-sync.yml`) uses this command automatically.

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
├── adapters/    # Claude + Copilot config generators
├── cli/         # CLI binary (arcbridge sync, status, drift)
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
- **Phase 5.5** (done): Release prep — `arcbridge init` CLI command, walkthrough docs, CI workflows, npm publish setup — 32 MCP tools, 377 tests

See [`docs/arcbridge-project-plan.md`](docs/arcbridge-project-plan.md) for the full specification.

## License

[MIT](LICENSE)
