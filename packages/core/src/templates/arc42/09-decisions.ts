import type { InitProjectInput, TemplateOutput } from "../types.js";
import { detectProjectLayout } from "./detect-layout.js";

interface AdrResult extends TemplateOutput {
  filename: string;
}

export function firstAdrTemplate(input: InitProjectInput): AdrResult {
  const now = new Date().toISOString().split("T")[0]!;

  switch (input.template) {
    case "dotnet-webapi":
      return dotnetAdr(input, now);
    case "react-vite":
      return reactViteAdr(input, now);
    case "api-service":
      return apiServiceAdr(input, now);
    case "unity-game":
      return unityAdr(input, now);
    case "angular-app":
      return angularAdr(input, now);
    default:
      return nextjsAdr(input, now);
  }
}

function nextjsAdr(input: InitProjectInput, date: string): AdrResult {
  const { appPrefix } = detectProjectLayout(input.projectRoot, input.template);

  return {
    filename: "001-nextjs-app-router.md",
    frontmatter: {
      id: "001-nextjs-app-router",
      title: "Use Next.js App Router",
      status: "accepted",
      date,
      affected_blocks: ["app-shell"],
      affected_files: [`${appPrefix}/`],
      quality_scenarios: [],
    },
    body: `# ADR-001: Use Next.js App Router

## Context

${input.name} needs a modern React framework that supports server-side rendering, static generation, and API routes.

## Decision

Use Next.js with the App Router (introduced in Next.js 13+) as the application framework.

## Consequences

- **Positive:** Server Components by default reduce client-side JavaScript
- **Positive:** File-based routing with layouts, loading states, and error boundaries
- **Positive:** Built-in API routes for backend logic
- **Negative:** App Router has a learning curve compared to Pages Router
- **Negative:** Some libraries may not yet fully support Server Components
`,
  };
}

function reactViteAdr(input: InitProjectInput, date: string): AdrResult {
  const { srcPrefix } = detectProjectLayout(input.projectRoot, input.template);

  return {
    filename: "001-react-vite.md",
    frontmatter: {
      id: "001-react-vite",
      title: "Use React with Vite",
      status: "accepted",
      date,
      affected_blocks: ["app-shell"],
      affected_files: [srcPrefix || "./"],
      quality_scenarios: [],
    },
    body: `# ADR-001: Use React with Vite

## Context

${input.name} needs a fast, modern frontend framework for building a single-page application (SPA) with TypeScript.

## Decision

Use React with Vite as the build tool and development server.

## Consequences

- **Positive:** Extremely fast dev server with hot module replacement (HMR)
- **Positive:** Optimized production builds with tree shaking and code splitting
- **Positive:** Simple configuration, no SSR complexity
- **Positive:** Large React ecosystem of libraries and components
- **Negative:** Client-side only — no built-in server-side rendering (add later if needed)
- **Negative:** Requires separate backend service for API endpoints
`,
  };
}

function apiServiceAdr(input: InitProjectInput, date: string): AdrResult {
  const { srcPrefix } = detectProjectLayout(input.projectRoot, input.template);

  return {
    filename: "001-api-service.md",
    frontmatter: {
      id: "001-api-service",
      title: "Use Node.js API Service",
      status: "accepted",
      date,
      affected_blocks: ["app-shell"],
      affected_files: [srcPrefix || "./"],
      quality_scenarios: [],
    },
    body: `# ADR-001: Use Node.js API Service

## Context

${input.name} needs a backend API service with TypeScript support, good performance, and a simple architecture.

## Decision

Use a Node.js HTTP framework (Express, Fastify, or Hono) as the API service foundation.

## Consequences

- **Positive:** TypeScript-first with full type safety
- **Positive:** Rich middleware ecosystem for auth, validation, logging
- **Positive:** Easy to deploy to containers, serverless, or traditional hosts
- **Negative:** Single-threaded — CPU-intensive operations need worker threads or external services
- **Negative:** No built-in ORM — need to choose data access strategy
`,
  };
}

