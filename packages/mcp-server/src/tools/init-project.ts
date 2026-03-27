import { z } from "zod";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  generateConfig,
  generateArc42,
  generatePlan,
  generateAgentRoles,
  generateDatabase,
  generateSyncFiles,
  indexProject,
  loadConfig,
  type InitProjectInput,
} from "@arcbridge/core";
import { getAdapter } from "@arcbridge/adapters";
import type { ServerContext } from "../context.js";

export function registerInitProject(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_init_project",
    "Initialize ArcBridge in a project directory. Creates .arcbridge/ with arc42 documentation, phase plan, agent roles, SQLite database, and platform-specific configs.",
    {
      name: z.string().min(1).describe("Project name"),
      template: z
        .enum(["nextjs-app-router", "react-vite", "api-service", "dotnet-webapi"])
        .default("nextjs-app-router")
        .describe(
          "Project template: " +
          "nextjs-app-router (Next.js with App Router, SSR/SSG), " +
          "react-vite (React SPA with Vite, client-only), " +
          "api-service (Node.js API with Express/Fastify/Hono), " +
          "dotnet-webapi (ASP.NET Core Web API, C#)",
        ),
      features: z
        .array(z.enum(["auth", "database", "api"]))
        .default([])
        .describe("Features to scaffold"),
      quality_priorities: z
        .array(z.string())
        .default(["security", "performance", "accessibility"])
        .describe("Quality priorities in order"),
      platforms: z
        .array(z.string())
        .default(["claude"])
        .describe("Target platforms for agent config generation"),
      target_dir: z
        .string()
        .describe("Absolute path to the target project directory"),
    },
    async (params) => {
      const targetDir = params.target_dir;

      // Check if already initialized
      const dbExists = existsSync(join(targetDir, ".arcbridge", "index.db"));
      const configExists = existsSync(join(targetDir, ".arcbridge", "config.yaml"));

      if (dbExists && configExists) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ArcBridge is already initialized in ${targetDir}. Use \`arcbridge_get_project_status\` to see the current state, or delete \`.arcbridge/\` to reinitialize.`,
            },
          ],
        };
      }

      // Partial init recovery: config exists but DB is missing (interrupted init)
      // Only regenerate the database, don't overwrite user's arc42 docs/plans
      if (configExists && !dbExists) {
        const { config: existingConfig } = loadConfig(targetDir);
        if (existingConfig) {
          const recoverInput: InitProjectInput = {
            name: existingConfig.project_name,
            template: existingConfig.project_type,
            features: [],
            quality_priorities: existingConfig.quality_priorities,
            platforms: existingConfig.platforms,
            projectRoot: targetDir,
          };
          const { db: recoveredDb } = generateDatabase(targetDir, recoverInput);
          ctx.db = recoveredDb;
          ctx.projectRoot = targetDir;
          return {
            content: [
              {
                type: "text" as const,
                text: `ArcBridge database recovered from existing config in ${targetDir}. Your arc42 docs and plans were preserved.\n\nUse \`arcbridge_get_project_status\` to see the current state.`,
              },
            ],
          };
        }
      }

      const input: InitProjectInput = {
        name: params.name,
        template: params.template,
        features: params.features,
        quality_priorities: params.quality_priorities,
        platforms: params.platforms,
      };

      // 1. Generate config
      const config = generateConfig(targetDir, input);

      // 2. Generate arc42 documentation
      generateArc42(targetDir, input);

      // 3. Generate phase plan
      generatePlan(targetDir, input);

      // 4. Generate agent roles
      const roles = generateAgentRoles(targetDir, params.template);

      // 5. Initialize database from generated files
      const { db, warnings } = generateDatabase(targetDir, input);
      ctx.db = db;
      ctx.projectRoot = targetDir;

      // 6. Generate sync loop files (skill, action, hook)
      const syncFiles = generateSyncFiles(targetDir, config);

      // 7. Generate platform-specific configs
      const platformWarnings: string[] = [];
      for (const platform of params.platforms) {
        try {
          const adapter = getAdapter(platform);
          adapter.generateProjectConfig(targetDir, config);
          adapter.generateAgentConfigs(targetDir, roles);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          platformWarnings.push(`Platform '${platform}': ${msg}`);
        }
      }

      // 8. Index TypeScript symbols (if tsconfig exists)
      let indexResult: {
        symbolsIndexed: number;
        dependenciesIndexed: number;
        componentsAnalyzed: number;
        routesAnalyzed: number;
      } | null = null;
      try {
        const result = await indexProject(db, { projectRoot: targetDir });
        indexResult = {
          symbolsIndexed: result.symbolsIndexed,
          dependenciesIndexed: result.dependenciesIndexed,
          componentsAnalyzed: result.componentsAnalyzed,
          routesAnalyzed: result.routesAnalyzed,
        };
      } catch {
        // Indexing is optional — project may not have tsconfig.json yet
      }

      // Count what was created
      const blockCount = db
        .prepare("SELECT COUNT(*) as count FROM building_blocks")
        .get() as { count: number };
      const scenarioCount = db
        .prepare("SELECT COUNT(*) as count FROM quality_scenarios")
        .get() as { count: number };
      const phaseCount = db
        .prepare("SELECT COUNT(*) as count FROM phases")
        .get() as { count: number };
      const taskCount = db
        .prepare("SELECT COUNT(*) as count FROM tasks")
        .get() as { count: number };

      const allWarnings = [...warnings, ...platformWarnings];

      const summary = [
        `# ArcBridge Initialized: ${input.name}`,
        "",
        `**Template:** ${input.template}`,
        `**Features:** ${input.features.length > 0 ? input.features.join(", ") : "none"}`,
        `**Platforms:** ${params.platforms.join(", ")}`,
        "",
        "## Created",
        "",
        `- **Building blocks:** ${blockCount.count}`,
        `- **Quality scenarios:** ${scenarioCount.count}`,
        `- **Phases:** ${phaseCount.count}`,
        `- **Tasks:** ${taskCount.count}`,
        `- **Agent roles:** ${roles.length}`,
        ...(indexResult
          ? [
              `- **Symbols indexed:** ${indexResult.symbolsIndexed}`,
              `- **Dependencies indexed:** ${indexResult.dependenciesIndexed}`,
              `- **Components analyzed:** ${indexResult.componentsAnalyzed}`,
              `- **Routes analyzed:** ${indexResult.routesAnalyzed}`,
            ]
          : [input.template === "dotnet-webapi"
              ? `- **Code indexing:** not available yet for .NET projects (C# indexer planned)`
              : `- **Code indexing:** skipped (no tsconfig.json found — run \`arcbridge_reindex\` later)`]),
        "",
        "## Files",
        "",
        "- `.arcbridge/config.yaml` — Project configuration",
        "- `.arcbridge/arc42/` — Architecture documentation (arc42)",
        "- `.arcbridge/plan/` — Phase plan and tasks",
        "- `.arcbridge/agents/` — Canonical agent role definitions",
        "- `.arcbridge/index.db` — SQLite database",
        ...params.platforms.includes("claude")
          ? ["- `CLAUDE.md` — Claude Code project instructions", "- `.claude/agents/` — Claude agent configs"]
          : [],
        ...params.platforms.includes("copilot")
          ? ["- `.github/copilot-instructions.md` — Copilot instructions", "- `.github/agents/` — Copilot agent configs"]
          : [],
        ...syncFiles.map((f) => `- \`${f}\` — Sync loop trigger`),
        ...(allWarnings.length > 0
          ? [
              "",
              "## Warnings",
              "",
              ...allWarnings.map((w) => `- ${w}`),
            ]
          : []),
        "",
        "## Next Steps",
        "",
        "1. **Review the phase plan** — run `arcbridge_get_phase_plan` to see all phases and their tasks",
        "2. **Plan tasks for later phases** — phases 2+ may need additional tasks. Use `arcbridge_create_task` with the phase ID shown in the plan.",
        "3. **Activate the architect role** — run `arcbridge_activate_role` with role `architect` to get full architectural context",
        "4. **Start working** — use `arcbridge_get_current_tasks` to see what to do next",
        "",
        "Use `arcbridge_get_project_status` to see the full project status.",
      ];

      return {
        content: [{ type: "text" as const, text: summary.join("\n") }],
      };
    },
  );
}
