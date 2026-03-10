# ArchLens — AI-Native Project Lifecycle Tool for TypeScript/React/Next.js/Dotnet

## Working Title & Concept

**ArchLens** (working name) is an MCP server and project starter that bridges architectural thinking (arc42), structured planning (inspired by spec-kit), and code-level intelligence (via the TypeScript compiler API) into a single system. It gives AI coding agents architectural awareness, quality-driven constraints, and phase-aware context — so they build code that fits the system, not just code that compiles.

**Target audience:** Solo developers and small teams (2–5 people) starting new TypeScript/React/Next.js projects who want production-grade structure without enterprise overhead.

**Core thesis:** The biggest waste in AI-assisted development isn't token cost — it's the agent lacking *intent* and the developer lacking *visibility*. The agent doesn't know why the code is structured this way, what quality attributes matter, or what phase the project is in. The developer doesn't see the architectural implications of daily coding decisions until they've accumulated into technical debt. ArchLens fixes both by making planning, architecture, and code queryable through a single interface — and by surfacing the right questions at the right time, turning every project into a learning experience about what production-grade software actually requires.

---

## The ArchLens Convention: An Agentic Coding Pattern

ArchLens is a tool, but more importantly it defines a **convention** — a repeatable pattern for how AI agents and human developers collaborate across the full lifecycle of a project. The tool is the reference implementation; the convention is what matters long-term.

### The Problem With Current Agentic Coding

Today's agentic coding workflows suffer from a fundamental asymmetry: the developer has a mental model of the project (its goals, architecture, quality requirements, current state), but the agent starts every session nearly blank. The workarounds are all fragile:

- **CLAUDE.md / .cursorrules** — static files that go stale within days. Nobody maintains them because there's no feedback loop.
- **Spec-driven development** — great for the initial build, but specs become shelfware after sprint two because updating them is manual labor with no immediate payoff.
- **Context engineering** — the hot topic of 2025/2026, but mostly focused on the *input* side (what to put in the prompt). Nobody is systematically solving the *output* side: how does the agent's work feed back into the project's knowledge base?

The root cause is that documentation maintenance has negative short-term ROI. It takes time, the agent doesn't immediately benefit, and the developer is already on to the next feature. The only way to break this cycle is to make the maintenance **automatic and agent-driven**, with the human only approving or correcting — never writing from scratch.

### The Convention: Plan → Build → Sync → Repeat

The ArchLens convention defines a loop, not a pipeline:

```
    ┌──────────────────────────────────────────┐
    │                                          │
    ▼                                          │
┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐
│  PLAN  │───▶│ BUILD  │───▶│  SYNC  │───▶│ REVIEW │
│        │    │        │    │        │    │        │
│ Phase  │    │ Agent  │    │ Agent  │    │ Human  │
│ tasks, │    │ writes │    │ detects│    │ approves│
│ quality│    │ code   │    │ drift, │    │ or      │
│ gates, │    │ within │    │ updates│    │ corrects│
│ arch   │    │ arch   │    │ plan + │    │ proposed│
│ context│    │ bounds │    │ arc42  │    │ changes │
└────────┘    └────────┘    └────────┘    └────────┘
    ▲                                          │
    │                                          │
    └──────────────────────────────────────────┘
```

**PLAN:** Before each phase or feature, the agent loads the current arc42, quality scenarios, and phase plan. It understands not just *what* to build, but *where it fits*, *what constraints apply*, and *what's been decided before*. The developer defines intent; the agent inherits context.

**BUILD:** During implementation, the agent works within architectural boundaries. It knows which building block it's in, which quality scenarios apply, which patterns to follow (drawn from actual code examples in the same building block, not generic templates). If it needs to cross a boundary, it flags it rather than silently introducing a new dependency.

**SYNC:** After each session, feature, or phase boundary, the sync loop runs automatically. The Phase Manager agent compares what was planned against what was built, detects architectural drift (new modules, changed dependencies, missing tests), and generates specific, actionable updates to the arc42, the phase plan, and the task list. This is where the compounding happens — every coding session makes the project knowledge *more accurate*, not less.

**REVIEW:** The human reviews proposed changes. This is where judgment lives — the developer might accept a drift ("yes, we did refactor auth into two modules, update the building block view") or reject it ("no, that dependency shouldn't exist, let's fix the code instead"). The key is that the human reviews a diff, not a blank page. The agent did the work; the human just steers.

### Why This Works for Solo Devs and Small Teams

Large teams have architects, tech leads, and documentation champions. Solo devs and small teams have none of these — which is exactly why their architecture docs rot fastest and their agents have the least context.

The ArchLens convention inverts this: the *agent* is the documentation champion. The developer never opens an arc42 file to write prose from scratch. Instead:

- The **starter** generates the initial arc42 from project setup decisions
- The **Architect agent** updates it when structural decisions are made
- The **Phase Manager agent** keeps it in sync after each coding session
- The **Onboarding agent** makes it useful by answering questions from it

The developer's only documentation task is reviewing proposed changes — which also serves as a forcing function to *think* about architecture, without the blank-page problem.

### The Convention Is Tool-Agnostic (The Implementation Is Not)

While ArchLens provides a reference implementation as an MCP server, the convention itself could be implemented with different tooling:

- The arc42 subset could be stored as markdown, YAML, or in a database
- The agent roles could be system prompts for Claude Code, Cursor rules, or Copilot instructions
- The sync loop could be a git hook, a CI step, or an MCP tool call
- The code intelligence could come from the TS compiler, tree-sitter, or an LSP

What matters is the *pattern*: that planning, architecture, and code stay linked; that agents have role-specific context and constraints; and that every coding session feeds back into the knowledge base. The convention should eventually be adoptable even by teams that don't use the ArchLens tool — they just implement the loop with their own tooling.

### The Bigger Picture: ArchLens as a Development Practice Teacher

There's a dimension beyond productivity: **ArchLens helps developers understand what production-grade software actually requires.** Most learning resources teach you to write features. Very few teach you to think about the system around those features — the security posture, the performance budgets, the deployment boundaries, the testing strategy, the architectural constraints that prevent spaghetti at scale.

Today, a solo dev starting a new Next.js project typically does this:
1. `npx create-next-app`
2. Start coding features immediately
3. Discover they need auth — bolt it on
4. Discover they need testing — add some unit tests for the easy parts
5. Discover a security issue in production — scramble to fix it
6. Discover the architecture has become unmaintainable — consider rewriting

Each of these discoveries is a painful, expensive lesson. The developer learns, eventually, but through failure rather than guidance.

ArchLens inverts this by **surfacing the right questions at the right time**, before they become problems:

**At project initialization:**
- "What's your authentication strategy? Here are the common patterns for Next.js with their trade-offs." → Generates an ADR and building block before the first line of auth code
- "What are your core quality priorities — security, performance, accessibility? Let's define concrete scenarios." → Creates testable quality scenarios, not vague aspirations
- "Who are the external systems you'll integrate with?" → Draws the context boundary in arc42 section 3, making the developer think about API contracts upfront

**During implementation:**
- "You're adding a new API route. Your quality scenario SEC-01 requires auth middleware on all API routes. Should I scaffold the middleware check?" → Catches the security gap before it reaches production
- "This component is importing from three different building blocks. That creates cross-cutting dependencies. Should this be a shared utility, or should the architecture be adjusted?" → Teaches module decomposition through concrete examples
- "You haven't written tests for this building block yet. Quality scenario MAINT-02 requires 80% coverage on business logic. Want me to generate test scaffolds?" → Makes testing a natural part of the flow, not an afterthought

**At phase boundaries:**
- "Phase 1 is complete. Before moving on: 2 quality scenarios have no linked tests, and 1 building block has undocumented dependencies. Here's what needs attention." → The phase gate isn't bureaucracy; it's a learning moment

The goal is not to lecture or block the developer. It's to make the *informed choice* the easy choice. If a developer decides "I'll skip auth middleware on this internal endpoint," that's fine — but the decision is conscious and recorded in the arc42, not an oversight that bites them later.

### Baked-In Practices: Testing, Code Review, and Beyond

Rather than treating testing and code review as separate concerns that developers "should" adopt, ArchLens integrates them structurally:

**Testing as an architecture artifact:**
Quality scenarios in arc42 section 10 aren't just documentation — they map directly to test files. When the starter generates a quality scenario like SEC-01 (auth on all API routes), it also generates the test scaffold in `tests/security/auth-middleware.test.ts`. The test is part of the architecture, not an afterthought. The Quality Guardian agent verifies that every quality scenario has a corresponding test, and flags gaps during sync.

The testing structure is organized by concern, not by implementation detail:
```
tests/
├── architecture/        # Architectural fitness functions
│   ├── circular-deps.test.ts
│   ├── building-block-boundaries.test.ts
│   └── server-client-boundary.test.ts
├── security/            # Linked to SEC-* quality scenarios
├── performance/         # Linked to PERF-* quality scenarios
├── accessibility/       # Linked to A11Y-* quality scenarios
└── features/            # Standard feature tests, organized by building block
    ├── auth/
    ├── checkout/
    └── ...
```

**Code review as agent behavior:**
Instead of relying on pull request reviews that may or may not happen on a solo project, ArchLens builds review into the agent loop itself. After implementation, the relevant agent role (Security Reviewer, Quality Guardian) runs automated checks that function like a structured code review:
- Does this change respect building block boundaries?
- Are all new API routes covered by auth middleware?
- Do new components follow accessibility patterns from the existing codebase?
- Has bundle size increased beyond the performance budget?

These aren't replacing human judgment for complex decisions — they're catching the mechanical issues that a human reviewer would flag, so the developer can focus their review time on the things that actually require thought.

**Architectural fitness functions:**
Inspired by the "Building Evolutionary Architectures" concept, the generated test suite includes fitness functions that verify structural properties of the codebase:
- No circular dependencies between building blocks
- Server-only code doesn't leak into client bundles
- All building blocks have corresponding arc42 documentation
- Dependency graph depth doesn't exceed configured thresholds

These run as normal tests (`vitest`) and are checked by the Quality Guardian agent at phase boundaries.

---

## What We Borrow and Where We Diverge

### From spec-kit
Spec-kit introduced a clean specify → plan → tasks workflow where specs become living artifacts that drive implementation. We borrow:
- The phased workflow concept (but adapted: specify → architect → plan → implement → sync)
- The idea of specs as machine-readable artifacts (not just docs for humans)
- The constitution concept (project principles that constrain agent behavior)
- Task breakdown with acceptance criteria

Where we diverge: spec-kit is framework-agnostic and treats architecture as implicit. ArchLens makes architecture *explicit* via arc42 and *queryable* via the code index. Spec-kit also doesn't maintain a feedback loop — once you've coded, the spec doesn't update itself. We add the sync loop.

### From jCodeMunch
jCodeMunch proved that symbol-level retrieval via MCP dramatically reduces token waste. We borrow:
- The MCP server approach for exposing code intelligence
- The concept of stable, referenceable symbol IDs
- The "index once, query cheaply" model

Where we diverge: jCodeMunch uses tree-sitter for generic multi-language parsing. We use the TypeScript compiler API for deep type-aware analysis. jCodeMunch is read-only and architecture-unaware. We connect code to architectural intent.

### From Aider
Aider's repo map uses dependency graphs with PageRank to identify the most relevant files. We borrow:
- The dependency graph approach (who imports what, who calls what)
- The idea of ranking relevance by structural relationships, not just keyword matches

Where we diverge: Aider's graph is file-level. Ours is symbol-level *and* architecture-level — we can answer "which building block does this belong to" and "what quality scenarios constrain this module."

### From arc42
Arc42 provides a proven 12-section architecture documentation template. We use a pragmatic subset:
- Section 1: Introduction & Goals (→ project constitution + quality goals)
- Section 3: Context & Scope (→ system boundary, external interfaces)
- Section 5: Building Block View (→ module decomposition, mapped to code)
- Section 6: Runtime View (→ key interaction flows, mapped to component trees)
- Section 7: Deployment View (→ server/client split for Next.js, edge functions)
- Section 9: Architecture Decisions (→ ADRs linked to affected code)
- Section 10: Quality Requirements (→ quality scenarios that become agent constraints)
- Section 11: Risks & Technical Debt (→ tracked and linked to code locations)

Sections 2 (Constraints), 4 (Solution Strategy), 8 (Cross-cutting), and 12 (Glossary) are folded into other sections or generated on demand rather than maintained as separate documents.

---

## Agent Role Templates

A key differentiator: ArchLens ships with predefined agent role templates that specialize AI behavior for different tasks. Each role has access to different subsets of the architecture and applies different quality constraints.

### Role: Architect Agent
**Purpose:** Initial design, building block decomposition, ADR creation.
**Context provided:** Full arc42 (sections 1, 3, 5, 6, 7, 9), quality scenarios, existing ADRs.
**Constraints applied:** Must justify new dependencies, must map new modules to building blocks, must update arc42 if structure changes.
**System prompt snippet:**
```
You are the Architect agent. Before writing any code, ensure every new module
has a designated building block in the arc42. Every external dependency must
have an ADR justifying its inclusion. Your changes must respect the quality
scenarios defined in section 10 — if a scenario might be violated, flag it
before proceeding.
```

### Role: Implementer Agent
**Purpose:** Feature development within an established architecture.
**Context provided:** Relevant building block from arc42, component graph for the feature area, type interfaces, current phase tasks.
**Constraints applied:** Must stay within building block boundaries, must follow existing patterns (provided as examples from the codebase), must write tests matching quality scenarios.
**System prompt snippet:**
```
You are the Implementer agent. You work within the architecture, not around it.
Before implementing, query the building block view to understand where your code
belongs. Use get_component_graph to see existing patterns in this area. Your code
must include tests that verify the relevant quality scenarios. Do not create new
top-level modules without escalating to the Architect agent.
```

### Role: Security Reviewer Agent
**Purpose:** Continuous security posture checks.
**Context provided:** Quality scenarios tagged "security," deployment view (server/client boundary), dependency list, auth/middleware patterns.
**Constraints applied:** Flags any client-side exposure of server logic, checks for auth middleware on API routes, validates env var handling, checks dependency vulnerabilities.
**System prompt snippet:**
```
You are the Security Reviewer agent. After each implementation phase, review:
1. Server/client boundary: are 'use server' directives correctly applied?
   Are secrets confined to server-side code?
2. Auth coverage: does every API route in app/api/ have auth middleware?
3. Input validation: are all user inputs validated before processing?
4. Dependencies: flag any with known CVEs via the quality scenario constraints.
Report findings as structured issues linked to specific code locations.
```

### Role: Quality Guardian Agent
**Purpose:** Enforces quality scenarios from arc42 section 10.
**Context provided:** All quality scenarios, performance budgets, accessibility requirements, test coverage data.
**Constraints applied:** Checks bundle size impact, enforces performance budgets, validates accessibility attributes on components, ensures test coverage thresholds.
**System prompt snippet:**
```
You are the Quality Guardian agent. Your job is to enforce the quality tree
defined in the architecture. For each quality scenario, verify:
- Is there a test that exercises this scenario?
- Does the current code meet the acceptance criteria?
- Has any recent change degraded a quality metric?
Flag violations with severity (blocking / warning / info) and link to the
specific quality scenario and code location.
```

