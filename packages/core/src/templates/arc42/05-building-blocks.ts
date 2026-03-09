import type { InitProjectInput, TemplateOutput } from "../types.js";

export function buildingBlocksTemplate(
  input: InitProjectInput,
): TemplateOutput {
  const now = new Date().toISOString();

  const defaultBlocks = [
    {
      id: "app-shell",
      name: "App Shell",
      level: 1,
      code_paths: ["app/layout.tsx", "app/page.tsx"],
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

  if (input.features.includes("auth")) {
    defaultBlocks.push({
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

  if (input.features.includes("api")) {
    defaultBlocks.push({
      id: "api-layer",
      name: "API Layer",
      level: 1,
      code_paths: ["app/api/"],
      interfaces: [],
      quality_scenarios: ["SEC-03"],
      adrs: [],
      responsibility: "API route handlers and server-side logic",
      service: "main",
    });
  }

  if (input.features.includes("database")) {
    defaultBlocks.push({
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
