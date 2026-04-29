import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { InitProjectInput, TemplateOutput } from "../types.js";
import { detectProjectLayout } from "./detect-layout.js";

export function buildingBlocksTemplate(
  input: InitProjectInput,
): TemplateOutput {
  const now = new Date().toISOString();

  const layout = detectProjectLayout(input.projectRoot, input.template);

  type BlockDef = {
    id: string;
    name: string;
    level: number;
    code_paths: string[];
    interfaces: string[];
    quality_scenarios: string[];
    adrs: string[];
    responsibility: string;
    service: string;
  };

  const defaultBlocks: BlockDef[] =
    input.template === "fullstack-nextjs-dotnet"
      ? buildFullstackBlocks()
      : input.template === "dotnet-webapi"
        ? buildDotnetBlocks(input)
        : input.template === "unity-game"
          ? buildUnityBlocks()
          : input.template === "angular-app"
            ? buildAngularBlocks(layout)
            : buildJsBlocks(input, layout);

  function buildFullstackBlocks(): BlockDef[] {
    return [
      {
        id: "frontend-shell",
        name: "Frontend Shell",
        level: 1,
        code_paths: ["frontend/app/", "frontend/src/app/"],
        interfaces: [],
        quality_scenarios: ["PERF-01"],
        adrs: [],
        responsibility:
          "Next.js App Router layouts, pages, and top-level page structure",
        service: "frontend",
      },
      {
        id: "frontend-components",
        name: "Frontend Components",
        level: 1,
        code_paths: ["frontend/src/components/", "frontend/components/"],
        interfaces: [],
        quality_scenarios: ["A11Y-01"],
        adrs: [],
        responsibility:
          "Shared, reusable React UI components",
        service: "frontend",
      },
      {
        id: "api-controllers",
        name: "API Controllers",
        level: 1,
        code_paths: ["api/Controllers/"],
        interfaces: [],
        quality_scenarios: ["SEC-03"],
        adrs: [],
        responsibility:
          "ASP.NET Core API endpoint definitions and request handling",
        service: "api",
      },
      {
        id: "api-services",
        name: "API Services",
        level: 1,
        code_paths: ["api/Services/"],
        interfaces: ["api-controllers"],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Business logic, use cases, and orchestration between domain and infrastructure",
        service: "api",
      },
      {
        id: "shared-contracts",
        name: "Shared Contracts",
        level: 1,
        code_paths: ["shared/", "contracts/"],
        interfaces: ["frontend-shell", "api-controllers"],
        quality_scenarios: ["MAINT-01"],
        adrs: [],
        responsibility:
          "API types, schemas, and contracts shared between the Next.js frontend and .NET backend",
        service: "main",
      },
    ];
  }

  function buildJsBlocks(inp: InitProjectInput, lt: typeof layout): BlockDef[] {
    const src = lt.srcPrefix;
    const entries = lt.entrypoints;
    // App shell block — template-specific entrypoints
    const appShellName = inp.template === "nextjs-app-router"
      ? "App Shell"
      : inp.template === "react-vite"
        ? "App Root"
        : "Server Entry";

    const appShellResponsibility = inp.template === "nextjs-app-router"
      ? "Root layout, navigation, and top-level page structure"
      : inp.template === "react-vite"
        ? "Application root, router setup, and top-level providers"
        : "Server entry point, middleware setup, and route registration";

    const blocks: BlockDef[] = [
      {
        id: "app-shell",
        name: appShellName,
        level: 1,
        code_paths: entries,
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility: appShellResponsibility,
        service: "main",
      },
      {
        id: "ui-components",
        name: "UI Components",
        level: 1,
        code_paths: [`${src}components/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility: "Shared, reusable UI components",
        service: "main",
      },
      {
        id: "lib-utilities",
        name: "Library & Utilities",
        level: 1,
        code_paths: [`${src}lib/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility: "Shared utilities, helpers, and business logic",
        service: "main",
      },
    ];

    if (inp.features.includes("auth")) {
      blocks.push({
        id: "auth-module",
        name: "Authentication",
        level: 1,
        code_paths: [`${src}lib/auth/`],
        interfaces: [],
        quality_scenarios: ["SEC-01"],
        adrs: [],
        responsibility:
          "User authentication, session management, and authorization",
        service: "main",
      });
    }

    if (inp.features.includes("api")) {
      const apiPaths = inp.template === "nextjs-app-router"
        ? [`${lt.appPrefix}/api/`]
        : [`${src}routes/`, `${src}api/`];
      blocks.push({
        id: "api-layer",
        name: "API Layer",
        level: 1,
        code_paths: apiPaths,
        interfaces: [],
        quality_scenarios: ["SEC-03"],
        adrs: [],
        responsibility: "API route handlers and server-side logic",
        service: "main",
      });
    }

    if (inp.features.includes("database")) {
      blocks.push({
        id: "data-access",
        name: "Data Access",
        level: 1,
        code_paths: [`${src}lib/db/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility: "Database connections, queries, and data models",
        service: "main",
      });
    }

    // API client block — only for frontend templates that consume a backend API
    if (inp.template === "nextjs-app-router" || inp.template === "react-vite") {
      blocks.push({
        id: "api-client",
        name: "API Client",
        level: 1,
        code_paths: [`${src}lib/api/`, `${src}services/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "API client layer for communicating with backend services. Defines request/response types, handles errors, and manages the contract with consumed APIs.",
        service: "main",
      });
    }

    return blocks;
  }

  function buildDotnetBlocks(inp: InitProjectInput): BlockDef[] {
    // Detect src/<ProjectName>/ convention (dotnet new scaffolds into src/)
    const root = inp.projectRoot ?? ".";
    let prefix = "";
    try {
      // Prefer dotnetServices from solution discovery (accurate for multi-project)
      const primaryService = inp.dotnetServices?.find((s) => !s.path.includes("Test"));
      if (primaryService && primaryService.path !== ".") {
        prefix = primaryService.path.endsWith("/") ? primaryService.path : `${primaryService.path}/`;
      } else {
        // Fallback: scan src/ directory
        const srcDir = join(root, "src");
        if (existsSync(srcDir)) {
          const entries = readdirSync(srcDir).sort();
          const projDir = entries.find((e: string) =>
            existsSync(join(srcDir, e, `${e}.csproj`)) || existsSync(join(srcDir, e, "Program.cs"))
          );
          if (projDir) prefix = `src/${projDir}/`;
        }
      }
    } catch {
      // Ignore — use root-relative paths
    }

    const blocks: BlockDef[] = [
      {
        id: "api-host",
        name: "API Host",
        level: 1,
        code_paths: [`${prefix}Program.cs`, `${prefix}Extensions/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Application startup, DI configuration, middleware pipeline",
        service: "main",
      },
      {
        id: "controllers",
        name: "Controllers / Endpoints",
        level: 1,
        code_paths: [`${prefix}Controllers/`, `${prefix}Endpoints/`],
        interfaces: [],
        quality_scenarios: ["SEC-03"],
        adrs: [],
        responsibility:
          "API endpoint definitions — controllers or minimal API endpoint groups",
        service: "main",
      },
      {
        id: "domain",
        name: "Domain",
        level: 1,
        code_paths: [`${prefix}Domain/`, `${prefix}Models/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility: "Domain entities, value objects, and business rules",
        service: "main",
      },
      {
        id: "services",
        name: "Application Services",
        level: 1,
        code_paths: [`${prefix}Services/`],
        interfaces: ["controllers"],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Business logic, use cases, and orchestration between domain and infrastructure",
        service: "main",
      },
      {
        id: "middleware",
        name: "Middleware",
        level: 1,
        code_paths: [`${prefix}Middleware/`],
        interfaces: [],
        quality_scenarios: ["REL-01"],
        adrs: [],
        responsibility:
          "Cross-cutting concerns: error handling, logging, correlation IDs, rate limiting",
        service: "main",
      },
    ];

    // Auth and data access are core to virtually every .NET API,
    // so always include them (phase tasks reference these block IDs).
    blocks.push({
      id: "auth-module",
      name: "Authentication & Authorization",
      level: 1,
      code_paths: [`${prefix}Auth/`],
      interfaces: [],
      quality_scenarios: ["SEC-01", "SEC-02"],
      adrs: [],
      responsibility:
        "JWT/cookie auth, authorization policies, claims transformation",
      service: "main",
    });

    blocks.push({
      id: "data-access",
      name: "Data Access",
      level: 1,
      code_paths: [`${prefix}Data/`, `${prefix}Repositories/`, `${prefix}Migrations/`],
      interfaces: ["domain"],
      quality_scenarios: [],
      adrs: [],
      responsibility:
        "EF Core DbContext, repositories, migrations, and query logic",
      service: "main",
    });

    return blocks;
  }

  function buildUnityBlocks(): BlockDef[] {
    return [
      {
        id: "game-core",
        name: "Game Core",
        level: 1,
        code_paths: ["Assets/Scripts/Core/"],
        interfaces: [],
        quality_scenarios: ["PERF-01", "PERF-02"],
        adrs: [],
        responsibility:
          "Game loop, GameManager, state machine, scene management",
        service: "main",
      },
      {
        id: "input-system",
        name: "Input System",
        level: 1,
        code_paths: ["Assets/Scripts/Input/"],
        interfaces: [],
        quality_scenarios: ["PERF-06"],
        adrs: [],
        responsibility:
          "Input handling layer, action maps, platform-independent input abstraction",
        service: "main",
      },
      {
        id: "player-systems",
        name: "Player Systems",
        level: 1,
        code_paths: ["Assets/Scripts/Player/"],
        interfaces: ["input-system"],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Player controller, camera system, character state and animation",
        service: "main",
      },
      {
        id: "gameplay-systems",
        name: "Gameplay Systems",
        level: 1,
        code_paths: ["Assets/Scripts/Gameplay/"],
        interfaces: ["game-core"],
        quality_scenarios: ["MAINT-02"],
        adrs: [],
        responsibility:
          "Game mechanics, combat, inventory, AI, physics interactions",
        service: "main",
      },
      {
        id: "ui-framework",
        name: "UI Framework",
        level: 1,
        code_paths: ["Assets/Scripts/UI/"],
        interfaces: [],
        quality_scenarios: ["A11Y-01"],
        adrs: [],
        responsibility:
          "HUD, menus, dialogs, settings screens, and UI event handling",
        service: "main",
      },
      {
        id: "audio-system",
        name: "Audio System",
        level: 1,
        code_paths: ["Assets/Scripts/Audio/"],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Music playback, sound effects, spatial audio, and audio mixing",
        service: "main",
      },
      {
        id: "data-layer",
        name: "Data Layer",
        level: 1,
        code_paths: ["Assets/Scripts/Data/"],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "ScriptableObject definitions, save/load system, game configuration, and persistent data",
        service: "main",
      },
      {
        id: "editor-tools",
        name: "Editor Tools",
        level: 1,
        code_paths: ["Assets/Editor/"],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Custom inspectors, editor windows, debug overlays, and development tools",
        service: "main",
      },
    ];
  }

  function buildAngularBlocks(lt: typeof layout): BlockDef[] {
    const src = lt.srcPrefix;
    return [
      {
        id: "app-shell",
        name: "App Shell",
        level: 1,
        code_paths: [`${src}main.ts`, `${src}app/app.component.ts`, `${src}app/app.config.ts`, `${src}app/app.routes.ts`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Application bootstrap, root component, top-level routing and providers",
        service: "main",
      },
      {
        id: "core-services",
        name: "Core Services",
        level: 1,
        code_paths: [`${src}app/core/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Singleton services, guards, interceptors, and app-wide infrastructure",
        service: "main",
      },
      {
        id: "shared-components",
        name: "Shared Components",
        level: 1,
        code_paths: [`${src}app/shared/`],
        interfaces: [],
        quality_scenarios: ["A11Y-01"],
        adrs: [],
        responsibility:
          "Reusable components, directives, and pipes shared across features",
        service: "main",
      },
      {
        id: "feature-modules",
        name: "Feature Modules",
        level: 1,
        code_paths: [`${src}app/features/`],
        interfaces: ["core-services", "shared-components"],
        quality_scenarios: ["PERF-05"],
        adrs: [],
        responsibility:
          "Self-contained feature areas with own routes, components, and services",
        service: "main",
      },
      {
        id: "models",
        name: "Models & Types",
        level: 1,
        code_paths: [`${src}app/models/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Shared interfaces, types, enums, and DTOs",
        service: "main",
      },
      {
        id: "api-client",
        name: "API Client",
        level: 1,
        code_paths: [`${src}app/core/http/`, `${src}app/core/services/`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "HTTP client layer, interceptors, and API service abstractions",
        service: "main",
      },
    ];
  }

  return {
    frontmatter: {
      section: "building-blocks",
      schema_version: 1,
      last_synced: now,
      blocks: defaultBlocks,
    },
    body: `# Building Block View

## Level 1: Top-Level Decomposition

${defaultBlocks.map((b) => `### ${b.name}\n\n**Responsibility:** ${b.responsibility}\n\n**Code:** \`${b.code_paths.join("`, `")}\``).join("\n\n")}
`,
  };
}