### Role: Phase Manager Agent
**Purpose:** Tracks project progress, manages task transitions, triggers sync.
**Context provided:** Phase plan, task status, arc42 drift report, recent git history.
**Constraints applied:** Enforces phase gates (all tasks complete + quality checks pass before phase transition), triggers arc42 sync at phase boundaries.
**System prompt snippet:**
```
You are the Phase Manager agent. At the end of each development session:
1. Update task status based on code changes and test results.
2. Run the architecture sync check — flag any drift between arc42 and code.
3. If a phase is complete, verify all quality gates before marking it done.
4. Propose arc42 updates where the documented architecture has diverged
   from the implemented code.
5. Update the phase plan with revised estimates if scope has changed.
```

### Role: Onboarding Agent
**Purpose:** Helps new team members (or the developer returning after a break) understand the project.
**Context provided:** Full arc42, phase plan with status, component graph, recent ADRs.
**Constraints applied:** None — this is a read-only, explanatory role.
**System prompt snippet:**
```
You are the Onboarding agent. Help the developer understand this project by
answering questions using the architecture documentation and code index.
Start with the big picture (context view, building blocks) and drill down
on request. When explaining code, always reference the architectural intent
— don't just describe what the code does, explain why it's structured this way.
```

### Role: Code Reviewer Agent
**Purpose:** On-demand code review for correctness, patterns, edge cases, and simplicity.
**Context provided:** Relevant building block, quality scenarios, ADRs for the area, current tasks with acceptance criteria.
**Constraints applied:** Read-only — reports findings, does not modify code. Distinguishes severity levels (bugs vs. suggestions vs. nitpicks).
**Invocation:** Opt-in. Not part of automatic phase gates. The developer invokes this role when they want a second pair of eyes before committing or merging.
**System prompt snippet:**
```
You are the Code Reviewer agent. You are invoked on-demand when the developer
wants a second pair of eyes. Review code for:
1. Correctness — Does it do what the acceptance criteria require?
2. Edge cases — What inputs or states could break this?
3. Patterns — Does it follow how similar things are done elsewhere?
4. Simplicity — Is there a simpler way? Is anything over-engineered?
5. Naming & readability — Would another developer understand this quickly?
Keep reviews actionable. Every finding should be a concrete bug or a specific
suggestion with rationale. You are NOT the Security Reviewer (they handle OWASP,
auth, secrets) and NOT the Quality Guardian (they handle metrics, coverage,
accessibility). Focus on what a senior developer would catch in a pull request.
```

**Note on role boundaries:** The Code Reviewer complements the Security Reviewer and Quality Guardian rather than replacing them. Security and quality concerns are handled by their specialized roles with deeper domain tooling. The Code Reviewer handles the general "does this code make sense?" review that sits between those specialized checks.

---

## Technical Architecture

### Three Analysis Layers

```
┌─────────────────────────────────────────────────┐
│              MCP Server (ArchLens)               │
├─────────────────────────────────────────────────┤
│                                                 │
│  Layer 3: Next.js Convention Analysis            │
│  ├── Route tree from app/ directory structure    │
│  ├── Special files (page, layout, loading, etc.) │
│  ├── Server/client boundary detection            │
│  └── Middleware and API route mapping            │
│                                                 │
│  Layer 2: React Semantic Analysis                │
│  ├── Component hierarchy (JSX composition)       │
│  ├── State boundaries (useState, useReducer)     │
│  ├── Context flow (createContext → Provider →     │
│  │   useContext consumer chain)                  │
│  ├── Effect dependencies (useEffect arrays)      │
│  └── Custom hook dependency graphs               │
│                                                 │
│  Layer 1: TypeScript Compiler API                │
│  ├── Full type resolution and inference          │
│  ├── Import/export dependency graph              │
│  ├── Interface and type alias definitions        │
│  ├── Generic type parameter resolution           │
│  └── Symbol table with source locations          │
│                                                 │
├─────────────────────────────────────────────────┤
│  Arc42 Document Layer                            │
│  ├── Building block ↔ code module mapping        │
│  ├── Quality scenario ↔ test/code mapping        │
│  ├── ADR ↔ affected file mapping                │
│  └── Phase plan ↔ task ↔ code status tracking    │
│                                                 │
├─────────────────────────────────────────────────┤
│  Storage: SQLite (local, no external deps)       │
│  ├── symbols, types, dependencies                │
│  ├── components, contexts, hooks                 │
│  ├── routes, layouts, server_client_boundary     │
│  ├── building_blocks, quality_scenarios, adrs    │
│  └── phases, tasks, drift_log                    │
└─────────────────────────────────────────────────┘
```

### Why TypeScript Compiler API, Not Tree-sitter

For a TypeScript-specific tool, the compiler API is strictly superior:
- **Type resolution:** tree-sitter sees `const x: ReturnType<typeof getUser>` as syntax. The TS compiler resolves it to the actual type.
- **Cross-file resolution:** tree-sitter parses files independently. The TS compiler follows imports and resolves types across the entire project.
- **Generic instantiation:** the compiler can tell you that `useState<User[]>` means the state variable is `User[]` and the setter accepts `User[]` or `SetStateAction<User[]>`.
- **Declaration merging, module augmentation, path aliases:** all handled natively by the compiler, all invisible to tree-sitter.
- **Error tolerance:** `ts.createProgram` with `noEmit: true` can parse and type-check even incomplete or partially broken code.

The cost is that the compiler API is slower than tree-sitter (seconds vs. milliseconds for large projects) and TypeScript-only. Since we're explicitly scoping to TypeScript/React/Next.js, the trade-off is worth it.

### React Analysis Details

The TS compiler API parses `.tsx` correctly but doesn't understand React semantics. Layer 2 adds that understanding by walking the compiler's AST and detecting patterns:

**Component detection:**
- Functions returning JSX (identified by `JsxElement` / `JsxSelfClosingElement` in the return type)
- `React.FC<Props>`, `React.memo()`, `React.forwardRef()` wrappers

**State boundary detection:**
- `useState<T>()` calls → extract T, track the state variable name
- `useReducer(reducer, initialState)` → follow reducer to extract action types and state shape
- Zustand/Jotai stores (detected by import source + API patterns)

**Context flow tracing:**
- `createContext<T>()` → register context with type T
- `<XContext.Provider value={...}>` in JSX → register provider location in component tree
- `useContext(XContext)` → register consumer, link to provider chain

**Component composition:**
- Walk JSX to build parent → child component graph
- Track prop passing (which props are forwarded, spread, transformed)
- Identify render prop patterns and compound components

### Next.js Convention Analysis

This layer is primarily filesystem-based with some AST checks:

**Route tree construction:**
- Walk `app/` directory to build route segments
- Identify route groups `(group)`, dynamic segments `[param]`, catch-all `[...slug]`
- Map each route to its `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`

**Server/client boundary:**
- Detect `'use client'` directive at file top → mark as client component
- Detect `'use server'` directive → mark as server action
- Default (no directive in app/) → server component
- Build the server/client boundary graph (which server components render which client components)

**API routes and middleware:**
- `app/api/**/route.tsx` → extract HTTP methods (GET, POST, etc.)
- `middleware.ts` → extract matcher patterns
- Map auth middleware coverage across routes

---

## Scaling to Multi-Service Architectures

The core ArchLens convention — Plan → Build → Sync → Review with arc42 and agent roles — is architecture-agnostic. But the tooling needs deliberate extension to handle solutions with backend services, microservices, or any multi-project TypeScript setup. This section describes how.

### Where Arc42 Becomes Even More Valuable

Ironically, arc42 was designed for exactly this kind of system. For a single Next.js frontend, the building block view can feel like overhead — you might only have a handful of modules. For a solution with a frontend, two backend services, a shared library, and a database, the building block view becomes essential:

```
Building Block View — Level 1: System Decomposition

┌─────────────────────────────────────────────────────────────┐
│                        Solution                             │
│                                                             │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│  │  web-app  │   │ order-   │   │ inventory│               │
│  │ (Next.js) │──▶│ service  │──▶│ service  │               │
│  │           │   │(Fastify) │   │(Fastify) │               │
│  └──────────┘   └──────────┘   └──────────┘               │
│       │              │              │                       │
│       ▼              ▼              ▼                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐               │
│  │ shared/  │   │  PostgreSQL  │   │  Redis   │            │
│  │ contracts│   │  (orders)    │   │ (cache)  │            │
│  └──────────┘   └──────────┘   └──────────┘               │
└─────────────────────────────────────────────────────────────┘

Level 2 drills into each service:
  order-service/
  ├── api-layer       (route handlers, validation)
  ├── domain          (business logic, entities)
  ├── infrastructure  (database, messaging, external APIs)
  └── contracts       (shared types consumed by web-app)
```

The runtime view (section 6) becomes critical for multi-service solutions because it documents the interaction patterns — "when a user places an order, the web-app calls order-service, which publishes an OrderPlaced event that inventory-service consumes." Without this, the agent working on the frontend has no idea what happens downstream, and the agent working on inventory-service doesn't know what triggers its event handler.

The deployment view (section 7) tracks which services run where — containers, serverless functions, edge functions, managed databases — and that directly informs quality scenarios (latency budgets between services, cold start constraints for serverless, etc.).

### The Contract Layer: Cross-Service Intelligence

Within a single TypeScript project, the compiler resolves all imports. Across services, it can't — a REST call from the frontend to a backend doesn't have a compile-time type relationship (unless you use specific tools). This is where the **contract layer** comes in.

### Contracts as a Core Convention Principle

In the ArchLens convention, contracts are not just a cross-language type-tracing mechanism. They are a **foundational engineering practice** — one of the things ArchLens promotes early because a single contract artifact solves multiple problems simultaneously that developers would otherwise encounter separately, painfully, and late:

**Problem 1: Cross-service type safety.**
The contract is what lets the ArchLens indexer trace dependencies across service boundaries (and across languages, for TS + .NET solutions). Without it, the agent has no visibility into what happens when the frontend calls the backend.

**Problem 2: Contract testing.**
The same schema that ArchLens uses for indexing becomes the source of truth for consumer-driven contract tests. If the order-service says it produces an `OrderResponse` matching the OpenAPI spec, and the web-app says it consumes an `OrderResponse` matching that spec, you can verify both sides independently — without spinning up the entire system for every change. This is one of the most impactful testing strategies for service-based architectures, and most solo devs don't discover it until they've already been bitten by a silent contract break in production.

**Problem 3: Internal service compatibility.**
When a developer changes a service, the Contract Guardian doesn't just check "does the code compile." It checks "does the output still match the contract, and do all consumers still expect this shape." This catches the silent failures that integration tests miss because they only test the happy path with today's data shapes. A renamed field, a changed enum value, a nullable that used to be required — these are the bugs that surface at 2am, not during development.

**Problem 4: External integration documentation.**
When a third party, another team, or even the developer's future self needs to integrate with a service, the contract *is* the documentation. Not a wiki page that's six months stale, not a Postman collection someone exported once — the actual, versioned, tested schema that the running service is verified against. If the order-service has an OpenAPI spec that ArchLens keeps in sync, that spec is always accurate because the contract tests fail otherwise. This eliminates the entire category of "the docs say X but the service actually does Y."

**Problem 5: Future-proofing against your own evolution.**
Six months from now, when the developer wants to add a new consumer (mobile app, partner integration, CLI tool), the contract already exists, is tested, and is documented. They're not reverse-engineering the API from the implementation or reading through controller code to figure out what shape the responses are.

**Problem 6: Enabling parallel development.**
In a small team, if the contract is defined first (even before implementation), the frontend developer can build against it using mocks while the backend developer implements the real service. The contract becomes the handshake that makes parallel work possible without constant coordination.

This is a perfect example of the ArchLens teaching philosophy: the tool encourages contracts early — not as a lecture about best practices, but because the Contract Guardian agent, the cross-service indexing, and the contract tests all *need* them to function. The developer adopts the practice because the tooling makes it the path of least resistance, and then discovers that contracts also gave them tested documentation, integration safety, and a foundation for scaling.

### Contract Formats and Strength Levels

ArchLens supports contracts at different strength levels. The convention recommends the strongest format that fits the project, and the starter templates scaffold the recommended approach automatically:

**Shared type packages (strongest — compile-time safety):**
For pure TypeScript monorepos, a shared package (`packages/contracts/`) that defines API request/response types, event schemas, and shared entities. The TS compiler traces types across service boundaries through the package. Both producer and consumer reference the same type definition — a breaking change is a compile error.

```
packages/
├── contracts/
│   ├── api/
│   │   ├── orders.ts        # OrderRequest, OrderResponse types
│   │   └── inventory.ts     # StockCheckRequest, StockCheckResponse
│   ├── events/
│   │   ├── order-events.ts  # OrderPlaced, OrderCancelled event types
│   │   └── inventory-events.ts
│   └── entities/
│       ├── order.ts         # Shared Order entity type
│       └── product.ts
├── web-app/                  # imports from @solution/contracts
├── order-service/            # imports from @solution/contracts
└── inventory-service/        # imports from @solution/contracts
```

ArchLens indexes the contract package as a building block and traces which services import which contract types. The dependency graph spans services: "web-app depends on OrderResponse from contracts, order-service implements OrderResponse."

**tRPC / Zodios / Hono RPC (strong — end-to-end type inference):**
These frameworks provide end-to-end type safety between client and server through a shared router definition. The TS compiler follows the type relationship directly. ArchLens detects these patterns and maps them to cross-service dependencies automatically.

**OpenAPI / GraphQL schemas (medium — schema-verified):**
For REST services (especially cross-language like TS + .NET), the schema file is the contract artifact. It doesn't give compile-time type tracing, but it enables:
- Generated TypeScript client types (via `openapi-typescript`) verified against the schema
- Generated .NET classes (via NSwag/Kiota) verified against the schema
- Schema-based contract tests on both producer and consumer side
- Always-accurate API documentation as a free byproduct

This is the recommended approach for TS + .NET solutions and the default for cross-language starter templates.

**gRPC / Protocol Buffers (strong — language-neutral binary contract):**
`.proto` files define the contract, code is generated for both languages. Strong typing, backward-compatible evolution rules built in, excellent for internal service-to-service communication. ArchLens parses `.proto` files as contract artifacts and traces generated code on both sides.

**Event schemas — JSON Schema / Avro / CloudEvents (medium — async contract):**
For message-based communication (Redis pub/sub, AWS SQS/SNS, Kafka, NATS), event type definitions serve as contracts. If defined as TypeScript types in the shared contract package, ArchLens traces producers and consumers directly. If defined as JSON Schema or Avro, ArchLens parses them as contract artifacts and verifies that producer output and consumer expectations match.

### Contract Testing: From Convention to Enforcement

