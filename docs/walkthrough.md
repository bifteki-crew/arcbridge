# ArcBridge Walkthrough: Building a Bookmark App

This walkthrough takes you through the full **Plan → Build → Sync → Review** lifecycle using ArcBridge. We'll build a simple bookmark manager with Next.js to show how ArcBridge keeps your AI agent architecturally aware throughout the process.

## Prerequisites

- Node.js 20+
- pnpm (or npm/yarn)
- An AI coding agent (Claude Code, GitHub Copilot, etc.)
- ArcBridge installed (`npm install -g arcbridge` or use `npx`)

## Step 1: Create Your Project

Start with a standard Next.js project:

```bash
npx create-next-app@latest bookmark-app --typescript --app --src-dir
cd bookmark-app
```

## Step 2: Initialize ArcBridge

```bash
arcbridge init
```

ArcBridge auto-detects your project from `package.json`:

```
Initializing ArcBridge in /home/user/bookmark-app

  Project:  bookmark-app (package.json)
  Template: nextjs-app-router (detected (next in dependencies))
  Platform: claude

Creating .arcbridge/config.yaml...
Creating arc42 documentation...
Creating phase plan...
Creating agent roles...
Initializing database...
Creating sync triggers...
Generating platform configs...
Indexing codebase...

ArcBridge initialized successfully!

  Building blocks:    3
  Quality scenarios:  7
  Phases:             4
  Tasks:              5
  Agent roles:        7
  Indexed:            8 files, 12 symbols

Next steps:
  1. Review .arcbridge/config.yaml and adjust as needed
  2. Start your AI agent (e.g. Claude Code) in this directory
  3. The agent will see the architecture context and can help
     refine building blocks, quality scenarios, and the plan
  4. Run `arcbridge sync` periodically to keep docs in sync with code
```

### What just happened?

ArcBridge created a complete architecture scaffold:

```
.arcbridge/
  config.yaml                     # Project config (type, platforms, indexing)
  index.db                        # SQLite database (symbols, deps, drift)
  arc42/
    01-introduction.md            # Project goals and stakeholders
    03-context.md                 # System context diagram
    05-building-blocks.md         # Module decomposition
    10-quality-scenarios.yaml     # Quality requirements (security, perf, a11y)
    09-decisions/                 # Architecture Decision Records (ADRs)
  plan/
    phases.yaml                   # Phase definitions and gates
    tasks/                        # Per-phase task breakdowns
  agents/                         # Agent role definitions (7 roles)
CLAUDE.md                         # Instructions for Claude Code
.claude/agents/                   # Claude-specific agent configs
```

The building blocks, quality scenarios, and phases are **generic scaffolds** from the Next.js template. The next step is to make them specific to your project.

## Step 3: Connect the MCP Server

ArcBridge's tools are exposed to your AI agent via an MCP (Model Context Protocol) server. You need to tell your agent how to start it.

### Claude Code

Add ArcBridge to your MCP config. Create `.mcp.json` in your project root:

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

Or use the CLI to add it:

```bash
claude mcp add --transport stdio --scope project arcbridge -- npx @arcbridge/mcp-server
```

Restart Claude Code — it will prompt you to approve the MCP server on first use. You can verify by asking Claude: *"What ArcBridge tools do you have access to?"*

### GitHub Copilot

Copilot doesn't support MCP servers directly yet. ArcBridge generates Copilot-compatible agent configs (`.github/agents/`) and instruction files (`.github/copilot-instructions.md`) during init. These give Copilot context about your architecture, but without the interactive tool access that MCP provides.

### Other MCP-compatible agents

Any agent that supports MCP can connect using the same approach — point it at `npx @arcbridge/mcp-server` (or `node /path/to/packages/mcp-server/dist/index.js` for local development).

## Step 4: Refine the Architecture with Your Agent

Start your AI agent. In Claude Code:

```bash
claude
```

Claude reads `CLAUDE.md` and sees the ArcBridge tools. Now ask it to help define your architecture:

> "I'm building a bookmark manager. Users can save URLs with tags, organize them into collections, and search through them. Let's refine the architecture."

With the `architect` role, the agent can:

1. **Update building blocks** — replace the generic "UI Components" and "Library & Utilities" with specific blocks like "Bookmark Store", "Tag System", "Search Engine"
2. **Refine quality scenarios** — adjust security scenarios for your auth approach, add specific performance targets
3. **Create an ADR** — document why you chose a particular data storage approach

