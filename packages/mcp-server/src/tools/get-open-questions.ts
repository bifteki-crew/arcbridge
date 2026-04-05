import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson } from "../helpers.js";
import type { ScenarioRow, BlockRow, PhaseRow, TaskRow } from "../db-types.js";

interface DriftRow {
  kind: string;
  severity: string;
  description: string;
}

export function registerGetOpenQuestions(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_get_open_questions",
    "Surface architectural gaps: untested quality scenarios, building blocks without boundaries, unresolved drift, and tasks missing acceptance criteria.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      scope: z
        .string()
        .optional()
        .describe("Focus scope: 'current-phase', 'building-block:<id>', or omit for project-wide"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const lines: string[] = ["# Open Questions & Gaps", ""];
      let totalGaps = 0;

      // 1. Untested or failing quality scenarios
      const scenarios = db
        .prepare(
          "SELECT id, name, category, status, priority, linked_tests, linked_code FROM quality_scenarios ORDER BY priority, category",
        )
        .all() as ScenarioRow[];

      const untestedMust = scenarios.filter(
        (s) => s.priority === "must" && (s.status === "untested" || s.status === "failing"),
      );
      const untestedShould = scenarios.filter(
        (s) => s.priority === "should" && (s.status === "untested" || s.status === "failing"),
      );
      const unlinked = scenarios.filter((s) => {
        const tests = safeParseJson<string[]>(s.linked_tests, []);
        return tests.length === 0;
      });

      if (untestedMust.length > 0) {
        lines.push("## Critical: Untested/Failing Must-Have Scenarios", "");
        for (const s of untestedMust) {
          lines.push(`- **${s.id}: ${s.name}** [${s.category}] — ${s.status}`);
          totalGaps++;
        }
        lines.push("");
      }

      if (untestedShould.length > 0) {
        lines.push("## Untested/Failing Should-Have Scenarios", "");
        for (const s of untestedShould) {
          lines.push(`- ${s.id}: ${s.name} [${s.category}] — ${s.status}`);
          totalGaps++;
        }
        lines.push("");
      }

      if (unlinked.length > 0) {
        lines.push("## Scenarios Without Linked Tests", "");
        for (const s of unlinked) {
          lines.push(`- ${s.id}: ${s.name} [${s.category}] (${s.priority})`);
          totalGaps++;
        }
        lines.push("");
      }

      // 2. Building blocks without code or with empty descriptions
      const blocks = db
        .prepare("SELECT id, name, code_paths, description FROM building_blocks")
        .all() as BlockRow[];

      const emptyBlocks = blocks.filter((b) => {
        const paths = safeParseJson<string[]>(b.code_paths, []);
        return paths.length === 0;
      });

      const undescribed = blocks.filter(
        (b) => !b.description || b.description.trim().length === 0,
      );

      if (emptyBlocks.length > 0) {
        lines.push("## Building Blocks Without Code Paths", "");
        for (const b of emptyBlocks) {
          lines.push(`- **${b.name}** (\`${b.id}\`) — no code_paths defined`);
          totalGaps++;
        }
        lines.push("");
      }

      if (undescribed.length > 0) {
        lines.push("## Building Blocks Without Descriptions", "");
        for (const b of undescribed) {
          lines.push(`- **${b.name}** (\`${b.id}\`)`);
          totalGaps++;
        }
        lines.push("");
      }

      // 3. Unresolved drift
      const drift = db
        .prepare(
          "SELECT kind, severity, description FROM drift_log WHERE resolution IS NULL ORDER BY severity DESC",
        )
        .all() as DriftRow[];

      if (drift.length > 0) {
        lines.push("## Unresolved Architecture Drift", "");
        for (const d of drift) {
          lines.push(`- [${d.severity.toUpperCase()}] ${d.description}`);
          totalGaps++;
        }
        lines.push("");
      }

      // 4. Phase-specific: tasks without clear acceptance criteria
      let phaseTasks: TaskRow[] = [];
      if (params.scope === "current-phase" || !params.scope) {
        const currentPhase = db
          .prepare("SELECT id, name, status FROM phases WHERE status = 'in-progress' LIMIT 1")
          .get() as PhaseRow | undefined;

        if (currentPhase) {
          phaseTasks = db
            .prepare("SELECT id, title, status, acceptance_criteria FROM tasks WHERE phase_id = ?")
            .all(currentPhase.id) as TaskRow[];
        }
      }

      const tasksWithoutCriteria = phaseTasks.filter((t) => {
        const criteria = safeParseJson<string[]>(t.acceptance_criteria, []);
        return criteria.length === 0 && t.status !== "done";
      });

      if (tasksWithoutCriteria.length > 0) {
        lines.push("## Tasks Without Acceptance Criteria", "");
        for (const t of tasksWithoutCriteria) {
          lines.push(`- ${t.id}: ${t.title} (${t.status})`);
          totalGaps++;
        }
        lines.push("");
      }

      // Summary
      if (totalGaps === 0) {
        return textResult(
          "# Open Questions & Gaps\n\nNo significant architectural gaps found. Quality scenarios are linked, building blocks are defined, and no drift is unresolved.",
        );
      }

      lines[0] = `# Open Questions & Gaps (${totalGaps} items)`;

      return textResult(lines.join("\n"));
    },
  );
}