ArchLens doesn't just recommend contracts — it scaffolds the test infrastructure to verify them. The starter templates include:

**Provider-side contract tests (does the service honor its contract?):**
```
tests/
├── contract/
│   ├── order-service.provider.test.ts
│   │   # Calls order-service endpoints and verifies responses
│   │   # match the OpenAPI spec / shared types / proto definitions.
│   │   # Runs against the real service (or a thin test harness).
│   │
│   └── inventory-service.provider.test.ts
```

**Consumer-side contract tests (does the consumer expect the right shape?):**
```
tests/
├── contract/
│   ├── web-app.consumer.test.ts
│   │   # Verifies that the web-app's API client code correctly
│   │   # handles all response shapes defined in the contract.
│   │   # Uses recorded/mocked responses from the contract spec.
│   │
│   └── order-service.consumer.test.ts
│       # Verifies order-service correctly handles events
│       # from the shapes defined in event contracts.
```

**Schema drift tests (is the contract still in sync with the implementation?):**
```
tests/
├── contract/
│   └── schema-drift.test.ts
│       # Compares the OpenAPI spec (or shared types) against
│       # the actual service implementation. Catches cases where
│       # someone changed the code but not the contract.
│       # The Contract Guardian agent runs this at sync time.
```

The Quality Guardian agent includes contract test results in phase gate checks: "Phase 2 cannot complete — provider contract test for order-service is failing, OrderResponse is missing the new `estimatedDelivery` field that was added to the shared types."

### How Contracts Flow Through the ArchLens Convention

```
    PLAN                          BUILD                         SYNC
    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │ Architect agent  │          │ Implementer     │          │ Contract        │
    │ defines contract │──────▶   │ implements      │──────▶   │ Guardian runs   │
    │ in arc42 +       │          │ service against │          │ contract tests, │
    │ contracts pkg    │          │ the contract    │          │ checks drift,   │
    │                  │          │                 │          │ flags breaks    │
    └─────────────────┘          └─────────────────┘          └─────────────────┘
           │                            │                            │
           ▼                            ▼                            ▼
    Contract appears in           Provider tests verify       Contract drift report
    building block view           implementation matches      included in phase gate.
    + generates test              contract. Consumer tests    External docs (OpenAPI)
    scaffolds                     verify client code          auto-updated.
                                  handles all shapes.         Compatibility verified
                                                             across all consumers.
```

The key insight: the developer never thinks "I should write contract tests" or "I should keep my API docs updated" or "I should check if this change breaks other services." These things happen because the convention and the agents make them happen as a natural part of the workflow.

**The convention recommendation:** ArchLens strongly encourages explicit contract definitions in every multi-service project because they give the strongest type tracing, enable contract testing, produce always-accurate documentation, and make cross-service dependencies visible to both the compiler and the architecture layer. The starter templates for multi-service projects scaffold the recommended contract approach (shared types for TS-only, OpenAPI for cross-language) by default, including test infrastructure.

### Monorepo Structure for Multi-Service Projects

The starter extends to multi-service solutions with a monorepo layout:

```
my-solution/
├── .archlens/
│   ├── config.yaml                  # Solution-level config
│   ├── index.db                     # Unified SQLite index (all services)
│   │
│   ├── arc42/
│   │   ├── 01-introduction.md
│   │   ├── 03-context.md            # External system boundaries
│   │   ├── 05-building-blocks.md    # Level 1: services. Level 2: per-service
│   │   ├── 06-runtime-views.md      # Cross-service interaction flows
│   │   ├── 07-deployment.md         # Infrastructure: containers, DBs, queues
│   │   ├── 09-decisions/
│   │   ├── 10-quality-scenarios.yaml # Includes cross-service scenarios
│   │   └── 11-risks-debt.md
│   │
│   ├── plan/
│   │   └── ...                      # Solution-level phases and tasks
│   │
│   └── agents/
│       ├── architect.md             # Knows all services + contracts
│       ├── implementer.md           # Scoped to one service at a time
│       ├── security-reviewer.md     # Checks cross-service auth, network
│       ├── quality-guardian.md      # Checks cross-service quality scenarios
│       ├── phase-manager.md
│       ├── onboarding.md
│       ├── code-reviewer.md         # On-demand correctness & pattern review
│       └── contract-guardian.md     # NEW: watches service contracts
│
├── packages/
│   ├── contracts/                   # Shared types, API schemas, events
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │
│   └── shared-utils/                # Shared utilities (logging, errors, etc.)
│
├── apps/
│   ├── web-app/                     # Next.js frontend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── ...
│   │
│   ├── order-service/               # Backend service
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── ...
│   │
│   └── inventory-service/           # Backend service
│       ├── package.json
│       ├── tsconfig.json
│       └── ...
│
├── tests/
│   ├── contract/                    # Cross-service contract tests
│   │   ├── api-contract.test.ts     # Verify API schemas match implementations
│   │   └── event-contract.test.ts   # Verify event producers match consumers
│   ├── integration/                 # Cross-service integration tests
│   └── ...
│
├── turbo.json                       # or nx.json
├── package.json                     # Workspace root
└── tsconfig.base.json
```

### New Agent Role: Contract Guardian

Multi-service architectures introduce a new concern: contract integrity. A change to an API response type in the order-service could break the web-app. A renamed event field could silently break the inventory-service consumer. The Contract Guardian agent watches for this:

**Purpose:** Ensures service contracts remain consistent across producers and consumers.
**Context provided:** Shared contract types, service API definitions, event schemas, cross-service dependency graph.
**Constraints applied:** Any change to a contract type must be verified against all consumers. Breaking changes require an ADR. Schema evolution must follow the project's versioning strategy.
**System prompt snippet:**
```
You are the Contract Guardian agent. Your job is to protect the boundaries
between services. When a contract type changes:
1. Identify all producers and consumers of this contract.
2. Verify the change is backward-compatible, or flag it as breaking.
3. For breaking changes: require an ADR, verify all consumers are updated
   in the same phase, and ensure contract tests cover the new shape.
4. For new contracts: verify they're defined in the shared contracts
   package, not duplicated across services.
```

### New Quality Scenarios for Multi-Service

The quality scenario library extends with cross-service concerns:

```yaml
# Cross-service quality scenarios
CROSS-01:
  name: Service contract consistency
  category: reliability
  scenario: Change a shared API type in contracts package
  expected: All consuming services either compile cleanly or are flagged
  verification: contract tests in tests/contract/

CROSS-02:
  name: Cross-service latency budget
  category: performance
  scenario: Full user flow from web-app through order-service to inventory-service
  expected: End-to-end response under 500ms (p95)
  linked_services: [web-app, order-service, inventory-service]

CROSS-03:
  name: Service-to-service authentication
  category: security
  scenario: Direct request to order-service bypassing web-app
  expected: Returns 401 — services authenticate each other, not just end users
  linked_services: [order-service, inventory-service]

CROSS-04:
  name: Graceful degradation
  category: reliability
  scenario: inventory-service is unavailable
  expected: order-service returns degraded response (order accepted, stock check pending)
  linked_services: [order-service, inventory-service]

CROSS-05:
  name: Event processing idempotency
  category: reliability
  scenario: Same OrderPlaced event delivered twice
  expected: inventory-service processes it once, second delivery is a no-op
  linked_services: [inventory-service]
```

### MCP Tool Extensions for Multi-Service

```
# Get cross-service dependency graph
get_service_graph: {}
→ Returns services, their contracts, and dependency relationships.
  Shows which service produces/consumes which contract types.

# Analyze impact of a contract change
analyze_contract_impact: {
  "contract_type": "OrderResponse",
  "change": "added field 'estimatedDelivery'"
}
→ Returns all services affected, whether the change is breaking,
  and which tests/code need updates.

# Get the runtime flow for a user action
get_runtime_flow: {
  "flow": "place-order"
  // references arc42 section 6 runtime view
}
→ Returns the step-by-step flow across services: which service handles
  each step, what contracts are exchanged, what can fail and how
  failures are handled. Links to actual code in each service.

# Index a specific service (in a monorepo)
index_service: {
  "service": "order-service",
  "path": "apps/order-service"
}
→ Indexes one service using its tsconfig.json, including resolution
  of imports from shared contract packages.
```

### What This Means for the Phasing

Multi-service support doesn't require a separate phase — it's an extension of existing phases:

- **Phase 0** adds monorepo-aware project templates and contract package scaffolding
- **Phase 1** extends the TS compiler indexing to handle workspace references and cross-package type resolution
- **Phase 3** adds cross-service building block mapping and contract-aware drift detection
- **Phase 4** adds the Contract Guardian role and cross-service quality scenarios to the sync loop

The key design decision: the SQLite index is **solution-level**, not per-service. It stores symbols from all services in a single database with service tags, so cross-service queries ("who consumes OrderResponse?") are simple SQL joins rather than cross-database lookups.

---

## MCP Tool API (Draft)

### Project Lifecycle Tools

```
# Initialize a new project with ArchLens scaffolding
init_project: {
  "name": "my-app",
  "template": "nextjs-app-router",  // or "react-vite", "fullstack-monorepo",
                                    // "nextjs-with-services", "api-service"
  "features": ["auth", "database", "api"],
  "quality_priorities": ["security", "performance", "accessibility"],
  "services": []  // optional: ["order-service", "inventory-service"]
                   // triggers monorepo scaffolding with contract package
}
→ Creates project structure, initial arc42 skeleton, phase plan, agent templates

# Get current project status
get_project_status: {}
→ Returns current phase, task completion %, quality gate status, drift warnings

# Advance to next phase (with gate checks)
complete_phase: {
  "phase_id": "phase-2-core-features",
  "notes": "All tasks complete, auth flow tested"
}
→ Runs quality gates, triggers arc42 sync, returns pass/fail with details
```

### Architecture Tools

```
# Get the full building block view (concise, token-efficient)
get_building_blocks: {}
→ Returns building block tree with module mappings and brief descriptions

# Get detailed view of one building block with linked code
get_building_block: {
  "block_id": "auth-module"
}
→ Returns arc42 description, code modules, interfaces, quality scenarios, ADRs

# Get quality scenarios (optionally filtered)
get_quality_scenarios: {
  "category": "security"  // or "performance", "accessibility", "reliability"
}
→ Returns scenarios with acceptance criteria, linked tests, current status

# Get architecture decisions relevant to a code area
get_relevant_adrs: {
  "file_path": "src/lib/auth/session.ts"
  // or "building_block": "auth-module"
}
→ Returns ADRs that affect this code, with rationale and constraints

# Check for architecture drift
check_drift: {}
→ Compares arc42 building blocks against actual code structure,
  returns discrepancies (new modules not documented, documented modules
  missing, dependency violations)

# Propose arc42 update based on code changes
propose_arc42_update: {
  "changes_since": "last-sync"  // or a git ref
}
→ Analyzes code changes, generates proposed updates to arc42 sections
```

### Code Intelligence Tools

```
# Get the component tree for a feature area / route
get_component_graph: {
  "entry": "app/checkout/page.tsx"
  // or "building_block": "checkout-flow"
}
→ Returns component hierarchy, prop interfaces, state boundaries,
  context providers/consumers — all in one structured response

# Get the dependency graph for a module
get_dependency_graph: {
  "module": "src/lib/auth",
  "depth": 2,
  "direction": "both"  // "dependents", "dependencies", or "both"
}
→ Returns import/export graph with type information

# Get symbol with full type information
get_symbol: {
  "symbol_id": "src/lib/auth/session.ts::createSession#function"
}
→ Returns full source, resolved type signature, callers, callees,
  linked building block and quality scenarios

# Search symbols with architectural context
search_symbols: {
  "query": "authenticate",
  "building_block": "auth-module",  // optional filter
  "kind": "function"  // optional filter
}
→ Returns matching symbols with their architectural context

# Get the Next.js route map
get_route_map: {}
→ Returns complete route tree with server/client boundaries,
  middleware coverage, layout nesting, linked building blocks

# Get server/client boundary analysis
get_boundary_analysis: {
  "route": "/checkout"  // optional, defaults to full app
}
→ Returns which components are server vs. client, where the
  boundary crossings happen, what data flows across boundaries
```

### Planning & Task Tools

```
# Get the phase plan
get_phase_plan: {}
→ Returns all phases with tasks, status, dependencies, estimates

# Get tasks for current phase with context
get_current_tasks: {}
→ Returns tasks with: description, acceptance criteria, relevant
  building blocks, relevant quality scenarios, suggested file locations

# Update task status
update_task: {
  "task_id": "task-2.3-payment-integration",
  "status": "in-progress",  // or "done", "blocked"
  "notes": "Stripe webhook handler implemented, needs error handling"
}

# Create a new task (within current phase)
create_task: {
  "phase_id": "phase-2",
  "title": "Add rate limiting to API routes",
  "building_block": "api-gateway",
  "quality_scenarios": ["security-02-rate-limiting"],
  "acceptance_criteria": [
    "All /api routes enforce 100 req/min per IP",
    "Rate limit headers included in responses",
    "429 response with retry-after when exceeded"
  ]
}
```

### Agent Role Tools

```
# Activate an agent role (loads relevant context and constraints)
activate_role: {
  "role": "security-reviewer"
  // or "architect", "implementer", "quality-guardian",
  //    "phase-manager", "onboarding"
}
→ Returns the role's system prompt, pre-loaded context, and active constraints

# Get role-specific analysis
run_role_check: {
  "role": "security-reviewer",
  "scope": "last-commit"  // or "current-phase", "full-project"
}
→ Returns findings structured by the role's concerns
```

### Proactive Guidance Tools

These tools power the "right question at the right time" behavior — they analyze the current context and surface what the developer should be thinking about.

```
# Get contextual guidance for a code change
get_guidance: {
  "action": "adding-api-route",  // or "new-component", "new-dependency",
                                 // "new-building-block", "modifying-auth"
  "file_path": "app/api/orders/route.ts"
}
→ Returns relevant quality scenarios, architectural constraints,
  existing patterns to follow, and questions the developer should consider.
  Example: "SEC-01 requires auth middleware on all API routes.
  See middleware.ts for the existing pattern. Should this route
  be public or protected?"

# Get questions the developer should answer before proceeding
get_open_questions: {
  "scope": "current-phase"  // or "building-block:checkout-flow"
}
→ Returns unresolved architectural questions, missing ADRs,
  quality scenarios without linked tests, building blocks without
  clear boundaries. Prioritized by impact.
  Example: "checkout-flow has no ADR for the payment provider choice.
  Consider: Stripe vs. LemonSqueezy? This affects error handling patterns,
  webhook design, and PCI compliance scope."

# Get a practice-aware review of recent changes
get_practice_review: {
  "since": "last-commit"  // or "last-session", "last-phase"
}
→ Structured review covering:
  - Architecture: any new cross-boundary dependencies?
  - Security: new routes without auth? secrets in wrong places?
  - Testing: new code without test coverage? quality scenarios at risk?
  - Documentation: arc42 drift detected?
  - Complexity: any module exceeding complexity thresholds?
  Returns actionable items, not just warnings.
```