function angularAdr(input: InitProjectInput, date: string): AdrResult {
  const { srcPrefix } = detectProjectLayout(input.projectRoot, input.template);

  return {
    filename: "001-angular-standalone.md",
    frontmatter: {
      id: "001-angular-standalone",
      title: "Use Angular with Standalone Components",
      status: "accepted",
      date,
      affected_blocks: ["app-shell", "feature-modules"],
      affected_files: [srcPrefix || "./"],
      quality_scenarios: [],
    },
    body: `# ADR-001: Use Angular with Standalone Components

## Context

${input.name} needs a modern, opinionated frontend framework with strong TypeScript support, dependency injection, and a structured approach to building large applications.

## Decision

Use Angular with standalone components (default since Angular v17). Use the signals API for reactive state management and functional guards/resolvers for routing.

## Consequences

- **Positive:** Strong TypeScript integration with decorators and DI
- **Positive:** Standalone components simplify the module system and improve tree-shaking
- **Positive:** Signals provide fine-grained reactivity without Zone.js overhead
- **Positive:** Opinionated structure reduces architectural decision fatigue
- **Negative:** Steeper learning curve compared to lighter frameworks
- **Negative:** Larger initial bundle size (mitigated by lazy loading)

## Current Limitations

The TypeScript indexer fully indexes Angular symbols, dependencies, services, and \`@Component\` declarations. The \`arcbridge_get_component_graph\` tool lists detected Angular components with their selectors and imports, but **template-based relationship analysis** (which component renders which via template selectors) is not yet implemented. Component listing works; hierarchy tracking is a planned enhancement.
`,
  };
}

function unityAdr(input: InitProjectInput, date: string): AdrResult {
  return {
    filename: "001-unity-code-heavy.md",
    frontmatter: {
      id: "001-unity-code-heavy",
      title: "Use Unity with Code-Heavy Architecture",
      status: "accepted",
      date,
      affected_blocks: ["game-core", "player-systems"],
      affected_files: ["Assets/Scripts/"],
      quality_scenarios: [],
    },
    body: `# ADR-001: Use Unity with Code-Heavy Architecture

## Context

${input.name} needs a game engine with cross-platform support, strong performance, and a productive development workflow. The team prefers a code-driven approach over hand-crafting scenes in the editor.

## Decision

Use Unity as the game engine with a code-heavy C# architecture. Favor programmatic scene composition, ScriptableObject data architecture, and assembly definitions for modular code organization.

## Consequences

- **Positive:** Version control friendly — most logic lives in .cs files, not serialized scenes
- **Positive:** Testable — gameplay logic can be unit tested without the editor
- **Positive:** Reusable systems — assembly definitions enforce module boundaries
- **Positive:** AI-agent friendly — agents work effectively with C# scripts
- **Negative:** More boilerplate than visual scripting or drag-and-drop workflows
- **Negative:** Scene references require discipline (use ScriptableObjects or addressables)
- **Negative:** Some Unity features (Animator, Timeline) still require editor interaction

## Agent Limitations

AI agents can review C# scripts, suggest architectural improvements, and check code quality — but they **cannot** evaluate gameplay feel, frame timing, or visual quality. Use [Unity-MCP](https://github.com/IvanMurzak/Unity-MCP) to give agents basic editor access (scene management, asset operations). For runtime quality (actual FPS, GC spikes, input latency), rely on the Unity Profiler and manual playtesting.
`,
  };
}

function dotnetAdr(input: InitProjectInput, date: string): AdrResult {
  return {
    filename: "001-aspnet-core-webapi.md",
    frontmatter: {
      id: "001-aspnet-core-webapi",
      title: "Use ASP.NET Core Web API",
      status: "accepted",
      date,
      affected_blocks: ["api-host", "controllers"],
      affected_files: ["Program.cs", "Controllers/"],
      quality_scenarios: [],
    },
    body: `# ADR-001: Use ASP.NET Core Web API

## Context

${input.name} needs a performant, cross-platform web API framework with strong dependency injection, middleware pipeline, and ecosystem support.

## Decision

Use ASP.NET Core with the minimal hosting model (top-level Program.cs) as the API framework. Support both controller-based and minimal API endpoints.

## Consequences

- **Positive:** High performance with Kestrel, mature ecosystem
- **Positive:** Built-in DI container, configuration, and middleware pipeline
- **Positive:** Strong typing and compile-time safety with C#
- **Positive:** OpenAPI/Swagger generation out of the box
- **Negative:** Steeper learning curve for the DI and middleware patterns
- **Negative:** Larger memory footprint compared to minimal frameworks
`,
  };
}
