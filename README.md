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

## MCP Tools

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
├── core/        # Schemas, DB, templates, generators (no MCP dependency)
├── adapters/    # Claude + Copilot config generators
└── mcp-server/  # MCP server with tool registration
```

## Roadmap

- **Phase 0** (done): Scaffolding, schemas, templates, generators, 10 MCP tools
- **Phase 1a** (done): TypeScript Compiler API — symbol extraction, search, 14 MCP tools
- **Phase 1b** (next): Dependency extraction — imports, calls, extends, implements, type usage
- **Phase 2**: React + Next.js analysis — component graphs, route maps, server/client boundaries
- **Phase 3**: Architecture bridge — drift detection, auto-sync proposals

See [`docs/archlens-project-plan.md`](docs/archlens-project-plan.md) for the full specification.

## License

TBD
