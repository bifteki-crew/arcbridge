import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InitProjectInput, TemplateOutput } from "../types.js";

export function buildingBlocksTemplate(
  input: InitProjectInput,
): TemplateOutput {
  const now = new Date().toISOString();

  // Detect whether the project uses src/ directory
  const hasSrcDir = input.projectRoot
    ? existsSync(join(input.projectRoot, "src", "app"))
    : false;
  const appPrefix = hasSrcDir ? "src/app" : "app";

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
      : buildJsBlocks(input, appPrefix);

  function buildJsBlocks(inp: InitProjectInput, prefix: string): BlockDef[] {
    const blocks: BlockDef[] = [
      {
        id: "app-shell",
        name: "App Shell",
        level: 1,
        code_paths: [`${prefix}/layout.tsx`, `${prefix}/page.tsx`],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility:
          "Root layout, navigation, and top-level page structure",
        service: "main",
      },
      {
        id: "ui-components",
        name: "UI Components",
        level: 1,
        code_paths: ["src/components/"],
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
        code_paths: ["src/lib/"],
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
        code_paths: ["src/lib/auth/"],
        interfaces: [],
        quality_scenarios: ["SEC-01"],
        adrs: [],
        responsibility:
          "User authentication, session management, and authorization",
        service: "main",
      });
    }

    if (inp.features.includes("api")) {
      blocks.push({
        id: "api-layer",
        name: "API Layer",
        level: 1,
        code_paths: [`${prefix}/api/`],
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
        code_paths: ["src/lib/db/"],
        interfaces: [],
        quality_scenarios: [],
        adrs: [],
        responsibility: "Database connections, queries, and data models",
        service: "main",
      });
    }

    // API client for consuming external backend services
    blocks.push({
      id: "api-client",
      name: "API Client",
      level: 1,
      code_paths: ["src/lib/api/", "src/services/"],
      interfaces: [],
      quality_scenarios: ["PERF-02"],
      adrs: [],
      responsibility:
        "API client layer for communicating with backend services. Defines request/response types, handles errors, and manages the contract with external APIs.",
      service: "main",
    });

    return blocks;
  }

  function buildDotnetBlocks(inp: InitProjectInput): BlockDef[] {
    const blocks: BlockDef[] = [
      {
        id: "api-host",
        name: "API Host",
        level: 1,
        code_paths: ["Program.cs", "Extensions/"],
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
        code_paths: ["Controllers/", "Endpoints/"],
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
        code_paths: ["Domain/", "Models/"],
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
        code_paths: ["Services/"],
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
        code_paths: ["Middleware/"],
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
      code_paths: ["Auth/"],
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
      code_paths: ["Data/", "Repositories/", "Migrations/"],
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