The agent uses MCP tools like `get_building_blocks`, `get_quality_scenarios`, and `propose_arc42_update` to read the current state and suggest changes. You approve or modify its proposals.

After this conversation, your building blocks might look like:

```yaml
blocks:
  - id: bookmarks
    name: Bookmark Manager
    code_paths:
      - src/lib/bookmarks/
      - src/app/api/bookmarks/
      - src/app/bookmarks/
    responsibility: CRUD operations for bookmarks, storage, and API routes

  - id: tags
    name: Tag System
    code_paths:
      - src/lib/tags/
      - src/app/api/tags/
    responsibility: Tag management, auto-suggest, tag-based filtering

  - id: ui-shared
    name: Shared UI
    code_paths:
      - src/components/
    responsibility: Reusable UI components (cards, forms, search bar)
    interfaces:
      - bookmarks
      - tags
```

## Step 5: Plan Phase — Review Tasks

Check what ArcBridge has planned:

```bash
arcbridge status
```

```
Project: bookmark-app
Phase:   Project Setup (in-progress)
Tasks:   0/3 done, 0 in-progress, 0 blocked

Current phase tasks:
  [ ] Initialize Next.js project
  [ ] Configure development tooling
  [ ] Set up testing infrastructure

Quality: 0 passing, 0 failing, 7 untested (7 total)

Blocks:  3
Symbols: 12
Drift:   0 issues
```

Since the Next.js project already exists, you can mark the first task done:

```bash
arcbridge update-task task-0.1-init-nextjs done
```

```
task-0.1-init-nextjs: todo → done (Initialize Next.js project)
```

## Step 6: Build Phase — Write Code

Now build. Ask your agent to implement features. With ArcBridge, the agent has context about:

- **What building block** the code belongs to (from `code_paths`)
- **What quality scenarios** apply (security, performance targets)
- **What phase** you're in and what tasks are expected
- **What patterns** already exist in the codebase

For example, when building the bookmark API:

> "Implement the bookmark CRUD API routes"

The agent can check `get_guidance` for the `src/app/api/bookmarks/` path and get context about the Bookmark Manager building block, its quality scenarios (SEC-01: auth on all API routes), and existing patterns.

## Step 7: Sync — Keep Architecture in Sync with Code

After writing some code, run sync:

```bash
arcbridge sync
```

```
Reindexing...
  Indexed 15 files, 42 symbols, 87 deps
Checking drift...
  Found 2 drift issue(s)
    [WARN]  missing_module: Building block `Tag System` (tags) declares
            code_path `src/lib/tags/` but no indexed symbols match it.
    [ERROR] dependency_violation: Block `Shared UI` (ui-shared) depends on
            block `Bookmark Manager` (bookmarks) but does not declare it
            in its interfaces.
Inferring task statuses...
  Updated 3 task(s):
    task-1.1: todo -> in-progress (Building block `bookmarks` has indexed code in 3/3 paths)
    task-1.2: todo -> in-progress (Building block `bookmarks` has indexed code in 3/3 paths)
    task-1.5: todo -> in-progress (Building block `bookmarks` has indexed code in 3/3 paths)
Verifying quality scenarios...
  No testable scenarios found.
Sync point updated to a1b2c3d.

Sync complete.
WARNING: 1 drift error(s) would block phase completion.
```

### What sync tells you

1. **Task inference** — ArcBridge detected code in the bookmarks building block's paths, so it automatically moved related tasks to "in-progress". No manual status updates needed.

