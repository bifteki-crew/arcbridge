import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized } from "../helpers.js";

interface CountRow {
  count: number;
}
interface PhaseRow {
  id: string;
  name: string;
  phase_number: number;
  status: string;
}
interface TaskStatusRow {
  status: string;
  count: number;
}
interface BlockRow {
  id: string;
  name: string;
  responsibility: string;
}
interface ScenarioRow {
  id: string;
  name: string;
  category: string;
  status: string;
  priority: string;
}
interface MetaRow {
  value: string;
}

export function registerGetProjectStatus(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_project_status",
    "Get the current status of the ArcBridge project: current phase, task completion, building blocks, quality scenarios, and drift warnings.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);

      if (!db) {
        return notInitialized();
      }

      // Project name
      const projectName = (
        db
          .prepare(
            "SELECT value FROM arcbridge_meta WHERE key = 'project_name'",
          )
          .get() as MetaRow | undefined
      )?.value ?? "Unknown";

      // Phases
      const phases = db
        .prepare(
          "SELECT id, name, phase_number, status FROM phases ORDER BY phase_number",
        )
        .all() as PhaseRow[];

      const currentPhase = phases.find(
        (p) => p.status === "in-progress",
      ) ?? phases[0];

      // Task summary
      const taskStats = db
        .prepare(
          "SELECT status, COUNT(*) as count FROM tasks GROUP BY status",
        )
        .all() as TaskStatusRow[];

      const totalTasks = taskStats.reduce((sum, r) => sum + r.count, 0);
      const doneTasks =
        taskStats.find((r) => r.status === "done")?.count ?? 0;
      const completionPct =
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

      // Building blocks
      const blocks = db
        .prepare("SELECT id, name, responsibility FROM building_blocks")
        .all() as BlockRow[];

      // Quality scenarios
      const scenarios = db
        .prepare(
          "SELECT id, name, category, status, priority FROM quality_scenarios ORDER BY category, id",
        )
        .all() as ScenarioRow[];

      // Code intelligence
      const symbolCount = (
        db.prepare("SELECT COUNT(*) as count FROM symbols").get() as CountRow
      ).count;
      const depCount = (
        db.prepare("SELECT COUNT(*) as count FROM dependencies").get() as CountRow
      ).count;
      const componentCount = (
        db.prepare("SELECT COUNT(*) as count FROM components").get() as CountRow
      ).count;
      const routeCount = (
        db.prepare("SELECT COUNT(*) as count FROM routes").get() as CountRow
      ).count;
      const lastIndexed = (
        db
          .prepare("SELECT MAX(indexed_at) as value FROM symbols")
          .get() as MetaRow | undefined
      )?.value;

      // Drift
      const driftCount = (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM drift_log WHERE resolution IS NULL",
          )
          .get() as CountRow
      ).count;

      // Format output
      const lines: string[] = [
        `# Project Status: ${projectName}`,
        "",
        "## Current Phase",
        "",
        currentPhase
          ? `**${currentPhase.name}** (${currentPhase.status})`
          : "*No phases defined*",
        "",
        "## Phases",
        "",
        ...phases.map(
          (p) =>
            `- ${p.status === "complete" ? "[x]" : p.status === "in-progress" ? "[>]" : "[ ]"} Phase ${p.phase_number}: ${p.name} (${p.status})`,
        ),
        "",
        "## Task Progress",
        "",
        `**${doneTasks}/${totalTasks}** tasks complete (${completionPct}%)`,
        "",
        ...taskStats.map((r) => `- ${r.status}: ${r.count}`),
        "",
        "## Building Blocks",
        "",
        ...blocks.map((b) => `- **${b.name}** (\`${b.id}\`): ${b.responsibility}`),
        "",
        "## Quality Scenarios",
        "",
        ...scenarios.map(
          (s) =>
            `- ${s.status === "passing" ? "pass" : s.status === "failing" ? "FAIL" : s.status === "partial" ? "partial" : "untested"} ${s.id}: ${s.name} [${s.category}] (${s.priority})`,
        ),
        "",
      ];

      // Code intelligence section
      lines.push("## Code Intelligence", "");
      if (symbolCount > 0) {
        lines.push(
          `- **Symbols indexed:** ${symbolCount}`,
          `- **Dependencies indexed:** ${depCount}`,
          `- **Components analyzed:** ${componentCount}`,
          `- **Routes analyzed:** ${routeCount}`,
          `- **Last indexed:** ${lastIndexed ?? "unknown"}`,
          "",
        );
      } else {
        lines.push(
          "*Not indexed yet.* Run `arcbridge_reindex` to index TypeScript symbols.",
          "",
        );
      }

      if (driftCount > 0) {
        lines.push(
          "## Drift Warnings",
          "",
          `**${driftCount}** unresolved drift issue(s) detected.`,
          "",
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