---

## Project Phases (How We Build ArchLens Itself)

### Phase 0: Foundation (Weeks 1–2)
**Goal:** Project scaffolding, core data model, minimal viable MCP server.

**Deliverables:**
- SQLite schema for symbols, building blocks, quality scenarios, phases, tasks
- Arc42 template generator (markdown files with YAML frontmatter for machine readability)
- Phase plan template generator
- Basic MCP server skeleton with `init_project` and `get_project_status`
- Canonical agent role definitions in `.archlens/agents/_shared/`
- `archlens generate-agent-configs` command for Claude Code and Copilot
- Generated project context files: `CLAUDE.md`, `.github/copilot-instructions.md`

**Acceptance criteria:**
- `init_project` creates a Next.js project with arc42 skeleton and phase plan
- Agent role configs are generated for both Claude Code (`.claude/agents/`) and Copilot (`.github/agents/`)
- Canonical role definitions transform correctly to both platform formats
- SQLite database is created and schema is validated

### Phase 1: TypeScript Code Intelligence (Weeks 3–5)
**Goal:** Layer 1 analysis — full TypeScript compiler API integration.

**Deliverables:**
- TS compiler API wrapper that indexes a project: symbols, types, dependencies
- Import/export dependency graph stored in SQLite
- MCP tools: `get_symbol`, `search_symbols`, `get_dependency_graph`
- Incremental re-indexing based on content hashing (file-level)
- Stable symbol ID scheme compatible with jCodeMunch format

**Acceptance criteria:**
- Can index a 500-file TypeScript project in under 30 seconds
- Dependency graph correctly resolves path aliases and barrel exports
- Symbol search returns results with resolved type signatures
- Re-indexing only processes changed files

**Known limitations (Phase 1a):**
- Incremental indexing tracks file hashes via the `symbols` table. Files with no extractable symbols (e.g. barrel/re-export-only files) have no stored hash and are reprocessed on every run. A dedicated file-hash table would fix this — deferred until it becomes a performance concern.
- Dependency extraction (imports, calls, extends, implements, uses_type) is deferred to Phase 1b. Phase 1a covers symbol extraction only.

### Phase 2: React & Next.js Analysis (Weeks 6–8)
**Goal:** Layers 2 and 3 — React semantic analysis and Next.js convention detection.

**Deliverables:**
- Component graph extraction (hierarchy, props, state, context)
- Next.js route tree builder
- Server/client boundary analyzer
- MCP tools: `get_component_graph`, `get_route_map`, `get_boundary_analysis`

**Acceptance criteria:**
- Component graph correctly identifies context provider/consumer chains across 3+ levels
- Route map accurately reflects all `app/` directory conventions
- Server/client boundary analysis flags client components that import server-only modules
- State boundaries correctly identify useState, useReducer, and Zustand stores

### Phase 3: Architecture Bridge (Weeks 9–11)
**Goal:** Connect arc42 documentation to code index.

**Deliverables:**
- Building block ↔ code module mapping (maintained in arc42 YAML frontmatter)
- Quality scenario ↔ test/code location mapping
- ADR ↔ affected file mapping
- Architecture drift detection
- MCP tools: `get_building_blocks`, `get_building_block`, `get_quality_scenarios`, `get_relevant_adrs`, `check_drift`

**Acceptance criteria:**
- Can answer "which building block does this file belong to?" for any file
- Quality scenarios link to specific test files and code locations
- Drift detection catches: undocumented modules, missing documented modules, dependency violations
- Building block queries return code-level details (interfaces, key symbols) alongside arc42 descriptions

### Phase 4: Planning & Sync Loop (Weeks 12–14)
**Goal:** Phase management, task tracking, and the arc42 sync loop — both interactive and CI/CD.

**Deliverables:**
- Phase plan manager with gate checks
- Task tracking linked to code changes (via git diff analysis)
- Arc42 auto-update proposals (generated after each phase)
- MCP tools: `get_phase_plan`, `get_current_tasks`, `complete_phase`, `propose_arc42_update`
- Agent role activation tool with pre-loaded context (adapted per platform via client detection)
- GitHub Action workflow for async sync loop via Copilot coding agent
- Claude Code skill (`archlens-sync.md`) for interactive sync triggers
- Copilot hook (`session-end.json`) for automatic sync on session close

**Acceptance criteria:**
- Phase gates enforce: all tasks complete, quality checks pass, no critical drift
- Task status can be inferred from code state (test passing, file exists, etc.)
- Arc42 update proposals are specific and actionable ("Add XModule to building block view")
- Role activation loads the correct context subset and constraints
- Sync loop works both interactively (Claude Code terminal) and as CI/CD (GitHub Action)
- The `activate_role` tool detects the requesting agent and adapts response format

### Phase 5: Starter Experience & Polish (Weeks 15–16)
**Goal:** The end-to-end starter project experience.

**Deliverables:**
- `npx create-archlens` CLI that scaffolds a project with everything pre-configured
- Interactive setup wizard: project name, features, quality priorities, team size, **agent platforms** (Claude Code, Copilot, Gemini, Codex — defaults to Claude Code + Copilot)
- Pre-built quality scenario library (common security, performance, accessibility scenarios)
- Documentation and walkthrough
- Example project demonstrating the full lifecycle
- GitHub Action workflow template for Copilot coding agent sync loop

**Acceptance criteria:**
- A developer can go from `npx create-archlens` to having an indexed, arc42-documented, phase-planned project in under 5 minutes
- The example project demonstrates a complete phase cycle: plan → implement → sync
- All seven agent roles work out of the box with Claude Code and Copilot
- Generated configs are correct for all selected platforms
- The Copilot coding agent can run the sync loop as a GitHub Action

---

### Future Phases: Expanding the Practice

These phases extend ArchLens from a planning/architecture tool into a comprehensive development practice platform. They're listed here to show the trajectory and ensure earlier phases don't preclude them architecturally.

### Phase 6: Code Metrics & Health Dashboard
**Goal:** Quantitative visibility into codebase health, tied to quality scenarios.

**Concept:**
Developers often don't know their codebase is degrading until it's painful. ArchLens can surface metrics early and tie them to architectural meaning — not just "your complexity score went up" but "the checkout-flow building block's complexity increased by 40% this phase, which threatens quality scenario MAINT-01."

**Capabilities:**
- **Complexity tracking per building block:** Cyclomatic complexity, cognitive complexity, file/function size — tracked over time and mapped to building blocks, not just files
- **Dependency health:** Fan-in/fan-out per module, coupling between building blocks, detection of "god modules" that everything depends on
- **Test coverage mapped to quality scenarios:** Not just "80% line coverage" globally, but "SEC-01 has 95% coverage, PERF-02 has 0%" — making gaps visible and prioritized
- **Bundle analysis for Next.js:** Per-route bundle sizes, tree-shaking effectiveness, server/client code split ratios — tied to PERF-* quality scenarios
- **Trend tracking:** Metrics over time (per phase, per sprint, per week) so the developer sees whether health is improving or degrading
- **MCP tools:** `get_health_report`, `get_building_block_metrics`, `get_metric_trends`

The Phase Manager agent incorporates these metrics into phase gate checks: "Phase 2 complete, but checkout-flow complexity is trending up — consider a refactoring task in Phase 3."

### Phase 7: Automated Security & Quality Scanning
**Goal:** Shift-left security and quality checks, integrated into the agent workflow.

**Concept:**
Most solo devs don't run security scanners because setting them up is annoying and the output is noisy. ArchLens integrates scanning into the agent loop with architectural context — the Security Reviewer agent doesn't just report "possible XSS in file X line Y" but "possible XSS in the checkout-flow building block, which handles payment data and is subject to quality scenario SEC-03."

**Capabilities:**
- **Dependency vulnerability scanning:** Check `package.json` against known CVE databases, prioritized by which building blocks are affected and which quality scenarios are at risk
- **Static analysis integration:** ESLint security rules, TypeScript strict mode enforcement, custom rules generated from quality scenarios (e.g., "no `any` types in the auth-module building block")
- **Secret detection:** Scan for hardcoded secrets, API keys, tokens — especially important for the server/client boundary in Next.js where a misplaced secret ends up in the client bundle
- **OWASP Top 10 checks:** Automated checks for common vulnerabilities, contextualized with architectural information ("This SQL query in the data-access building block doesn't use parameterized queries")
- **Accessibility auditing:** Run axe-core against rendered pages, map violations to components and building blocks, link to A11Y-* quality scenarios
- **MCP tools:** `run_security_scan`, `run_quality_scan`, `get_vulnerability_report`

The key differentiator from standalone scanners is *context*: findings are linked to building blocks, quality scenarios, and architectural decisions, making them immediately actionable rather than a wall of noise.

### Phase 8: Visual Planning & Code Overview Tools
**Goal:** Make the architecture, dependencies, and project status visible and navigable.

**Concept:**
Architecture diagrams are one of the most useful artifacts for understanding a system, but drawing and maintaining them is tedious. ArchLens already has all the data — building blocks, dependencies, component trees, route maps, quality scenario coverage. Rendering that data as interactive visuals is a natural extension.

**Capabilities:**
- **Building block diagram:** Auto-generated from arc42 section 5 + code analysis. Shows modules, their dependencies, and health indicators (complexity, coverage, drift status). Clickable to drill into code.
- **Component tree visualization:** Interactive React component hierarchy for a given route or feature area. Shows state boundaries, context flow, prop passing. Helps developers understand the render tree without reading every file.
- **Route map visualization:** The Next.js route tree rendered as a visual, showing server/client boundaries, layout nesting, middleware coverage, and auth protection status.
- **Dependency graph explorer:** Interactive graph of module dependencies. Highlight circular dependencies, visualize coupling between building blocks, trace import chains.
- **Phase progress dashboard:** Visual representation of project phases, task completion, quality gate status, and metric trends. A developer returning to the project sees the big picture in seconds.
- **Quality scenario coverage map:** Heat map showing which parts of the codebase are well-covered by quality scenarios and tests, and which are bare.

**Implementation approach:** These visuals can be delivered as:
- A local web dashboard (served by the MCP server, opened in browser)
- React artifacts generated on demand in Claude conversations
- Mermaid diagrams embedded in arc42 documents (auto-updated by the sync loop)
- VS Code extension panels (longer-term)

The auto-generation aspect is critical: these aren't diagrams someone draws and maintains. They're rendered from the live index data, so they're always current. The sync loop ensures the underlying data stays accurate, and the visuals reflect reality.

### Phase 9: Convention Documentation & Community
**Goal:** Package the ArchLens convention as an independent, adoptable practice.

**Deliverables:**
- Standalone convention guide (independent of the tool) describing the Plan → Build → Sync → Review loop, agent roles, arc42 subset, quality scenario patterns, and testing structure
- Adaptation guides for different stacks (the convention pattern applied beyond TypeScript/React)
- Case studies from real projects demonstrating the lifecycle
- Template library: reusable quality scenarios, agent role templates, arc42 skeletons for common project types (SaaS, e-commerce, internal tool, API service)
- Community contribution model for templates and agent roles

### Phase 10: .NET 10 Backend Support (~10–13 weeks, can run in parallel after Phase 1)
**Goal:** Extend code intelligence to .NET/C# services, enabling full-stack coverage for TypeScript frontend + .NET backend architectures.

**Why this matters:**
Next.js frontend + .NET backend is one of the most common enterprise patterns, and a very attractive setup for solo devs and small teams who want the .NET ecosystem's performance, type safety, and mature tooling on the backend. Today, no tool gives an agent cross-stack visibility across this combination. ArchLens with .NET support would be the first.

**What's already done (zero extra effort):**
Everything above Layer 1 is language-agnostic by design. Arc42, agent roles, quality scenarios, the planning system, the sync loop, the MCP tool API, and the SQLite schema all work for .NET services without modification. This is roughly 60–70% of the system.

**Layer 1 equivalent: Roslyn (.NET Compiler Platform)**

Roslyn (`Microsoft.CodeAnalysis`) is the C#/.NET equivalent of the TypeScript compiler API — and in many ways it's more mature. The mapping is close to 1:1:

- `ts.TypeChecker` → `SemanticModel.GetTypeInfo()` — full type resolution including generics, nullability, inheritance
- `ts.Symbol` → `ISymbol` hierarchy (`INamedTypeSymbol`, `IMethodSymbol`, `IPropertySymbol`, etc.) — richer than TS, includes accessibility modifiers, attributes, XML doc comments
- Import resolution → `using` directives + `.csproj` project references — Roslyn resolves cross-project dependencies through the solution model
- AST walking → `SyntaxWalker` / `CSharpSyntaxVisitor` — pattern-based visiting, very clean API
- Error tolerance → `Compilation` object works with incomplete/broken code, reports diagnostics separately
- Workspace model → `MSBuildWorkspace.OpenSolutionAsync()` loads an entire `.sln` with all project references resolved

**Implementation approach:** A separate .NET CLI tool (`archlens-dotnet-indexer`) that:
1. Loads the `.sln` or `.csproj` via Roslyn's MSBuild workspace
2. Walks the syntax trees and semantic model to extract symbols, types, dependencies
3. Writes to the same SQLite database using the same schema (symbols tagged with `language: "csharp"` and `service: "order-service"`)
4. Runs as a subprocess called by the main ArchLens MCP server

This keeps the MCP server in TypeScript/Node.js (where MCP tooling is strongest) while using Roslyn natively in .NET (where it actually works). The two processes communicate through the shared SQLite database — no complex IPC needed.

**Layer 2/3 equivalent: ASP.NET Core framework analysis**

| .NET Pattern | Detection Method | Maps To |
|---|---|---|
| Controllers (`ControllerBase` subclasses) | Roslyn type hierarchy check | API endpoints → building block interfaces |
| Minimal APIs (`app.MapGet/Post/...`) | Syntax pattern matching on `WebApplication` method chains | API endpoints → building block interfaces |
| Middleware pipeline (`app.Use...()`) | Call chain analysis on `WebApplicationBuilder` | Middleware coverage (like Next.js middleware) |
| DI registration (`Services.AddScoped<I,T>()`) | Syntax/semantic analysis of `Program.cs` / startup | **Real dependency graph** — more reliable than import analysis because DI is how .NET services actually wire together |
| Authorization (`[Authorize]`, policies) | Attribute detection on controllers/endpoints | Auth coverage for Security Reviewer |
| Entity Framework (`DbContext`, entities) | Type hierarchy + `DbSet<T>` properties | Data model extraction, building block data layer |
| Background services (`IHostedService`) | Interface implementation detection | Async processing, event handler discovery |
| MediatR/MassTransit handlers | Generic interface implementation (`IRequestHandler<T>`, `IConsumer<T>`) | Event/command pattern → runtime view flows |
| gRPC services | `.proto` file parsing + generated code detection | Strong cross-language contracts |

