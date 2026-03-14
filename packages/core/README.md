# @arcbridge/core

Core library for ArcBridge — schemas, database, generators, TypeScript indexer, drift detection, and sync utilities.

## Install

```bash
npm install @arcbridge/core
```

## What's Inside

- **Schemas** — Zod schemas for config, building blocks, quality scenarios, phases, tasks, ADRs, and agent roles
- **Database** — SQLite (better-sqlite3) with WAL mode, schema migrations, and an in-memory option for testing
- **Generators** — Create arc42 docs, phase plans, agent roles, and platform configs from a project template
- **Indexer** — TypeScript Compiler API-based symbol extraction, dependency graphs, React component analysis, and Next.js route mapping
- **Drift Detection** — Compare architecture docs against indexed code to find undocumented modules, missing modules, dependency violations, unlinked tests, and stale ADRs
- **Sync** — Task status inference from code state, YAML write-back, and git sync point management
- **Testing** — Run linked tests for quality scenarios and update pass/fail status

## Usage

```typescript
import {
  generateConfig,
  generateArc42,
  generatePlan,
  generateDatabase,
  indexProject,
  detectDrift,
  refreshFromDocs,
} from "@arcbridge/core";

// Initialize a project
const input = {
  name: "my-app",
  template: "nextjs-app-router",
  features: ["auth", "api"],
  quality_priorities: ["security", "performance"],
  platforms: ["claude"],
};

generateConfig(targetDir, input);
generateArc42(targetDir, input);
generatePlan(targetDir, input);
const { db } = generateDatabase(targetDir, input);

// Index TypeScript symbols
const result = indexProject(db, { projectRoot: targetDir });
// result.symbolsIndexed, result.filesProcessed, etc.

// Detect architecture drift
const entries = detectDrift(db);
// entries: DriftEntry[] with kind, severity, description

// Rebuild DB from YAML/markdown (preserves statuses)
const warnings = refreshFromDocs(db, targetDir);
```

## Project Templates

- `nextjs-app-router` — Next.js App Router with auth, API routes, and server/client boundaries
- `react-vite` — Vite + React SPA with routing and state management
- `api-service` — Express/Fastify API with auth, validation, and database layers

## License

[MIT](../../LICENSE)
