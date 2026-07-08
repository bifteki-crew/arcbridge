# @arcbridge/mcp-server

MCP server for ArcBridge — exposes 34 architecture tools to AI coding agents via the [Model Context Protocol](https://modelcontextprotocol.io).

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

25 tools (consolidated from 35 in 0.10.0 — see the repo CHANGELOG for the old → new mapping).

### Lifecycle

| Tool | Description |
|------|-------------|
| `arcbridge_init_project` | Initialize ArcBridge in a project directory |
| `arcbridge_get_project_status` | Current phase, task completion, quality summary |

### Architecture

| Tool | Description |
|------|-------------|
| `arcbridge_get_building_blocks` | All blocks with code paths and quality links; `block_id` for the deep view |
| `arcbridge_quality_scenarios` | List scenarios or update one's status/linked tests (`action: list\|update`) |
| `arcbridge_get_relevant_adrs` | ADRs for a file path or building block |

### Planning

| Tool | Description |
|------|-------------|
| `arcbridge_get_phase_plan` | Phase plan with tasks and gates; `view: tasks` for one phase's task list |
| `arcbridge_manage_tasks` | Create, update, or delete tasks (`action`) |
| `arcbridge_manage_phases` | Create/delete phases, or complete one against its gates (`action`) |

### Code Intelligence

| Tool | Description |
|------|-------------|
| `arcbridge_reindex` | Index/re-index code symbols — TypeScript, C#, Python (experimental), Go (experimental) |
| `arcbridge_propose_building_blocks` | Reverse-engineer building blocks from existing code |
| `arcbridge_query_symbols` | Search symbols by name/kind/path/block; `symbol_id` for full detail |
| `arcbridge_get_dependency_graph` | Import/dependency graph for a module |

### React & Next.js

| Tool | Description |
|------|-------------|
| `arcbridge_get_component_graph` | Component hierarchy with props, state, and context flow |
| `arcbridge_get_route_map` | Next.js App Router routes with layouts, middleware, auth |
| `arcbridge_get_boundary_analysis` | Server/client boundary analysis |

### Architecture Bridge

| Tool | Description |
|------|-------------|
| `arcbridge_check_drift` | Detect drift between architecture docs and code |
| `arcbridge_get_guidance` | Context-aware guidance for a file path or building block |
| `arcbridge_get_open_questions` | Unresolved architectural questions and risks |
| `arcbridge_arc42` | Read/update arc42 sections or propose doc updates (`action: read\|update\|propose`) |
| `arcbridge_get_practice_review` | 5-dimension review: architecture, security, testing, docs, complexity |

### Roles & Sync

| Tool | Description |
|------|-------------|
| `arcbridge_activate_role` | Load agent role with tools, quality focus, and context |
| `arcbridge_verify_scenarios` | Run linked tests for quality scenarios and update pass/fail |
| `arcbridge_run_role_check` | Run a role's quality checks against a file or building block |

### Metrics

| Tool | Description |
|------|-------------|
| `arcbridge_record_activity` | Record agent activity — model, tokens, cost, duration, optional quality snapshot (drift/test/lint/typecheck) |
| `arcbridge_get_metrics` | Query/aggregate activity; `format: json/csv/markdown` exports to a file |

## How It Works

The server communicates over stdio using the MCP protocol. Each tool call receives a `target_dir` parameter pointing to an ArcBridge-initialized project. The server manages a SQLite database (`.arcbridge/index.db`) that caches architecture docs, indexed symbols, and planning state.

Data flow: **YAML/markdown (source of truth) -> SQLite (query cache) -> MCP tools (agent interface)**

All mutations (task updates, phase transitions, scenario results) write back to both the database and the source YAML files, so the docs stay in sync.

## License

[MIT](../../LICENSE)
