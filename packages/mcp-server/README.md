# @arcbridge/mcp-server

MCP server for ArcBridge — exposes 33 architecture tools to AI coding agents via the [Model Context Protocol](https://modelcontextprotocol.io).

## Install

```bash
npm install -g @arcbridge/mcp-server
```

## Setup

**Claude Code** — add to your project's `.mcp.json`:

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

Restart your AI agent and approve the MCP server when prompted.

## Tools

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
| `arcbridge_update_task` | Mark tasks in-progress, done, blocked, or cancelled |
| `arcbridge_create_task` | Add a task to any phase |
| `arcbridge_delete_task` | Remove one or more tasks permanently (batch via task_ids array) |
| `arcbridge_create_phase` | Add a new phase to the project plan |
| `arcbridge_delete_phase` | Remove a phase and all its tasks permanently |

### Code Intelligence

| Tool | Description |
|------|-------------|
| `arcbridge_reindex` | Index/re-index TypeScript symbols (incremental) |
| `arcbridge_search_symbols` | Search by name, kind, file path, or building block |
| `arcbridge_get_symbol` | Full detail: signature, source, relationships |
| `arcbridge_get_dependency_graph` | Import/dependency graph for a module |

### React & Next.js

| Tool | Description |
|------|-------------|
| `arcbridge_get_component_graph` | Component hierarchy with props, state, context flow |
| `arcbridge_get_route_map` | Next.js App Router routes with layouts and middleware |
| `arcbridge_get_boundary_analysis` | Server/client boundary analysis |

### Architecture Bridge

| Tool | Description |
|------|-------------|
| `arcbridge_check_drift` | Detect drift between docs and code |
| `arcbridge_get_guidance` | Context-aware guidance for a file or block |
| `arcbridge_get_open_questions` | Unresolved architectural questions and risks |
| `arcbridge_propose_arc42_update` | Generate arc42 update proposals from code changes |
| `arcbridge_get_practice_review` | 5-dimension review: architecture, security, testing, docs, complexity |

### Roles & Sync

| Tool | Description |
|------|-------------|
| `arcbridge_complete_phase` | Validate phase gates and transition to next phase |
| `arcbridge_activate_role` | Load agent role with tools and pre-loaded context |
| `arcbridge_verify_scenarios` | Run linked tests for quality scenarios |
| `arcbridge_update_scenario_status` | Manually update scenario status and link test files |
| `arcbridge_run_role_check` | Run a role's quality checks against code |

### Metrics

| Tool | Description |
|------|-------------|
| `arcbridge_record_activity` | Record agent activity — model, tokens, cost, duration, quality snapshot |
| `arcbridge_get_metrics` | Query and aggregate activity by model, task, phase, tool, or day |
| `arcbridge_export_metrics` | Export metrics to JSON, CSV, or Markdown for git commits |

## How It Works

The server communicates over stdio using the MCP protocol. Each tool call receives a `target_dir` parameter pointing to an ArcBridge-initialized project. The server manages a SQLite database (`.arcbridge/index.db`) that caches architecture docs, indexed symbols, and planning state.

Data flow: **YAML/markdown (source of truth) -> SQLite (query cache) -> MCP tools (agent interface)**

All mutations (task updates, phase transitions, scenario results) write back to both the database and the source YAML files, so the docs stay in sync.

## License

[MIT](../../LICENSE)
