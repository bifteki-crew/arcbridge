---
id: 001-monorepo-per-package-indexing
title: pnpm monorepo with per-package TypeScript indexing
status: accepted
date: '2026-06-21'
affected_blocks:
  - core
  - adapters
  - cli
  - mcp-server
affected_files:
  - packages/core/src/indexer/index.ts
  - packages/core/src/indexer/program.ts
  - packages/cli/src/commands/sync.ts
quality_scenarios: []
---
# ADR-001: pnpm monorepo with per-package TypeScript indexing

## Context

ArcBridge ships four TypeScript packages — `@arcbridge/core`, `@arcbridge/adapters`,
`arcbridge` (cli), and `@arcbridge/mcp-server` — plus a standalone .NET indexer
tool. They live in a pnpm workspace with a shared `tsconfig.base.json` and a
`tsconfig.json` per package. There is intentionally no aggregate root
`tsconfig.json`.

The code indexer originally located source via a single root `tsconfig.json`,
which finds nothing in this layout. ArcBridge needs to index its own (and any)
monorepo to give agents architectural awareness of it.

## Decision

Index each package as its own service. `config.services` lists each package with
its `tsconfig`; `indexConfiguredProject` builds one TypeScript program per package
and merges the symbols into the shared SQLite database, tagged by service name.
File paths are stored relative to the repo root so building-block `code_paths`
(e.g. `packages/core/src/`) match. Dependency manifests are scanned from each
package's own directory, not the repo root.

The dependency direction is enforced by convention and documented in the building
blocks: `adapters`, `cli`, and `mcp-server` may depend on `core`; `cli` may also
depend on `adapters`; `core` depends on nothing internal.

Key runtime dependencies: `zod` (schema validation), `yaml` and `gray-matter`
(YAML / frontmatter parsing), `globby` (file discovery), `web-tree-sitter` (C#,
Python, and Go WASM parsers), `@modelcontextprotocol/sdk` (MCP server), and the
Node.js built-in `node:sqlite` (no native build step).

## Consequences

- **Positive:** ArcBridge can index itself and any pnpm/monorepo project with
  per-package tsconfigs.
- **Positive:** Symbols are scoped by service, so queries and metrics can filter
  per package.
- **Negative:** Cross-package imports resolve to package names (e.g.
  `@arcbridge/core`), not to indexed source symbols, so `dependency_violation`
  drift cannot yet catch architectural violations *across* packages — only
  within a package. Tracked as a follow-up.
- **Negative:** Non-TypeScript services (the .NET `dotnet-indexer`) are not
  indexed per-service; `packages/dotnet-indexer/` is documented in the building
  blocks and excluded via `drift.ignore_paths`.