**The DI container is a superpower:** In .NET, the dependency injection container is the source of truth for how services wire together. Analyzing the DI registrations gives you a more accurate dependency graph than import analysis alone — it tells you not just "class A references interface B" but "at runtime, interface B resolves to class C with a scoped lifetime." This is information the TS compiler API can't provide for JavaScript/TypeScript projects.

**Cross-language contract bridge:**

For mixed TS + .NET solutions, the contract layer extends with:

| Contract Approach | How It Works | ArchLens Support |
|---|---|---|
| OpenAPI (Swagger) | .NET generates spec, TS generates client types from it | Parse both sides, verify consistency at sync time |
| Shared JSON Schema | Language-neutral schema generates both C# classes and TS types | Schema is the contract artifact in arc42 |
| gRPC / Protocol Buffers | `.proto` files generate both C# and TS code | Parse `.proto` as contract, trace generated code on both sides |
| Manual type sync | Developer maintains parallel types (fragile) | Contract Guardian flags divergence by comparing type shapes |

The recommended convention: **OpenAPI-first development** for REST APIs (generate the spec from .NET controllers via Swashbuckle/NSwag, generate TS client types from the spec), or **gRPC** for internal service-to-service communication. Both give the Contract Guardian a language-neutral artifact to verify against both sides.

**New quality scenarios specific to .NET:**

```yaml
DOTNET-01:
  name: DI lifecycle correctness
  category: reliability
  scenario: Scoped service injected into singleton
  expected: Build-time warning or architectural fitness test catches it
  verification: Roslyn analyzer or DI validation in tests

DOTNET-02:
  name: EF query performance
  category: performance
  scenario: N+1 query detection in EF Core navigation properties
  expected: All collection navigations use explicit Include() or projection
  verification: EF query logging in integration tests

DOTNET-03:
  name: Middleware ordering
  category: security
  scenario: Authorization middleware must run after authentication
  expected: UseAuthentication() always precedes UseAuthorization()
  verification: Middleware pipeline analysis at index time

DOTNET-04:
  name: Async consistency
  category: reliability
  scenario: All I/O-bound operations use async/await
  expected: No sync-over-async patterns (Task.Result, .Wait())
  verification: Roslyn syntax analysis

DOTNET-05:
  name: API versioning
  category: maintainability
  scenario: Breaking API change introduced
  expected: New version endpoint created, old version preserved or deprecated
  verification: OpenAPI spec diff at sync time
```

**Agent role adaptations for .NET:**

The agent roles stay the same, but their context and checks expand:

- **Implementer** gets .NET-specific patterns: DI registration conventions, EF Core migration awareness, middleware ordering rules, nullable reference type enforcement
- **Security Reviewer** checks ASP.NET-specific concerns: CORS configuration, anti-forgery tokens, data protection API usage, auth attribute coverage, HTTPS enforcement
- **Quality Guardian** adds .NET metrics: EF query count per request, DI container validation, assembly coupling metrics
- **Architect** understands .NET solution structure (`.sln` → projects → layers) and maps it to arc42 building blocks

**Effort breakdown:**

| Component | Weeks | Notes |
|---|---|---|
| Roslyn indexer CLI (Layer 1) | 3–4 | .NET CLI tool. Symbol extraction, type resolution, dependency graph. Roslyn APIs are well-documented and map closely to what we do with TS compiler. |
| ASP.NET framework analysis (Layer 2/3) | 2–3 | Controller/minimal API detection, DI analysis, middleware pipeline, auth scanning, EF model extraction. Patterns are standardized. |
| Cross-language contract bridge | 2 | OpenAPI parsing, `.proto` parsing, cross-language dependency stitching in the unified index. |
| Agent role adaptation | 1 | .NET-specific guidance, quality scenarios, pattern libraries for each role. |
| Quality scenario library | 0.5 | .NET-specific scenarios as shown above, plus adaptation of existing CROSS-* scenarios. |
| Starter template for TS + .NET | 0.5 | Monorepo template with Next.js app + .NET service + OpenAPI contract generation. |
| Testing and integration | 1–2 | Mixed TS + .NET solution indexing, cross-language queries, contract verification. |
| **Total** | **~10–13** | Can start after Phase 1 (TS indexing) is stable. Runs in parallel with Phases 2–4. |

**Feasibility verdict:** Very feasible. Roslyn is a more mature analysis platform than the TS compiler API, .NET patterns are more standardized than the JS ecosystem, and the ArchLens architecture already separates language-specific indexing from everything else. The DI container analysis is actually a *better* dependency graph than anything available in the TypeScript world. The main engineering cost is building the Roslyn indexer CLI — everything else is incremental extension of existing components.

---

## Arc42 Quality Scenarios — Why They Matter for Agents

Arc42 section 10 defines quality requirements as concrete, testable scenarios. This is exactly what agents need — not vague guidelines like "the app should be secure," but specific, verifiable constraints.

### Example Quality Tree for a Typical Next.js App

```
Quality Goals
├── Security
│   ├── SEC-01: Auth on all API routes
│   │   Scenario: Any request to /api/* without valid session token
│   │   Expected: Returns 401 within 50ms
│   │   Linked code: middleware.ts, src/lib/auth/*
│   │   Linked test: tests/security/auth-middleware.test.ts
│   │
│   ├── SEC-02: No secrets in client bundles
│   │   Scenario: Build the project, inspect client JS bundles
│   │   Expected: No env vars without NEXT_PUBLIC_ prefix appear
│   │   Linked code: .env*, next.config.ts
│   │   Linked test: tests/security/bundle-check.test.ts
│   │
│   └── SEC-03: Input validation on all mutations
│       Scenario: Send malformed data to any POST/PUT/DELETE route
│       Expected: Returns 400 with validation errors, no server error
│       Linked code: src/lib/validation/*
│       Linked test: tests/security/input-validation.test.ts
│
├── Performance
│   ├── PERF-01: Initial page load under 3s on 3G
│   │   Scenario: Load landing page on simulated slow 3G
│   │   Expected: LCP < 2.5s, FID < 100ms, CLS < 0.1
│   │   Linked code: app/(public)/page.tsx, components shared
│   │   Linked test: tests/performance/lighthouse.test.ts
│   │
│   └── PERF-02: API responses under 200ms (p95)
│       Scenario: 100 concurrent requests to /api/products
│       Expected: p95 latency < 200ms
│       Linked code: app/api/products/route.ts
│       Linked test: tests/performance/api-load.test.ts
│
├── Accessibility
│   ├── A11Y-01: WCAG 2.1 AA compliance
│   │   Scenario: Run axe-core on all pages
│   │   Expected: Zero violations at AA level
│   │   Linked code: all components in src/components/*
│   │   Linked test: tests/accessibility/axe-audit.test.ts
│   │
│   └── A11Y-02: Full keyboard navigation
│       Scenario: Navigate entire checkout flow using only keyboard
│       Expected: All interactive elements reachable, focus visible
│       Linked code: app/checkout/**, src/components/forms/*
│       Linked test: tests/accessibility/keyboard-nav.test.ts
│
└── Maintainability
    ├── MAINT-01: No circular dependencies
    │   Scenario: Run dependency analysis
    │   Expected: Zero circular imports between building blocks
    │   Linked code: entire src/ tree
    │   Linked test: tests/architecture/circular-deps.test.ts
    │
    └── MAINT-02: Test coverage > 80% on business logic
        Scenario: Run coverage report on src/lib/*
        Expected: Line coverage > 80%, branch coverage > 70%
        Linked code: src/lib/**
        Linked test: coverage report via vitest
```

Each scenario is machine-readable (stored as YAML), linked to specific code and tests, and queryable by any agent role. The Security Reviewer agent checks SEC-* scenarios. The Quality Guardian checks all of them. The Implementer agent sees relevant scenarios when working in a code area.

---

## File Structure (Generated Project)

```
my-app/
├── .archlens/
│   ├── config.yaml                    # ArchLens configuration
│   ├── index.db                       # SQLite database (git-ignored)
│   │
│   ├── arc42/
│   │   ├── 01-introduction.md         # Goals, quality priorities
│   │   ├── 03-context.md              # System boundary, externals
│   │   ├── 05-building-blocks.md      # Module decomposition
│   │   ├── 06-runtime-views.md        # Key interaction flows
│   │   ├── 07-deployment.md           # Server/client/edge split
│   │   ├── 09-decisions/              # One ADR per file
│   │   │   ├── 001-nextjs-app-router.md
│   │   │   ├── 002-auth-strategy.md
│   │   │   └── ...
│   │   ├── 10-quality-scenarios.yaml  # Machine-readable quality tree
│   │   └── 11-risks-debt.md           # Known risks, tech debt log
│   │
│   ├── plan/
│   │   ├── phases.yaml                # Phase definitions with gates
│   │   ├── tasks/                     # One file per phase
│   │   │   ├── phase-1-foundation.yaml
│   │   │   ├── phase-2-core-features.yaml
│   │   │   └── ...
│   │   └── sync-log.md               # History of arc42 sync events
│   │
│   └── agents/
│       ├── architect.md               # Agent role template
│       ├── implementer.md
│       ├── security-reviewer.md
│       ├── quality-guardian.md
│       ├── phase-manager.md
│       ├── onboarding.md
│       └── code-reviewer.md          # Opt-in code review
│
├── app/                               # Next.js app router
│   ├── layout.tsx
│   ├── page.tsx
│   └── ...
│
├── src/
│   ├── components/
│   ├── lib/
│   └── ...
│
├── tests/
│   ├── security/
│   ├── performance/
│   ├── accessibility/
│   └── architecture/                  # Architectural fitness functions
│       ├── circular-deps.test.ts
│       ├── building-block-boundaries.test.ts
│       └── ...
│
├── CLAUDE.md                          # For Claude Code (references .archlens/)
├── .cursorrules                       # For Cursor (references .archlens/)
├── tsconfig.json
├── next.config.ts
└── package.json
```

---

## Arc42 Document Format

Arc42 sections use markdown with YAML frontmatter for machine readability. Example for the building block view:

```markdown
---
section: building-blocks
version: 2
last_synced: 2026-03-08T10:00:00Z
---

# Building Block View

## Level 1: System Decomposition

### auth-module
- **Path:** `src/lib/auth/`
- **Responsibility:** Session management, token validation, OAuth flows
- **Interfaces exposed:** `createSession()`, `validateToken()`, `getCurrentUser()`
- **Quality scenarios:** SEC-01, SEC-02
- **ADRs:** 002-auth-strategy

### checkout-flow
- **Path:** `app/checkout/`, `src/lib/checkout/`
- **Responsibility:** Cart management, payment processing, order confirmation
- **Interfaces exposed:** `CartContext`, `useCart()`, `processPayment()`
- **Quality scenarios:** PERF-01, SEC-03, A11Y-02
- **ADRs:** 003-payment-provider

[...more building blocks...]
```

The YAML frontmatter lets ArchLens parse and query these documents programmatically, while the markdown body remains human-readable and editable.

---

## Agent Platform Support Strategy

The ArchLens MCP server — the core code intelligence and architecture tools — is agent-agnostic by design. The MCP tool API (`get_building_blocks`, `search_symbols`, `check_drift`, etc.) works with any MCP-compatible agent. However, the surrounding infrastructure — how agents discover context, how roles are configured, how the sync loop triggers — differs substantially across platforms. This section maps those differences and defines the adapter architecture.

### Platform Landscape (as of March 2026)

All major AI coding agents now support MCP, but they differ in how they handle project context, subagent delegation, persistent memory, and CI/CD integration. Here's a detailed comparison:

| Concern | Claude Code | GitHub Copilot | Gemini CLI / Antigravity | Codex CLI |
|---|---|---|---|---|
| **Project context file** | `CLAUDE.md` | `.github/copilot-instructions.md` + `AGENTS.md` (CLI) | `GEMINI.md` | `AGENTS.md` |
| **MCP config format** | JSON (`claude_desktop_config.json` or `claude mcp add`) | JSON in repo settings (coding agent) + `mcp.json` (IDE) | `settings.json` or `mcp_config.json` | TOML (`config.toml`) |
| **Custom agents / roles** | `.claude/agents/*.md` with YAML frontmatter | `.github/agents/*.agent.md` (org-shareable) | `.agents/` (Antigravity) or experimental (CLI) | Multi-agent TUI, plugins |
| **Skills** | `.claude/skills/*.md` (auto-invoked by relevance) | `.github/skills/` (open Agent Skills standard) | `.agents/skills/` directories | Skills via plugins |
| **Hooks** | `.claude/hooks/` (pre/post tool) | `.github/hooks/*.json` (richest set: preToolUse, postToolUse, sessionStart, sessionEnd, agentStop) | `.agents/workflows/` (YAML step-by-step) | Notification hooks in config |
| **Cloud / async agents** | No (local terminal only) | Yes — coding agent runs in GitHub Actions, triggered from Issues/PRs/Slack/Teams/Linear | Antigravity agent manager (IDE-based) | `&` prefix delegates to cloud |
| **Parallel execution** | Subagents (up to 7 parallel) | Fleet mode (`/fleet` splits plan into parallel subagents) | Agent manager subagents | Sub-agents |
| **Multi-model per role** | No (one model per session) | Yes (Claude Opus 4.6, Sonnet 4.6, GPT-5.3-Codex, Gemini 3 Pro, Haiku 4.5 — selectable per agent) | No (Gemini models only) | No (GPT models only) |
| **Org-level sharing** | No | Yes (agents defined at org level apply to all repos) | No | No |
| **CI/CD integration** | Via scripts and MCP | Native (Issues → coding agent → PRs → Actions) | Via scripts | Cloud tasks with traces |
| **Context isolation** | Strong (subagent context windows) | Strong (agent-scoped tool access + read-only enforcement) | Moderate (Knowledge Items persist across sessions) | Session-based with compaction |
| **Persistent memory** | `MEMORY.md` per subagent (curated by the agent) | Cross-session codebase memory (learns conventions) | Knowledge Items (auto-extracted at session end, persist indefinitely) | Memories in config (workspace-scoped) |
| **Tool access control** | Tools listed per subagent | Fine-grained: agents can be read-only, write-only, or scoped to specific MCP tools | MCP tool limit (500 per server) | `enabled_tools` / `disabled_tools` per MCP server |

### Why Claude Code and GitHub Copilot Are Primary Targets

**Claude Code** has the most mature subagent infrastructure — each role runs in its own context window with custom system prompt, specific tool access, and independent permissions. The subagent memory system means roles like the Security Reviewer accumulate knowledge across sessions. Claude's models (especially Opus) handle nuanced architectural reasoning well. For a solo dev working in the terminal, Claude Code is the most natural fit.

**GitHub Copilot** complements Claude Code with capabilities no other platform offers:

1. **The coding agent gives us the sync loop as CI/CD.** The ArchLens sync check becomes a GitHub Action: assign an issue like "Run phase 3 sync" to Copilot, it executes in the cloud, checks drift, proposes arc42 updates, and opens a PR. The developer reviews and merges. That's the Plan → Build → Sync → Review loop running as automated infrastructure.

