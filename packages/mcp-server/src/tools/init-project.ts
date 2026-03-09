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
  type InitProjectInput,
} from "@archlens/core";
import { getAdapter } from "@archlens/adapters";
import type { ServerContext } from "../context.js";

export function registerInitProject(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "archlens_init_project",
    "Initialize ArchLens in a project directory. Creates .archlens/ with arc42 documentation, phase plan, agent roles, SQLite database, and platform-specific configs.",
    {
      name: z.string().min(1).describe("Project name"),
      template: z
        .enum(["nextjs-app-router"])
        .default("nextjs-app-router")
        .describe("Project template"),
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
      if (existsSync(join(targetDir, ".archlens", "config.yaml"))) {
        return {
          content: [
            {
              type: "text" as const,
              text: `ArchLens is already initialized in ${targetDir}. Use archlens_get_project_status to see the current state.`,
            },
          ],
        };
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
      const roles = generateAgentRoles(targetDir);

      // 5. Initialize database from generated files
      const { db, warnings } = generateDatabase(targetDir, input);
      ctx.db = db;
      ctx.projectRoot = targetDir;

      // 6. Generate platform-specific configs
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
        `# ArchLens Initialized: ${input.name}`,
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
        "",
        "## Files",
        "",
        "- `.archlens/config.yaml` — Project configuration",
        "- `.archlens/arc42/` — Architecture documentation (arc42)",
        "- `.archlens/plan/` — Phase plan and tasks",
        "- `.archlens/agents/` — Canonical agent role definitions",
        "- `.archlens/index.db` — SQLite database",
        ...params.platforms.includes("claude")
          ? ["- `CLAUDE.md` — Claude Code project instructions", "- `.claude/agents/` — Claude agent configs"]
          : [],
        ...params.platforms.includes("copilot")
          ? ["- `.github/copilot-instructions.md` — Copilot instructions", "- `.github/agents/` — Copilot agent configs"]
          : [],
        ...(allWarnings.length > 0
          ? [
              "",
              "## Warnings",
              "",
              ...allWarnings.map((w) => `- ${w}`),
            ]
          : []),
        "",
        "Use `archlens_get_project_status` to see the full project status.",
      ];

      return {
        content: [{ type: "text" as const, text: summary.join("\n") }],
      };
    },
  );
}
