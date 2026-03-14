# ArchLens

An MCP server that gives AI coding agents architectural awareness. It bridges arc42 documentation, structured planning, and code-level intelligence into a single queryable interface.

## Why

The biggest waste in AI-assisted development isn't token cost — it's the agent lacking *intent* about the system architecture and the developer lacking *visibility* into how architectural decisions accumulate. ArchLens fixes both by:

- Making architecture, quality scenarios, and phase plans queryable via MCP tools
- Defining a repeatable convention: **Plan → Build → Sync → Review**
- Surfacing the right architectural context at the right time

## What It Does

When you run `archlens_init_project`, it creates:

```
.archlens/
├── config.yaml                    # Project configuration
├── index.db                       # SQLite database (queryable via MCP)
├── arc42/
│   ├── 01-introduction.md         # Goals and stakeholders
│   ├── 03-context.md              # System scope
│   ├── 05-building-blocks.md      # Architecture decomposition
│   ├── 06-runtime-views.md        # Key scenarios
│   ├── 07-deployment.md           # Infrastructure
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
    └── code-reviewer.md
```

Plus platform-specific configs (`CLAUDE.md`, `.claude/agents/`, `.github/copilot-instructions.md`, `.github/agents/`).

## Setup

### Prerequisites

- Node.js 20+
- pnpm 9+

### Build

```bash
pnpm install
pnpm build
```

### Connect to Claude Code

Add to your Claude Code MCP config (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "archlens": {
      "command": "node",
      "args": ["/path/to/project-archlens/packages/mcp-server/dist/index.js"]
    }
  }
}
```

## MCP Tools (25)

### Lifecycle

| Tool | Description |
|------|-------------|
| `archlens_init_project` | Initialize ArchLens in a project directory |
| `archlens_get_project_status` | Current phase, task completion, quality summary |

### Architecture

| Tool | Description |
|------|-------------|
| `archlens_get_building_blocks` | All blocks with code paths and quality links |
| `archlens_get_building_block` | Deep dive: one block with ADRs, tasks, scenarios |
| `archlens_get_quality_scenarios` | Quality requirements, filterable by category/status |
| `archlens_get_relevant_adrs` | ADRs for a file path or building block |

### Planning

| Tool | Description |
|------|-------------|
| `archlens_get_phase_plan` | All phases with tasks and acceptance criteria |
| `archlens_get_current_tasks` | Tasks for the active phase |
| `archlens_update_task` | Mark tasks in-progress, done, or blocked |
| `archlens_create_task` | Add a task to any phase |

### Code Intelligence

| Tool | Description |
|------|-------------|
| `archlens_reindex` | Index/re-index TypeScript symbols (incremental) |
| `archlens_search_symbols` | Search symbols by name, kind, file path, or building block |
| `archlens_get_symbol` | Full symbol detail: signature, source code, relationships |
| `archlens_get_dependency_graph` | Import/dependency graph for a module |

### React & Next.js

| Tool | Description |
|------|-------------|
| `archlens_get_component_graph` | Component hierarchy with props, state, and context flow |
| `archlens_get_route_map` | Next.js App Router routes with layouts, middleware, auth |
| `archlens_get_boundary_analysis` | Server/client boundary analysis and potential leaks |

### Architecture Bridge

| Tool | Description |
|------|-------------|
| `archlens_check_drift` | Detect drift between architecture docs and code |
| `archlens_get_guidance` | Context-aware guidance for a file path or building block |
| `archlens_get_open_questions` | Unresolved architectural questions and risks |
| `archlens_propose_arc42_update` | Generate arc42 update proposals from recent code changes |
| `archlens_get_practice_review` | 5-dimension review: architecture, security, testing, docs, complexity |

### Roles & Sync

| Tool | Description |
|------|-------------|
| `archlens_complete_phase` | Validate phase gates (tasks, drift, quality) and transition |
| `archlens_activate_role` | Load agent role with tools, quality focus, and pre-loaded context |
| `archlens_verify_scenarios` | Run linked tests for quality scenarios and update pass/fail status |

## Agent Roles

ArchLens ships with 7 predefined agent roles that specialize AI behavior for different tasks. Each role has a system prompt, tool access constraints, and quality focus areas. Platform adapters translate these canonical definitions into Claude Code agents (`.claude/agents/`) and Copilot agents (`.github/agents/`).

| Role | Purpose | Automatic? |
|------|---------|------------|
| **Architect** | Design decisions, building block decomposition, ADR creation | Phase gates |
| **Implementer** | Feature development within established architecture | Phase gates |
| **Security Reviewer** | Security posture checks (OWASP, auth, secrets, boundaries) | Phase gates |
| **Quality Guardian** | Enforces quality scenarios — performance, accessibility, coverage | Phase gates |
| **Phase Manager** | Tracks progress, manages task transitions, triggers arc42 sync | Phase gates |
| **Onboarding** | Explains the project to new team members or returning developers | On-demand |
| **Code Reviewer** | Reviews code for correctness, patterns, edge cases, simplicity | On-demand |

The first 5 roles participate in the automatic Plan → Build → Sync → Review loop. The **Onboarding** and **Code Reviewer** roles are opt-in — invoke them when you want a second pair of eyes or need to get up to speed.

The Code Reviewer focuses on what a senior developer would catch in a pull request: logic bugs, unhandled edge cases, pattern violations, and over-engineering. It deliberately does not overlap with the Security Reviewer (OWASP, auth, secrets) or the Quality Guardian (metrics, coverage, accessibility).

Roles are loaded from `.archlens/agents/*.md` files when available, falling back to built-in defaults. Edit the markdown frontmatter to customize tools, quality focus, and model preferences per role.

## CLI

The `archlens` CLI enables CI integration and command-line workflows.

```bash
archlens sync              # Reindex, detect drift, infer tasks, update sync point
archlens status            # Show project status
archlens drift             # Check for architecture drift

archlens sync --json       # JSON output for CI pipelines
archlens status --dir /path/to/project
```

The `sync` command runs the full sync loop: reindex TypeScript symbols, detect drift, infer task statuses, and store a git sync point. The generated GitHub Action workflow (`.github/workflows/archlens-sync.yml`) uses this command automatically.

## Development

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
├── cli/         # CLI binary (archlens sync, status, drift)
└── mcp-server/  # MCP server with tool registration
```

## Roadmap

- **Phase 0** (done): Scaffolding, schemas, templates, generators — 10 MCP tools
- **Phase 1** (done): TypeScript Compiler API — symbol extraction, dependency graphs — 14 MCP tools
- **Phase 2** (done): React & Next.js — component graphs, route maps, server/client boundaries — 17 MCP tools
- **Phase 3** (done): Architecture bridge — drift detection, guidance, open questions — 20 MCP tools
- **Phase 3.5** (done): Git integration — arc42 update proposals, practice reviews — 22 MCP tools
- **Phase 4** (done): Planning & sync loop — phase gates, role activation, task inference, sync triggers — 24 MCP tools, 171 tests
- **Phase 5** (done): Polish & hardening — roles loaded from files, CLI binary with sync/status/drift commands, test runner integration (`verify_scenarios`), 3 project templates (nextjs-app-router, react-vite, api-service) — 25 MCP tools, 191 tests
- **Phase 5.5** (done): Release prep — `archlens init` CLI command, walkthrough docs, CI workflows, npm publish setup — 26 MCP tools, 194 tests

See [`docs/archlens-project-plan.md`](docs/archlens-project-plan.md) for the full specification.

## License

[MIT](LICENSE)