2. **Drift detection** — Two issues found:
   - The Tag System block has no code yet (warning — expected if you haven't started it)
   - The UI components import from bookmarks, but `ui-shared` doesn't declare `bookmarks` as an interface (error — this is an undeclared architectural dependency)

3. **Quality scenarios** — No tests are linked yet, so nothing to verify

### Fix the drift

The dependency violation means your `BookmarkCard` component imports directly from `src/lib/bookmarks/`. You have two options:

**Option A:** Declare the dependency in the building blocks (the UI is *allowed* to depend on bookmarks):
```yaml
- id: ui-shared
  interfaces:
    - bookmarks    # ← add this
```

**Option B:** Refactor to pass data via props instead of direct imports (cleaner separation).

Either way, ArcBridge ensures you make the decision consciously rather than accumulating hidden dependencies.

## Step 8: Review — Check Quality and Progress

Check overall status after a sync:

```bash
arcbridge status
```

```
Project: bookmark-app
Phase:   Foundation (in-progress)
Tasks:   1/5 done, 3 in-progress, 0 blocked

Current phase tasks:
  [x] Create bookmark data types and storage
  [~] Implement bookmark API routes (CRUD)
  [~] Build bookmark list page
  [ ] Add simple auth middleware
  [~] Create add bookmark form

Quality: 0 passing, 0 failing, 7 untested (7 total)

Blocks:  3
Symbols: 42
Drift:   1 issues (1 error)
```

### Link tests to quality scenarios

When you write a test for auth (e.g., `src/__tests__/auth.test.ts`), link it to the quality scenario:

```yaml
# In .arcbridge/arc42/10-quality-scenarios.yaml
- id: SEC-01
  name: Auth on all API routes
  linked_tests:
    - src/__tests__/auth.test.ts
  verification: automatic
```

Next sync will run the test and update the scenario status automatically:

```bash
arcbridge sync
```

```
Verifying quality scenarios...
  1 scenario(s) verified: 1 passing, 0 failing
```

## Step 9: Complete a Phase

When all tasks are done and drift is resolved, complete the phase via your agent:

> "Complete the current phase"

The agent calls `complete_phase`, which checks three gates:

1. **All tasks done** — every task in the phase must be "done"
2. **No critical drift** — no dependency violations or errors
3. **Must-have quality scenarios** — scenarios with `priority: must` are not failing

If gates pass, the phase completes and the next one starts automatically.

## The Ongoing Loop

The Plan → Build → Sync → Review cycle repeats for each phase:

```
┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
│  PLAN  │───>│ BUILD  │───>│  SYNC  │───>│ REVIEW │
│        │    │        │    │        │    │        │
│ Agent  │    │ Agent  │    │arcbridge│   │ Human  │
│ refines│    │ writes │    │ sync   │    │ checks │
│ blocks,│    │ code   │    │        │    │ status,│
│ tasks  │    │        │    │ Detects│    │ approves│
│        │    │        │    │ drift, │    │ changes │
│        │    │        │    │ infers │    │        │
│        │    │        │    │ tasks  │    │        │
└────────┘    └────────┘    └────────┘    └────────┘
     ^                                        │
     └────────────────────────────────────────┘
```

### Running sync in CI

ArcBridge generates a GitHub Action (`.github/workflows/arcbridge-sync.yml`) that runs sync on every push. This catches drift in PRs before they merge:

```yaml
# Generated automatically by arcbridge init
name: ArcBridge Sync
on: [push]
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx arcbridge sync --json
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `arcbridge init` | Initialize ArcBridge (auto-detects project type) |
| `arcbridge sync` | Reindex, detect drift, infer tasks, verify scenarios |
| `arcbridge status` | Show project status, phase, tasks, quality |
| `arcbridge drift` | Check for architecture drift only |
| `arcbridge update-task <id> <status>` | Update a task (todo, in-progress, done, blocked) |
| `arcbridge generate-configs` | Regenerate platform agent configs |

All commands support `--dir <path>` and `--json` flags.

## Agent Roles

ArcBridge defines 7 agent roles, each with specific context and tool access:

| Role | When to use |
|------|-------------|
| **architect** | Define building blocks, review dependencies, create ADRs |
| **implementer** | Write code within a building block, follow quality scenarios |
| **security-reviewer** | Audit auth, input validation, client/server boundaries |
| **quality-guardian** | Review test coverage, scenario verification, quality gates |
| **phase-manager** | Track phase progress, manage task status, handle completion |
| **code-reviewer** | Review changes against architecture, check for drift |
| **onboarding** | Explore and understand an existing project |

Activate a role via MCP: `activate_role(role: "architect")`

## Tips

- **Start small** — Let the agent refine your architecture iteratively. You don't need everything defined upfront.
- **Run sync often** — After every significant coding session. It's fast (usually < 1 second) and catches drift early.
- **Trust the drift detector** — If it flags an undeclared dependency, that's a real architectural decision you should make consciously.
- **Link tests to scenarios** — This is what makes quality gates work. Without linked tests, scenarios stay "untested" forever.
- **Use `--json` in CI** — Parse the output programmatically to fail builds on drift errors.
