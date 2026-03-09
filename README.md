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
    └── onboarding.md
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
- **Phase 1** (next): TypeScript Compiler API code intelligence — symbol indexing, dependency graphs
- **Phase 2**: React + Next.js analysis — component graphs, route maps, server/client boundaries
- **Phase 3**: Architecture bridge — drift detection, auto-sync proposals

See [`docs/archlens-project-plan.md`](docs/archlens-project-plan.md) for the full specification.

## License

TBD
