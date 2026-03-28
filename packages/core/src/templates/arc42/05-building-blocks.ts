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
    input.template === "dotnet-webapi"
      ? buildDotnetBlocks(input)
      : buildJsBlocks(input, layout);

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
      const srcDir = join(root, "src");
      if (existsSync(srcDir)) {
        const entries = readdirSync(srcDir);
        const projDir = entries.find((e: string) =>
          existsSync(join(srcDir, e, `${e}.csproj`)) || existsSync(join(srcDir, e, "Program.cs"))
        );
        if (projDir) prefix = `src/${projDir}/`;
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
