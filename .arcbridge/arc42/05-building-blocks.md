---
section: building-blocks
schema_version: 1
last_synced: '2026-06-21T00:00:00.000Z'
blocks:
  - id: core
    name: Core
    level: 1
    code_paths:
      - packages/core/src/
    interfaces: []
    quality_scenarios: []
    adrs: []
    responsibility: >-
      Domain heart of ArcBridge: zod schemas, SQLite database layer, arc42 +
      plan generators, the multi-language code indexer, drift detection, git
      helpers, YAML write-back/sync, roles, metrics, and config loading. Has no
      dependency on any other ArcBridge package or on the MCP SDK.
    service: core
  - id: adapters
    name: Platform Adapters
    level: 1
    code_paths:
      - packages/adapters/src/
    interfaces:
      - core
    quality_scenarios: []
    adrs: []
    responsibility: >-
      Platform-specific configuration generators (Claude Code, GitHub Copilot,
      Codex CLI, Gemini, OpenCode) plus shared instruction/skill/marker-merge
      helpers. Depends only on core.
    service: adapters
  - id: cli
    name: CLI
    level: 1
    code_paths:
      - packages/cli/src/
    interfaces:
      - core
      - adapters
    quality_scenarios: []
    adrs: []
    responsibility: >-
      The `arcbridge` command-line binary: init, sync, status, drift, refresh,
      update-task, and generate-configs. Orchestrates core's index/drift/sync
      pipeline and adapters' config generation.
    service: cli
  - id: mcp-server
    name: MCP Server
    level: 1
    code_paths:
      - packages/mcp-server/src/
    interfaces:
      - core
    quality_scenarios: []
    adrs: []
    responsibility: >-
      Thin Model Context Protocol shell: registers the ArcBridge MCP tools and
      maps each to core operations. Validates all params via zod and returns
      agent-facing results. Depends only on core.
    service: mcp-server
---
# Building Block View

## Level 1: Top-Level Decomposition

ArcBridge is a pnpm monorepo. Each published package is one top-level building
block; the dependency direction is strictly `cli`/`mcp-server`/`adapters` →
`core`, and `cli` → `adapters`. `core` depends on nothing internal.

### Core (`packages/core`)

**Responsibility:** Schemas, SQLite database + migrations, arc42/plan
generators, the TypeScript/C#/Python/Go indexer, drift detection, git helpers,
YAML write-back, roles, metrics, and config loading.

**Code:** `packages/core/src/`

### Platform Adapters (`packages/adapters`)

**Responsibility:** Config generators for Claude Code, GitHub Copilot, Codex
CLI, Gemini, and OpenCode, plus shared instruction/skill/marker-merge helpers.

**Code:** `packages/adapters/src/` — depends on `core`.

### CLI (`packages/cli`)

**Responsibility:** The `arcbridge` binary — init, sync, status, drift, refresh,
update-task, generate-configs.

**Code:** `packages/cli/src/` — depends on `core` and `adapters`.

### MCP Server (`packages/mcp-server`)

**Responsibility:** Thin MCP shell registering the ArcBridge tools, mapping each
to core operations.

**Code:** `packages/mcp-server/src/` — depends on `core`.

## Not a building block

`packages/dotnet-indexer` is a standalone .NET console tool (the optional Roslyn
C# indexer backend), shelled out to by `core`. It is documented here but
excluded from code indexing (TypeScript-only per-service indexing) and from
drift via `drift.ignore_paths`.
