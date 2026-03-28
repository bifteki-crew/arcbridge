# How AI Agents Use ArcBridge

A practical explanation of what ArcBridge does for AI coding agents, with a concrete example.

## The Problem

When an AI agent gets a task like **"Fix the auth middleware to check token expiry"**, it needs to figure out:

- Where does the auth code live?
- What functions are involved?
- What depends on this code — will changes break something?
- Are there quality requirements (security, performance) that apply?
- What did the architect intend this module to do?

Without architectural context, the agent has to guess and scan. On a large codebase, this means reading 10-20 files just to orient — burning tokens, filling the context window with irrelevant code, and still possibly missing the right file.

## How ArcBridge Changes This

ArcBridge pre-indexes the codebase into a SQLite database and links it to architecture documentation. The agent queries this database through MCP tools instead of scanning files.

### Step 1 — Get architectural context for a file

The agent calls `arcbridge_get_guidance` with `{ file_path: "src/lib/auth/middleware.ts" }`.

The tool looks up which **building block** owns that path (by matching against declared `code_paths`), then returns:

```
Building Block: auth-module
Responsibility: User authentication, session management, and authorization
Quality Scenarios: SEC-01 (Auth on all API routes), SEC-02 (No secrets in client bundles)
Related ADRs: ADR-003 (JWT with refresh tokens)
Existing patterns in this area: verifyToken(), refreshSession(), authGuard()
```

**One call** — the agent instantly knows the architectural intent, the quality constraints it must respect, the design decisions that were made, and what code already exists in this area.

### Step 2 — Understand a specific function

The agent calls `arcbridge_get_symbol` with `{ symbol_id: "src/lib/auth/middleware.ts::verifyToken#function" }`.

Returns:

```
Name: verifyToken
Kind: function
Signature: (token: string) => Promise<DecodedToken | null>
Exported: true
Lines: 42-67
Dependencies: imports jwt.decode, calls db.findSession
Dependents: authGuard, refreshSession, 3 API routes
```

The agent now knows the exact signature, what this function calls, and **what depends on it**. It won't accidentally break callers when making changes.

### Step 3 — Find related code

The agent calls `arcbridge_search_symbols` with `{ query: "expir", kind: "function" }`.

Returns all functions matching "expir" across the codebase — maybe `isTokenExpired()` already exists in a different file that the agent would have missed by grepping. No need to guess file paths or scan directories.

### Step 4 — Check for drift after making changes

After the fix, the agent (or CI) runs `arcbridge_check_drift`. This compares the current code against the architecture documentation and flags:

- New files that aren't mapped to any building block
- Building blocks that reference code paths that no longer exist
- Dependencies between blocks that aren't declared in the architecture
- Quality scenarios with missing or broken test links

This keeps the architecture docs honest as the code evolves.

## What This Saves

| | Without ArcBridge | With ArcBridge |
|---|---|---|
| **Find the right file** | Grep + read 10-20 files | 1 MCP call |
| **Understand relationships** | Manually trace imports | Dependency graph in the DB |
| **Know quality constraints** | Read docs (if they exist) | Linked to building blocks automatically |
| **Know architectural intent** | Ask someone or guess | Building block responsibility + ADRs |
| **Context window cost** | Thousands of tokens on exploration | Targeted, structured responses |
| **Consistency over time** | Docs drift from code silently | Drift detection catches divergence |

## The Key Insight

The SQLite database is a **pre-built index of the codebase**. Instead of the agent scanning files at runtime (expensive, slow, error-prone), it queries a structured database that already knows what's where, what depends on what, and what the architecture intends.

It's like giving the agent a senior developer's mental model of the project on day one.

## The Full Tool Set

ArcBridge exposes 30 MCP tools organized by concern:

- **Architecture** — query building blocks, quality scenarios, and ADRs
- **Code Intelligence** — search symbols, trace dependencies, analyze components and routes
- **Planning** — track phases, tasks, and progress through the implementation plan
- **Architecture Bridge** — detect drift, get guidance, propose documentation updates
- **Roles** — activate specialized agent roles (architect, security reviewer, quality guardian, ux reviewer, etc.)

Each tool returns structured, concise information — not raw file contents. The agent gets exactly the context it needs without reading files it doesn't need.

## Docs and Code Stay in Sync — Automatically

Traditional architecture documentation rots. Someone updates the code, forgets to update the docs, and within a few sprints the documentation is fiction. ArcBridge solves this with a **bidirectional sync loop** built into the agent workflow.