2. **Org-level agent sharing.** ArchLens roles defined as `.github/agents/*.agent.md` are available to every repo in the organization. The Security Reviewer, Quality Guardian, and Contract Guardian become organizational standards, not per-project configuration.

3. **Multi-model selection per role.** The Architect role can use Opus (deep reasoning), the Implementer can use Sonnet (fast, good quality), quick quality checks can use Haiku. This model-per-role flexibility is built into the platform.

4. **Fleet mode for parallel phase checks.** At the end of a phase, run Security Reviewer + Quality Guardian + Contract Guardian in parallel via `/fleet`. Three checks that would take 15 minutes sequentially finish in 5.

5. **The open Agent Skills standard.** Skills written for Copilot also work in Claude Code CLI and other tools. Targeting this standard gives portability at the skill layer.

6. **Native GitHub workflow integration.** Phase tasks can be GitHub Issues. Completing a phase triggers a PR. Quality scenarios link to CI checks. The convention maps onto existing GitHub workflows rather than inventing new ones.

### Gemini CLI / Antigravity and Codex CLI as Secondary Targets

**Gemini CLI** supports MCP and has experimental subagent support. Antigravity (the IDE) has a richer model with Knowledge Items for persistent memory and Skills for progressive disclosure. The main gaps: subagents are less mature, the 500-tool-per-MCP-server limit (not an issue for ArchLens's ~25 tools but shows MCP integration is still early), and configuration paths are still being sorted out (Antigravity and Gemini CLI conflict on `~/.gemini/GEMINI.md`).

**Codex CLI** has solid MCP support via `config.toml`, an expanding multi-agent TUI, and can run as an MCP server itself (useful for nested agent architectures). The sandbox model is more restrictive, which matters for ArchLens features that spawn subprocesses (like the .NET Roslyn indexer). Codex uses `AGENTS.md` for project instructions and has its own plugin/skill system that's converging with but not yet identical to Copilot's.

Both are supported through the MCP tools (which work everywhere) and generated configuration files. Full subagent/role support comes later as their agent infrastructure matures.

### The Adapter Architecture

Rather than maintaining separate configurations per platform, ArchLens uses a canonical role format that generates platform-specific files:

```
.archlens/
├── agents/
│   └── _shared/                         # Canonical, agent-agnostic definitions
│       ├── architect.md                 # Role: description, constraints, context,
│       ├── implementer.md               #   quality scenarios, tool requirements
│       ├── security-reviewer.md         # Written once, maintained once.
│       ├── quality-guardian.md
│       ├── contract-guardian.md
│       ├── phase-manager.md
│       ├── onboarding.md
│       └── code-reviewer.md            # Opt-in correctness review
│
│   # Generated by `archlens generate-agent-configs`:
│
├── .claude/                             # Claude Code adapter
│   ├── agents/
│   │   ├── architect.md                 # Claude subagent format (YAML frontmatter
│   │   ├── implementer.md               #   + system prompt, tool restrictions,
│   │   ├── security-reviewer.md         #   model selection)
│   │   ├── quality-guardian.md
│   │   ├── contract-guardian.md
│   │   └── phase-manager.md
│   ├── skills/
│   │   ├── archlens-sync.md             # Auto-triggers sync loop after sessions
│   │   └── archlens-guidance.md         # Proactive architectural guidance
│   └── hooks/
│       └── pre-commit-quality-check     # Runs quality gate before commits
│
├── .github/                             # Copilot adapter
│   ├── agents/
│   │   ├── architect.agent.md           # Copilot custom agent format
│   │   ├── implementer.agent.md         #   (shareable at org level,
│   │   ├── security-reviewer.agent.md   #    model-per-role support,
│   │   ├── quality-guardian.agent.md    #    tool access restrictions)
│   │   ├── contract-guardian.agent.md
│   │   └── phase-manager.agent.md
│   ├── skills/
│   │   └── archlens-sync/
│   │       └── SKILL.md                 # Open Agent Skills standard format
│   ├── hooks/
│   │   ├── pre-tool-use.json            # Quality enforcement hooks
│   │   └── session-end.json             # Trigger sync check on session end
│   └── copilot-instructions.md          # Project context referencing arc42
│
├── .gemini/                             # Gemini CLI adapter (generated later)
│   └── GEMINI.md                        # Project context referencing arc42
│
├── CLAUDE.md                            # Claude Code project context
├── AGENTS.md                            # Codex CLI project context
└── .codex/
    └── config.toml                      # Codex MCP configuration
```

### The Generation Command

```bash
# Generate all platform configurations from canonical roles
archlens generate-agent-configs

# Generate for specific platforms only
archlens generate-agent-configs --platforms claude,copilot

# Regenerate after modifying a shared role definition
archlens generate-agent-configs --role security-reviewer
```

This command reads from `.archlens/agents/_shared/`, applies platform-specific transformations (frontmatter format, file paths, tool naming conventions, model recommendations), and writes the output files. The generated files include a header comment:

```markdown
<!-- Generated by ArchLens from .archlens/agents/_shared/security-reviewer.md -->
<!-- Do not edit directly. Modify the shared definition and run: -->
<!-- archlens generate-agent-configs -->
```

### What the MCP Server Handles vs. What Stays Agent-Side

The key design principle: **put the brain in the MCP server, put the UX in the agent config.**

**MCP server handles (works identically on all platforms):**
- Role context assembly — "what does the Architect agent need to know right now?"
- Drift detection and sync loop logic
- Quality scenario checking and enforcement
- Contract verification across services
- Proactive guidance generation ("this route needs auth middleware")
- Code intelligence (symbol search, dependency graphs, component trees)
- Phase management and task tracking

**Agent-side config handles (platform-specific UX):**
- When to delegate to a role (subagent triggers, skill auto-invocation)
- When to run checks (hooks, workflows, CI triggers)
- How to present findings (formatting preferences per model)
- How to manage context (compaction strategies, memory curation)
- How to integrate with the developer's existing workflow (Issues, PRs, Slack)
- Model selection per role (where supported)

This means even platforms we haven't explicitly adapted for — Cursor, Windsurf, Augment, Cline — get full value from the MCP tools. They just won't have the automated role delegation and hooks until someone writes the adapter config. And since the MCP tools do the heavy lifting, a developer using Cursor with just the ArchLens MCP server (no agent configs) still gets architectural queries, drift detection, and quality scenario checks — they just invoke them manually instead of having them triggered automatically.

### Platform-Specific Optimizations

**Claude Code optimizations:**
- Leverage subagent context isolation aggressively — the Implementer working on checkout loads only that building block's context via `get_building_block("checkout-flow")`, keeping the window clean
- Use subagent memory (`MEMORY.md`) so the Security Reviewer accumulates findings across sessions: "we decided to accept the risk of no rate limiting on the health endpoint"
- Use skills for auto-invocation: the `archlens-guidance` skill triggers when the developer creates a new file or module, proactively surfacing relevant quality scenarios and architectural constraints
- Use hooks to trigger quality checks pre-commit and sync checks post-session

**Copilot optimizations:**
- Define roles as org-level custom agents so the ArchLens convention is organizational infrastructure, not per-project setup
- Use the coding agent for async sync loop execution — a scheduled GitHub Action runs the Phase Manager role weekly or on PR merge, proposing arc42 updates as PRs
- Use fleet mode at phase boundaries to run Security Reviewer + Quality Guardian + Contract Guardian in parallel
- Leverage multi-model selection: Opus/GPT-5.3 for Architect (deep reasoning), Sonnet for Implementer (speed), Haiku for Quality Guardian quick checks
- Use hooks for enforcement: `preToolUse` hook prevents the Implementer from modifying files outside its building block boundary
- Map phase tasks to GitHub Issues, quality scenarios to CI check requirements, and sync results to auto-generated PRs

**Gemini optimizations (when subagent support matures):**
- Use Antigravity's Knowledge Items as the persistent memory layer — architectural decisions and quality findings extracted automatically at session end
- Use Antigravity's Skills with progressive disclosure (name + description loaded first, full instructions on relevance match) to keep context lean
- Use GEMINI.md hierarchy (global → project → local) to layer general ArchLens conventions over project-specific arc42 references

**Codex optimizations:**
- More explicit, structured role templates — Codex models tend to be more literal with instructions, so constraints need to be stated more directly than with Claude
- Use `AGENTS.md` as the primary entry point, with clear references to the ArchLens MCP tools and when to invoke them
- Leverage Codex's session resume (`codex resume`) for continuity across coding sessions — the MCP server provides the architectural context, Codex provides the session continuity
- Account for sandbox restrictions when spawning subprocesses (relevant for the .NET Roslyn indexer)

### Integration with Project Phases

Platform support is not a separate phase — it's integrated into existing phases:

**Phase 0 (Foundation):** Generate `CLAUDE.md` and `.github/copilot-instructions.md` from the arc42 skeleton. Create canonical role definitions in `.archlens/agents/_shared/`. Implement `archlens generate-agent-configs` for Claude Code and Copilot.

**Phase 1 (TS Intelligence):** MCP tools work on all platforms. No platform-specific code needed.

**Phase 3 (Architecture Bridge):** Add the `activate_role` MCP tool that returns context bundles adapted to the requesting agent (the MCP protocol includes client identification). Claude gets narrative context; Codex gets structured instructions.

**Phase 4 (Sync Loop):** Implement the sync loop both as an interactive MCP tool (for Claude Code terminal sessions) and as a GitHub Action (for Copilot coding agent async execution). The same logic, two triggers.

**Phase 5 (Starter):** The `npx create-archlens` wizard asks which platforms the developer uses and generates configuration for those platforms. Default: Claude Code + Copilot.

**Later:** Add Gemini and Codex adapters as their agent infrastructure matures. Community can contribute adapters for Cursor, Windsurf, etc.

---

## Implementation Specifications

This section contains the concrete specs needed to start coding Phase 0 without ambiguity: technology stack, database schema, file format definitions, and a walkthrough of the first developer experience.

### Technology Stack

```
ArchLens MCP Server + CLI
├── Runtime: Node.js 20+ (LTS)
├── Language: TypeScript 5.x (strict mode)
├── MCP SDK: @modelcontextprotocol/sdk (official Anthropic SDK)
├── Build: tsup (fast, zero-config bundling for the CLI + MCP server)
├── Package manager: pnpm (workspace support for monorepo)
├── Testing: vitest (fast, TS-native, compatible with the quality scenario testing convention)
│
├── Core dependencies:
│   ├── better-sqlite3          — SQLite driver (sync API, fast, no native async overhead for a local tool)
│   ├── typescript (as library)  — TS compiler API for code intelligence (Layer 1)
│   ├── gray-matter              — YAML frontmatter parsing for arc42 docs
│   ├── globby                   — File system traversal with gitignore support
│   ├── fast-glob                — Fast file matching for project scanning
│   ├── chokidar                 — File watching for incremental re-indexing (Phase 4+)
│   └── zod                      — Schema validation for MCP tool inputs, config files, and YAML schemas
│
├── CLI (npx create-archlens):
│   ├── citty                    — Lightweight CLI framework
│   ├── consola                  — Pretty console output
│   └── giget                    — Template downloading/scaffolding
│
└── Project structure (monorepo):
    ├── packages/
    │   ├── mcp-server/          — The MCP server (core product)
    │   ├── cli/                 — create-archlens CLI
    │   ├── core/                — Shared types, schemas, utilities
    │   └── adapters/            — Platform-specific config generators
    ├── templates/               — Arc42 skeletons, agent roles, starter projects
    ├── tests/
    ├── docs/                    — Convention documentation (Phase 9)
    ├── pnpm-workspace.yaml
    ├── tsconfig.base.json
    └── package.json
```

**Why these choices:**
- `better-sqlite3` over async alternatives because ArchLens is a local tool — the database is a local file, queries are fast, and sync API avoids unnecessary complexity. WAL mode for concurrent read access during MCP tool calls.
- `zod` as the single validation layer for everything: MCP tool inputs, `quality-scenarios.yaml` parsing, `config.yaml` validation, canonical role format validation. One schema library, enforced everywhere.
- `tsup` over raw `tsc` because the MCP server ships as a single executable (`archlens-mcp`) and the CLI as another (`create-archlens`). `tsup` bundles both cleanly.
- Monorepo because the MCP server, CLI, and adapters share types and schemas but ship as separate packages.

### SQLite Schema

The database lives at `.archlens/index.db` and is git-ignored. It's rebuilt from source code and arc42 documents — it's a cache/index, not a source of truth.

```sql
-- ============================================================
-- CODE INTELLIGENCE (Layers 1-3)
-- ============================================================

CREATE TABLE symbols (
  id            TEXT PRIMARY KEY,        -- stable ID: "src/lib/auth/session.ts::createSession#function"
  name          TEXT NOT NULL,           -- "createSession"
  qualified_name TEXT NOT NULL,          -- "AuthModule.createSession"
  kind          TEXT NOT NULL,           -- "function" | "class" | "method" | "type" | "constant" | "component" | "hook" | "context"
  file_path     TEXT NOT NULL,           -- "src/lib/auth/session.ts"
  start_line    INTEGER NOT NULL,
  end_line      INTEGER NOT NULL,
  start_col     INTEGER NOT NULL,
  end_col       INTEGER NOT NULL,
  signature     TEXT,                    -- "createSession(userId: string, options?: SessionOptions): Promise<Session>"
  return_type   TEXT,                    -- "Promise<Session>"
  doc_comment   TEXT,                    -- JSDoc/TSDoc extracted comment
  is_exported   BOOLEAN DEFAULT FALSE,
  is_async      BOOLEAN DEFAULT FALSE,
  service       TEXT DEFAULT 'main',     -- for monorepo: which service/app this belongs to
  language      TEXT DEFAULT 'typescript', -- "typescript" | "csharp" (Phase 10)
  content_hash  TEXT,                    -- hash of symbol source for change detection
  indexed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_symbols_file ON symbols(file_path);
CREATE INDEX idx_symbols_kind ON symbols(kind);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_service ON symbols(service);

CREATE TABLE dependencies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_symbol TEXT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  target_symbol TEXT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,           -- "imports" | "calls" | "extends" | "implements" | "uses_type" | "renders" | "provides_context" | "consumes_context"
  UNIQUE(source_symbol, target_symbol, kind)
);

CREATE INDEX idx_deps_source ON dependencies(source_symbol);
CREATE INDEX idx_deps_target ON dependencies(target_symbol);
CREATE INDEX idx_deps_kind ON dependencies(kind);

-- React-specific (Layer 2)
CREATE TABLE components (
  symbol_id     TEXT PRIMARY KEY REFERENCES symbols(id) ON DELETE CASCADE,
  is_client     BOOLEAN DEFAULT FALSE,   -- has 'use client' directive
  is_server_action BOOLEAN DEFAULT FALSE, -- has 'use server' directive
  has_state     BOOLEAN DEFAULT FALSE,   -- uses useState/useReducer
  context_providers TEXT,                -- JSON array of context names this component provides
  context_consumers TEXT,                -- JSON array of context names this component consumes
  props_type    TEXT                     -- resolved props interface as string
);

-- Next.js-specific (Layer 3)
CREATE TABLE routes (
  id            TEXT PRIMARY KEY,        -- "/checkout" or "/api/orders"
  route_path    TEXT NOT NULL,           -- "app/checkout/page.tsx"
  kind          TEXT NOT NULL,           -- "page" | "layout" | "loading" | "error" | "not-found" | "api-route" | "middleware"
  http_methods  TEXT,                    -- JSON array: ["GET", "POST"] (for API routes)
  has_auth      BOOLEAN DEFAULT FALSE,   -- auth middleware applies to this route
  parent_layout TEXT,                    -- route ID of parent layout
  service       TEXT DEFAULT 'main'
);

-- ============================================================
-- ARCHITECTURE (Arc42 bridge)
-- ============================================================

CREATE TABLE building_blocks (
  id            TEXT PRIMARY KEY,        -- "auth-module"
  name          TEXT NOT NULL,           -- "Auth Module"
  level         INTEGER DEFAULT 1,       -- 1 = top-level, 2 = sub-block
  parent_id     TEXT REFERENCES building_blocks(id),
  description   TEXT,
  responsibility TEXT,
  code_paths    TEXT NOT NULL,           -- JSON array: ["src/lib/auth/", "app/api/auth/"]
  interfaces    TEXT,                    -- JSON array of exported symbol IDs
  service       TEXT DEFAULT 'main',
  last_synced   TEXT                     -- ISO datetime of last arc42 sync
);

CREATE TABLE quality_scenarios (
  id            TEXT PRIMARY KEY,        -- "SEC-01"
  name          TEXT NOT NULL,           -- "Auth on all API routes"
  category      TEXT NOT NULL,           -- "security" | "performance" | "accessibility" | "reliability" | "maintainability"
  scenario      TEXT NOT NULL,           -- the test scenario description
  expected      TEXT NOT NULL,           -- expected outcome
  priority      TEXT DEFAULT 'must',     -- "must" | "should" | "could"
  linked_code   TEXT,                    -- JSON array of file paths / symbol IDs
  linked_tests  TEXT,                    -- JSON array of test file paths
  linked_blocks TEXT,                    -- JSON array of building block IDs
  status        TEXT DEFAULT 'untested', -- "passing" | "failing" | "untested" | "partial"
  last_checked  TEXT
);

CREATE TABLE adrs (
  id            TEXT PRIMARY KEY,        -- "001-nextjs-app-router"
  title         TEXT NOT NULL,           -- "Use Next.js App Router"
  status        TEXT DEFAULT 'accepted', -- "proposed" | "accepted" | "deprecated" | "superseded"
  date          TEXT NOT NULL,
  context       TEXT,
  decision      TEXT NOT NULL,
  consequences  TEXT,
  affected_blocks TEXT,                  -- JSON array of building block IDs
  affected_files TEXT                    -- JSON array of file paths
);

-- ============================================================
-- PLANNING & TRACKING
-- ============================================================

CREATE TABLE phases (
  id            TEXT PRIMARY KEY,        -- "phase-1-foundation"
  name          TEXT NOT NULL,           -- "Foundation"
  phase_number  INTEGER NOT NULL,
  status        TEXT DEFAULT 'planned',  -- "planned" | "in-progress" | "complete" | "blocked"
  description   TEXT,
  started_at    TEXT,
  completed_at  TEXT,
  gate_status   TEXT                     -- JSON: { quality_check: "pass", drift_check: "2 warnings", ... }
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,        -- "task-1.3-auth-middleware"
  phase_id      TEXT NOT NULL REFERENCES phases(id),
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT DEFAULT 'todo',     -- "todo" | "in-progress" | "done" | "blocked"
  building_block TEXT REFERENCES building_blocks(id),
  quality_scenarios TEXT,                -- JSON array of scenario IDs this task should satisfy
  acceptance_criteria TEXT,              -- JSON array of strings
  sort_order    INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT
);

CREATE TABLE drift_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  detected_at   TEXT NOT NULL DEFAULT (datetime('now')),
  kind          TEXT NOT NULL,           -- "undocumented_module" | "missing_module" | "dependency_violation" | "unlinked_test" | "stale_adr"
  description   TEXT NOT NULL,
  severity      TEXT DEFAULT 'warning',  -- "info" | "warning" | "error"
  affected_block TEXT,
  affected_file TEXT,
  resolution    TEXT,                    -- "accepted" | "fixed" | "deferred" | null (unresolved)
  resolved_at   TEXT
);

-- ============================================================
-- CONTRACTS (Multi-service)
-- ============================================================

CREATE TABLE contracts (
  id            TEXT PRIMARY KEY,        -- "order-api-v1"
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL,           -- "openapi" | "graphql" | "grpc" | "shared-types" | "event-schema"
  source_path   TEXT NOT NULL,           -- path to the contract file (OpenAPI spec, .proto, shared types index)
  producer      TEXT,                    -- service name that produces/implements this contract
  consumers     TEXT,                    -- JSON array of service names that consume this contract
  version       TEXT,
  building_block TEXT REFERENCES building_blocks(id),
  content_hash  TEXT,                    -- for change detection
  last_verified TEXT
);

-- ============================================================
-- METADATA
-- ============================================================

CREATE TABLE archlens_meta (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL
);

-- Bootstrap metadata
INSERT INTO archlens_meta (key, value) VALUES ('schema_version', '1');
INSERT INTO archlens_meta (key, value) VALUES ('created_at', datetime('now'));
INSERT INTO archlens_meta (key, value) VALUES ('project_name', '');
INSERT INTO archlens_meta (key, value) VALUES ('last_full_index', '');
INSERT INTO archlens_meta (key, value) VALUES ('last_sync', '');
```

### Arc42 Template Schemas

All arc42 sections use markdown with YAML frontmatter. The YAML is parsed by ArchLens; the markdown body is human-readable documentation. Zod schemas validate the frontmatter at parse time.

**quality-scenarios.yaml** — the most critical machine-readable file:

```yaml
# .archlens/arc42/10-quality-scenarios.yaml
# This is the single source of truth for quality requirements.
# Every agent role reads this. Every quality gate checks against it.

schema_version: 1
last_updated: "2026-03-08T10:00:00Z"

quality_goals:
  - id: security
    priority: 1
    description: "Protect user data and prevent unauthorized access"
  - id: performance
    priority: 2
    description: "Fast, responsive experience on all devices"
  - id: accessibility
    priority: 3
    description: "Usable by everyone regardless of ability"
  - id: maintainability
    priority: 4
    description: "Code stays understandable and changeable over time"

scenarios:
  - id: SEC-01
    name: "Auth on all API routes"
    category: security
    priority: must          # must | should | could
    scenario: "Any request to /api/* without valid session token"
    expected: "Returns 401 within 50ms"
    linked_code:
      - "middleware.ts"
      - "src/lib/auth/*"
    linked_tests:
      - "tests/security/auth-middleware.test.ts"
    linked_blocks:
      - "auth-module"
    verification: automatic   # automatic | manual | semi-automatic
    status: untested          # passing | failing | untested | partial

  - id: SEC-02
    name: "No secrets in client bundles"
    category: security
    priority: must
    scenario: "Build the project, inspect client JS bundles"
    expected: "No env vars without NEXT_PUBLIC_ prefix appear in client code"
    linked_code:
      - ".env*"
      - "next.config.ts"
    linked_tests:
      - "tests/security/bundle-check.test.ts"
    linked_blocks: []
    verification: automatic
    status: untested

  - id: PERF-01
    name: "Initial page load under 3s on 3G"
    category: performance
    priority: should
    scenario: "Load landing page on simulated slow 3G"
    expected: "LCP < 2.5s, FID < 100ms, CLS < 0.1"
    linked_code:
      - "app/(public)/page.tsx"
    linked_tests:
      - "tests/performance/lighthouse.test.ts"
    linked_blocks:
      - "public-pages"
    verification: semi-automatic
    status: untested

  # ... more scenarios
```

**Zod schema for quality scenarios** (used in `packages/core/`):

```typescript
import { z } from 'zod';

export const QualityGoalSchema = z.object({
  id: z.string(),
  priority: z.number().int().positive(),
  description: z.string(),
});

export const QualityScenarioSchema = z.object({
  id: z.string().regex(/^[A-Z]+-\d+$/),        // e.g. "SEC-01", "PERF-02"
  name: z.string(),
  category: z.enum(['security', 'performance', 'accessibility', 'reliability', 'maintainability']),
  priority: z.enum(['must', 'should', 'could']),
  scenario: z.string(),
  expected: z.string(),
  linked_code: z.array(z.string()).default([]),
  linked_tests: z.array(z.string()).default([]),
  linked_blocks: z.array(z.string()).default([]),
  verification: z.enum(['automatic', 'manual', 'semi-automatic']).default('manual'),
  status: z.enum(['passing', 'failing', 'untested', 'partial']).default('untested'),
});

export const QualityScenariosFileSchema = z.object({
  schema_version: z.number().int(),
  last_updated: z.string().datetime(),
  quality_goals: z.array(QualityGoalSchema),
  scenarios: z.array(QualityScenarioSchema),
});
```

**Building block frontmatter schema:**

```yaml
# .archlens/arc42/05-building-blocks.md
---
section: building-blocks
schema_version: 1
last_synced: "2026-03-08T10:00:00Z"
blocks:
  - id: auth-module
    name: "Auth Module"
    level: 1
    code_paths:
      - "src/lib/auth/"
      - "app/api/auth/"
    interfaces:
      - "src/lib/auth/session.ts::createSession#function"
      - "src/lib/auth/session.ts::validateToken#function"
      - "src/lib/auth/session.ts::getCurrentUser#function"
    quality_scenarios: ["SEC-01", "SEC-02"]
    adrs: ["002-auth-strategy"]
    responsibility: "Session management, token validation, OAuth flows"

  - id: checkout-flow
    name: "Checkout Flow"
    level: 1
    code_paths:
      - "app/checkout/"
      - "src/lib/checkout/"
    interfaces:
      - "src/lib/checkout/cart.ts::CartContext#context"
      - "src/lib/checkout/cart.ts::useCart#hook"
      - "src/lib/checkout/payment.ts::processPayment#function"
    quality_scenarios: ["PERF-01", "SEC-03", "A11Y-02"]
    adrs: ["003-payment-provider"]
    responsibility: "Cart management, payment processing, order confirmation"
---

# Building Block View

## Level 1: System Decomposition

### Auth Module

The auth module handles all authentication and session management...

[Human-readable documentation continues here. The YAML frontmatter above
is the machine-readable source that ArchLens indexes into SQLite.
The markdown body is for humans and the Onboarding agent.]
```

**Zod schema for building block frontmatter:**

```typescript
export const BuildingBlockSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),   // kebab-case
  name: z.string(),
  level: z.number().int().min(1).max(3).default(1),
  parent_id: z.string().optional(),
  code_paths: z.array(z.string()),
  interfaces: z.array(z.string()).default([]),   // symbol IDs
  quality_scenarios: z.array(z.string()).default([]),
  adrs: z.array(z.string()).default([]),
  responsibility: z.string(),
  service: z.string().default('main'),
});

export const BuildingBlocksFrontmatterSchema = z.object({
  section: z.literal('building-blocks'),
  schema_version: z.number().int(),
  last_synced: z.string().datetime(),
  blocks: z.array(BuildingBlockSchema),
});
```

**Phase plan schema:**

```yaml
# .archlens/plan/phases.yaml
schema_version: 1
last_updated: "2026-03-08T10:00:00Z"

phases:
  - id: phase-1-foundation
    name: "Foundation"
    phase_number: 1
    status: in-progress       # planned | in-progress | complete | blocked
    description: "Project scaffolding, auth setup, core data models"
    gate_requirements:
      - "All tasks complete"
      - "Quality scenarios SEC-01, SEC-02 have linked tests"
      - "No critical drift warnings"
      - "Building blocks documented for all src/lib/* modules"
    started_at: "2026-03-01T00:00:00Z"
    completed_at: null
```

```yaml
# .archlens/plan/tasks/phase-1-foundation.yaml
schema_version: 1
phase_id: phase-1-foundation

tasks:
  - id: task-1.1-project-setup
    title: "Initialize Next.js project with TypeScript"
    status: done
    building_block: null
    quality_scenarios: []
    acceptance_criteria:
      - "Next.js app router project created"
      - "TypeScript strict mode enabled"
      - "ESLint + Prettier configured"
    completed_at: "2026-03-01T10:00:00Z"

  - id: task-1.2-auth-setup
    title: "Implement authentication with NextAuth.js"
    status: in-progress
    building_block: auth-module
    quality_scenarios: ["SEC-01", "SEC-02"]
    acceptance_criteria:
      - "Login/logout flow working"
      - "Session tokens stored securely (httpOnly cookies)"
      - "All /api routes protected by default"
      - "Auth middleware test passing"

  - id: task-1.3-data-models
    title: "Define core data models with Prisma"
    status: todo
    building_block: data-layer
    quality_scenarios: ["MAINT-01"]
    acceptance_criteria:
      - "User, Order, Product models defined"
      - "Database migrations created"
      - "No circular dependencies between models"
```

**ADR format:**

```yaml
# .archlens/arc42/09-decisions/002-auth-strategy.md
---
id: "002-auth-strategy"
title: "Use NextAuth.js for authentication"
status: accepted             # proposed | accepted | deprecated | superseded
date: "2026-03-01"
affected_blocks: ["auth-module"]
affected_files: ["src/lib/auth/*", "app/api/auth/*"]
quality_scenarios: ["SEC-01", "SEC-02"]
superseded_by: null
---

# ADR-002: Use NextAuth.js for Authentication

## Context

We need authentication for the application. Options considered:
1. NextAuth.js — mature, well-integrated with Next.js App Router
2. Clerk — hosted service, less control
3. Custom JWT — full control but significant implementation effort

## Decision

Use NextAuth.js with the database adapter pattern.

## Consequences

- Session management handled by the framework
- OAuth providers can be added with minimal code
- We must ensure session tokens are validated in middleware (SEC-01)
- Server-side session access available in all server components
```

### Canonical Agent Role Format

Agent role definitions in `.archlens/agents/_shared/` use the following format. The YAML frontmatter specifies machine-readable metadata; the markdown body is the system prompt.

```yaml
# .archlens/agents/_shared/security-reviewer.md
---
role_id: security-reviewer
name: "Security Reviewer"
description: "Reviews code for security vulnerabilities and quality scenario compliance"
version: 1

# Which MCP tools this role needs access to
required_tools:
  - get_building_blocks
  - get_building_block
  - get_quality_scenarios
  - get_symbol
  - search_symbols
  - get_route_map
  - get_boundary_analysis
  - get_dependency_graph
  - check_drift
  - get_practice_review

# Which MCP tools this role must NOT have
denied_tools:
  - create_task
  - update_task
  - complete_phase
  - propose_arc42_update

# Is this role read-only? (no code modifications)
read_only: true

# Quality scenario categories this role focuses on
quality_focus:
  - security

# Context to pre-load when activating this role
preload_context:
  - quality_scenarios: { category: security }
  - route_map: {}
  - building_blocks: {}

# Model preferences (used by platforms that support multi-model)
model_preferences:
  reasoning_depth: high       # low | medium | high — influences model selection
  speed_priority: low         # low | medium | high
  suggested_models:
    claude: "claude-opus-4-6"
    openai: "gpt-5.3-codex"
    gemini: "gemini-3-pro"

# Platform-specific overrides (applied during config generation)
platform_overrides:
  claude:
    # Claude handles nuanced constraints well — can use natural language
    constraint_style: narrative
  copilot:
    # Copilot supports read-only tool restrictions natively
    tool_access: read-only
  codex:
    # Codex models prefer explicit, structured instructions
    constraint_style: structured
---

# Security Reviewer Agent

## Primary Objective

You are the Security Reviewer agent for this project. Your job is to identify
security vulnerabilities, verify compliance with security quality scenarios,
and ensure the application's security posture is maintained.

## Before Starting Any Review

1. Load the current security quality scenarios: `get_quality_scenarios({ category: "security" })`
2. Load the route map to understand the API surface: `get_route_map()`
3. Load building blocks to understand the architecture: `get_building_blocks()`

## Review Checklist

For every review, check each of these areas:

### Server/Client Boundary (Next.js specific)
- Are `'use server'` directives correctly applied?
- Are secrets confined to server-side code?
- Does any client component import server-only modules?
- Use `get_boundary_analysis()` to verify.

### Authentication Coverage
- Does every API route in `app/api/` have auth middleware?
- Are there any routes that intentionally skip auth? If so, is there an ADR?
- Check against quality scenario SEC-01.

### Input Validation
- Are all user inputs validated before processing?
- Are there any raw SQL queries or unparameterized database calls?
- Check against quality scenario SEC-03.

### Dependency Security
- Flag any imports from packages not in package.json
- Note any usage of `eval()`, `Function()`, or dynamic code execution

### Secret Management
- No hardcoded API keys, tokens, or passwords in source files
- Environment variables follow NEXT_PUBLIC_ convention correctly
- Check against quality scenario SEC-02.

## Output Format

Structure your findings as:

```
### Findings

#### [CRITICAL] Title of finding
- **Quality scenario:** SEC-XX
- **Location:** file path and line
- **Description:** What's wrong
- **Recommendation:** How to fix it

#### [WARNING] Title of finding
...

#### [INFO] Title of finding
...

### Summary
- Critical: N findings
- Warning: N findings
- Info: N findings
- Quality scenarios checked: SEC-01 ✓, SEC-02 ✓, SEC-03 ⚠
```

## Constraints

- You are READ-ONLY. Do not modify any files.
- Do not suggest changes that contradict existing ADRs.
- If you find an issue that requires an architectural change, recommend
  escalating to the Architect agent rather than proposing the change yourself.
- Always reference the specific quality scenario when flagging an issue.
```

**Zod schema for the canonical role format:**

```typescript
export const AgentRoleSchema = z.object({
  role_id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  description: z.string(),
  version: z.number().int(),
  required_tools: z.array(z.string()),
  denied_tools: z.array(z.string()).default([]),
  read_only: z.boolean().default(false),
  quality_focus: z.array(z.string()).default([]),
  preload_context: z.array(z.record(z.any())).default([]),
  model_preferences: z.object({
    reasoning_depth: z.enum(['low', 'medium', 'high']),
    speed_priority: z.enum(['low', 'medium', 'high']),
    suggested_models: z.record(z.string()).default({}),
  }),
  platform_overrides: z.record(z.record(z.any())).default({}),
});
```

### ArchLens Configuration File

```yaml
# .archlens/config.yaml
schema_version: 1
project_name: "my-app"
project_type: "nextjs-app-router"     # nextjs-app-router | react-vite | fullstack-monorepo | api-service

# Which services to index (for monorepo / multi-service)
services:
  - name: main
    path: "."
    type: nextjs
    tsconfig: "tsconfig.json"

# Platforms to generate agent configs for
platforms:
  - claude
  - copilot
  # - gemini
  # - codex

# Quality priority order (influences scenario generation and gate severity)
quality_priorities:
  - security
  - performance
  - accessibility
  - maintainability

# Indexing settings
indexing:
  include:
    - "src/**/*.ts"
    - "src/**/*.tsx"
    - "app/**/*.ts"
    - "app/**/*.tsx"
  exclude:
    - "node_modules/**"
    - "dist/**"
    - ".next/**"
    - "**/*.test.ts"
    - "**/*.spec.ts"
    - "**/*.d.ts"
  # Fast mode uses syntax-only parsing; deep mode does full type resolution
  default_mode: fast     # fast | deep

# Sync loop settings
sync:
  auto_detect_drift: true
  drift_severity_threshold: warning   # info | warning | error
  propose_updates_on: phase-complete  # session-end | phase-complete | manual
```

**Zod schema:**

```typescript
export const ArchLensConfigSchema = z.object({
  schema_version: z.number().int(),
  project_name: z.string(),
  project_type: z.enum(['nextjs-app-router', 'react-vite', 'fullstack-monorepo', 'api-service']),
  services: z.array(z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['nextjs', 'react', 'fastify', 'express', 'hono', 'dotnet']),
    tsconfig: z.string().optional(),
    csproj: z.string().optional(),
  })),
  platforms: z.array(z.enum(['claude', 'copilot', 'gemini', 'codex'])),
  quality_priorities: z.array(z.string()),
  indexing: z.object({
    include: z.array(z.string()),
    exclude: z.array(z.string()),
    default_mode: z.enum(['fast', 'deep']).default('fast'),
  }),
  sync: z.object({
    auto_detect_drift: z.boolean().default(true),
    drift_severity_threshold: z.enum(['info', 'warning', 'error']).default('warning'),
    propose_updates_on: z.enum(['session-end', 'phase-complete', 'manual']).default('phase-complete'),
  }),
});
```

### First 5 Minutes: Developer Experience Walkthrough

This is what actually happens when a developer uses ArchLens for the first time.

**Step 1: Create the project (~30 seconds)**

```bash
$ npx create-archlens my-shop

  ◆ Project name: my-shop
  ◆ Template: Next.js App Router
  ◆ Features: auth, database, api
  ◆ Quality priorities: security > performance > accessibility
  ◆ Agent platforms: Claude Code, GitHub Copilot

  ✓ Created Next.js project
  ✓ Generated arc42 skeleton (7 sections)
  ✓ Generated 12 quality scenarios from template library
  ✓ Generated phase plan (3 phases, 14 tasks)
  ✓ Generated 7 agent role definitions
  ✓ Generated Claude Code configs (.claude/agents/, CLAUDE.md)
  ✓ Generated Copilot configs (.github/agents/, copilot-instructions.md)
  ✓ Initialized ArchLens index database

  Next steps:
    cd my-shop
    claude                    # start Claude Code with ArchLens context
    # or open in VS Code with Copilot
```

**Step 2: Open in Claude Code and verify (~1 minute)**

```bash
$ cd my-shop
$ claude

You: What's the project architecture?

Claude: [calls get_building_blocks()]

The project has 4 building blocks defined in the arc42:

1. **auth-module** (src/lib/auth/) — Session management and OAuth flows
   Quality scenarios: SEC-01, SEC-02
   Status: No code yet

2. **public-pages** (app/(public)/) — Landing page and marketing pages
   Quality scenarios: PERF-01, A11Y-01
   Status: No code yet

3. **api-layer** (app/api/) — REST API endpoints
   Quality scenarios: SEC-01, SEC-03, PERF-02
   Status: No code yet

4. **data-layer** (src/lib/data/) — Database models and access
   Quality scenarios: MAINT-01, MAINT-02
   Status: No code yet

The current phase is "Phase 1: Foundation" with 5 tasks.
Want me to show the current tasks?
```

**Step 3: Start implementing with architectural awareness (~2 minutes)**

```
You: Let's implement the auth module. Start with task 1.2.

Claude: [calls get_current_tasks()]
         [calls get_building_block({ block_id: "auth-module" })]
         [calls get_quality_scenarios({ category: "security" })]

Task 1.2: "Implement authentication with NextAuth.js"
Building block: auth-module (src/lib/auth/)
Quality scenarios that apply:
  - SEC-01: Auth on all API routes (MUST)
  - SEC-02: No secrets in client bundles (MUST)

Acceptance criteria:
  1. Login/logout flow working
  2. Session tokens stored securely (httpOnly cookies)
  3. All /api routes protected by default
  4. Auth middleware test passing

I'll create the auth module following the architecture.
The ADR-002 specifies NextAuth.js with the database adapter pattern.
Let me start with the middleware since SEC-01 requires auth on all API routes...

[Claude implements auth, staying within the auth-module building block boundary]
```

**Step 4: Check quality after implementation (~30 seconds)**

```
You: Run a security review of what we just built.

Claude: [delegates to security-reviewer subagent]

Security Reviewer: [calls get_quality_scenarios({ category: "security" })]
                    [calls get_route_map()]
                    [calls get_boundary_analysis()]

### Security Review Findings

#### [PASS] SEC-01: Auth on all API routes
- middleware.ts correctly intercepts all /api/* routes
- Public routes explicitly listed in matcher config

#### [PASS] SEC-02: No secrets in client bundles
- NEXTAUTH_SECRET only referenced in server-side code
- No NEXT_PUBLIC_ vars contain sensitive data

#### [WARNING] SEC-03: Input validation on mutations
- app/api/auth/[...nextauth]/route.ts: No input validation on callback URLs
- Recommendation: Add URL validation in the signIn callback

### Summary
- Critical: 0  Warning: 1  Info: 0
- Quality scenarios: SEC-01 ✓  SEC-02 ✓  SEC-03 ⚠
```

**Step 5: Check sync status (~30 seconds)**

```
You: Check if the architecture is still in sync.

Claude: [calls check_drift()]

Drift check results:
  ✓ auth-module: Code matches documented building block
  ⚠ New file detected: src/lib/auth/providers.ts
    — Not currently referenced in building block interfaces.
    — Suggest adding to auth-module interfaces: "src/lib/auth/providers.ts::authProviders#constant"
  ✓ No undocumented modules
  ✓ No dependency violations

1 minor drift item. Accept the suggestion? (y/n)
```

This entire flow — from `npx create-archlens` to having an architecturally-aware, quality-checked, drift-monitored project — takes under 5 minutes. The developer never opened an arc42 file to write anything. They never configured a quality scenario manually. They just started coding, and the system provided the structure around them.

---

## Open Questions & Risks

1. **Scope creep.** This is a big vision. The MVP must be ruthlessly scoped to Phase 0 + 1 + 3 (scaffolding + TS indexing + architecture bridge) — but with the sync loop design baked in from the start, even if the full automation comes in Phase 4. The data model and arc42 format must support sync from day one.

2. **The sync loop is load-bearing.** If the sync loop feels clunky, slow, or produces low-quality suggestions, developers will skip it — and the whole convention collapses. This is the single most important UX challenge. The proposals must be specific ("Add `PaymentService` to building block `checkout-flow`, path `src/lib/checkout/payment.ts`"), not vague ("The checkout module has changed"). And they must be fast — under 10 seconds for a typical session's worth of changes.

3. **TS compiler API performance.** Full type-checking of a large project takes seconds. We may need a "fast mode" (syntax-only, like tree-sitter speed) for interactive use and a "deep mode" (full type resolution) for phase-end analysis.

4. **Arc42 maintenance burden must be near-zero for the human.** If developers feel the arc42 docs are overhead rather than help, they'll abandon them. The convention succeeds only if the developer's documentation workload is limited to reviewing diffs, not writing prose. Every arc42 update should be a "yes/no/edit" decision, never a blank page.

5. **Agent role template effectiveness varies by model.** Different models (Claude Opus, GPT-5.3, Gemini 3 Pro) respond differently to the same role template. Claude handles nuanced constraints well; Codex models prefer explicit structure; Gemini models can be over-eager with tool calls. The canonical role definitions should include model-specific guidance notes, and the generator should adapt tone and structure per platform. Copilot's multi-model support makes this testable: run the same role with different models and compare results.

6. **Convention adoption vs. tool adoption.** The convention (Plan → Build → Sync → Review) is the real product. The MCP server is one implementation. We should document the convention independently so teams can adopt it with other tools, and so the pattern survives even if the tool doesn't.

7. **Platform churn is real.** Claude Code, Copilot, Gemini, and Codex are all evolving rapidly. Features that are experimental today (Gemini subagents, Codex multi-agent TUI) may become stable or be replaced. The adapter architecture with generated configs from a canonical source protects against this — when a platform changes its format, we update one generator, not every role file.

8. **Copilot coding agent has constraints.** It only supports MCP tools (not resources or prompts), doesn't support OAuth-based remote MCP servers, and runs in a sandboxed GitHub Actions environment. The ArchLens MCP server must work within these constraints for the CI/CD sync loop. This means all data must be exposed as tool responses, and the MCP server must be deployable as a local stdio process that the Actions runner can invoke.

9. **Monorepo support.** Many Next.js projects live in monorepos (Turborepo, Nx). The initial version scopes to single-project repos, but monorepo support will be needed eventually.

10. **The "two primary platforms" decision.** Supporting Claude Code + Copilot from day one doubles the adapter work in Phase 0 but gives us terminal + CI/CD coverage. If this proves too much for the MVP, fall back to Claude Code only and add Copilot in Phase 2.

---

## Success Criteria

For the MVP (Phases 0–3):
- A solo developer can start a new Next.js project with `npx create-archlens`, get a pre-populated arc42, and immediately query building blocks and code via Claude Code or Copilot agent mode
- The agent can answer "where does this feature belong?" and "what quality constraints apply here?" without reading unnecessary files
- Architecture drift is detected and surfaced after code changes
- Token usage for common tasks (find a function, understand a module, check security posture) is reduced by 60%+ compared to raw file reading
- Agent role configs are generated for Claude Code and Copilot from a single canonical definition

For the full system (all phases):
- The Plan → Build → Sync → Review loop runs naturally as part of the developer's workflow, not as extra ceremony
- Arc42 documents stay within 1 session of accuracy — drift is never more than one coding session old
- A developer returning to the project after 2 weeks can get full context from the Onboarding agent in under 5 minutes
- The convention is documented independently from the tool, adoptable by teams using different MCP servers or no MCP at all
- The sync loop runs both interactively (Claude Code terminal) and as CI/CD (Copilot coding agent via GitHub Actions)
- Agent roles work across Claude Code, Copilot, and at least one additional platform (Gemini or Codex)

For the broader goal:
- ArchLens demonstrates that **agentic coding conventions** — not just better prompts or bigger context windows — are the key to sustainable AI-assisted development
- The pattern is recognized and adopted (or adapted) by other projects and tools in the ecosystem
- The adapter architecture enables community-contributed platform support beyond the core four
