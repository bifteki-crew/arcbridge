# Changelog

## 0.1.0 (unreleased)

First release of ArcBridge — an MCP server and CLI that gives AI coding agents architectural awareness via arc42 documentation.

### Packages

- `@arcbridge/core` — schemas, SQLite database, TypeScript indexer, drift detection, generators, testing runner, role/config loaders
- `@arcbridge/adapters` — Claude Code and GitHub Copilot config generators
- `@arcbridge/mcp-server` — MCP server with 26 tools for architecture, planning, code intelligence, and sync
- `arcbridge` — CLI with `init`, `sync`, `status`, `drift`, `update-task`, and `generate-configs` commands

### Highlights

- **26 MCP tools** covering lifecycle, architecture, planning, code intelligence, React/Next.js analysis, drift detection, and sync
- **TypeScript Compiler API indexer** — symbol extraction, dependency graphs, incremental re-indexing
- **React & Next.js** — component classification, route analysis, server/client boundary detection
- **Drift detection** — 5 drift kinds (undocumented module, missing module, dependency violation, unlinked test, stale ADR)
- **Phase management** — phase gates with task, drift, and quality checks; automatic phase transitions
- **7 agent roles** — architect, implementer, security reviewer, quality guardian, phase manager, onboarding, code reviewer
- **3 project templates** — nextjs-app-router, react-vite, api-service
- **CLI with CI support** — all commands support `--json` output for GitHub Actions integration
- **Quality scenario verification** — link tests to scenarios, run them via `verify_scenarios` or `arcbridge sync`
- **194 tests**, 0 type errors