### Code changes update the docs

When an agent (or developer) changes code, ArcBridge detects the divergence and closes the loop:

1. **Drift detection** — `arcbridge_check_drift` compares indexed code against the architecture docs. If a new module appears that isn't mapped to a building block, or a declared code path no longer has any symbols, it flags the mismatch.

2. **Update proposals** — `arcbridge_propose_arc42_update` analyzes recent git changes and generates concrete proposals: "Add `src/lib/cache/` to the `data-access` building block" or "Create ADR for the new caching strategy."

3. **Phase gates enforce it** — When the agent tries to complete a phase via `arcbridge_complete_phase`, it checks three gates: all tasks done, no critical drift, and quality scenarios not failing. If new code introduced undocumented modules, the phase can't close until the docs are updated. This makes documentation a natural part of the workflow, not an afterthought.

4. **Practice reviews** — `arcbridge_get_practice_review` scores the project across 5 dimensions (architecture, security, testing, documentation, complexity). Documentation gaps show up as low scores, prompting the agent to fix them.

### Doc changes update the code context

The sync works the other way too. When someone edits the YAML or markdown files directly — adding a new building block, changing a quality scenario, or updating the phase plan — the agent picks up those changes automatically:

1. **Refresh on read** — Key MCP tools (`get_project_status`, `get_phase_plan`, `get_current_tasks`) call `refreshFromDocs()` before returning results. This rebuilds the database from the current YAML/markdown files, so manual edits are visible immediately — no restart or re-init needed.

2. **Status preservation** — When the database refreshes from docs, it preserves runtime state. If a task was marked "done" in the DB but the YAML still says "todo" (because YAML tracks the initial state), the "done" status is kept. The agent's progress isn't lost.

3. **YAML write-back** — When the agent updates a task status, completes a phase, or records test results, those changes are written back to the YAML files — not just the database. This means the YAML files in version control always reflect the current state. Other developers (or agents) checking out the repo see the latest progress.

### The convention that makes it work

ArcBridge defines a repeatable loop: **Plan, Build, Sync, Review**.

```
Plan  →  Agent reads architecture docs, quality scenarios, current tasks
         via MCP tools. Understands what to build and why.

Build →  Agent writes code, informed by building block responsibilities,
         dependency graphs, and quality constraints.

Sync  →  arcbridge sync runs: reindex code, detect drift, infer task
         statuses, verify quality scenarios, update sync point.

Review → Agent roles (security-reviewer, quality-guardian, code-reviewer)
         check the work. Drift is resolved. Docs are updated. Phase gates
         are checked.
```

Each cycle through this loop keeps docs and code converging rather than diverging. The agent isn't just consuming documentation — it's actively maintaining it as a side effect of doing its normal work.

### What this means in practice

- Architecture docs are **always queryable and always current** — not a stale wiki page
- New team members (human or AI) get an accurate picture of the system from day one
- Architectural decisions are **traceable** — every ADR links to affected code and building blocks
- Quality requirements are **enforced**, not aspirational — linked tests run on every sync
- The cost of keeping docs up to date drops to near zero because the agent does it as part of its workflow

## How the Index Stays Fresh

The database is a **derived cache**, not the source of truth. The source of truth is always the YAML and markdown files in `.arcbridge/`:

```
.arcbridge/
├── arc42/
│   ├── 01-introduction.md         ← project goals and stakeholders
│   ├── 03-context.md              ← external systems and integrations
│   ├── 05-building-blocks.md      ← defines what code belongs where
│   ├── 06-runtime-views.md        ← key workflows and request flows
│   ├── 07-deployment.md           ← environments and infrastructure
│   ├── 08-crosscutting.md         ← patterns: error handling, auth, logging, validation
│   ├── 09-decisions/              ← Architecture Decision Records (ADRs)
│   ├── 10-quality-scenarios.yaml  ← quality requirements (security, perf, a11y)
│   └── 11-risks-debt.md           ← known risks and technical debt
├── plan/
│   ├── phases.yaml                ← the implementation plan
│   └── tasks/{phase-id}.yaml       ← task definitions and statuses per phase
└── index.db                       ← derived from the above + code analysis
```

Running `arcbridge sync` (or the MCP `reindex` tool) refreshes the database from both the documentation files and the live codebase. This can run in CI, on a git hook, or on-demand. The agent always queries up-to-date information.
