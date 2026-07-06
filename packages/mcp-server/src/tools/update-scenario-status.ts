import { syncScenarioToYaml, transaction } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, type ToolResult } from "../helpers.js";

interface ScenarioRow {
  id: string;
  name: string;
  status: string;
  linked_tests: string;
  verification: string;
}

export interface UpdateScenarioParams {
  target_dir: string;
  scenario_id: string;
  status: "passing" | "failing" | "untested" | "partial";
  linked_tests?: string[];
}

/** `update` action of arcbridge_quality_scenarios. */
export async function handleUpdateScenarioStatus(
  ctx: ServerContext,
  params: UpdateScenarioParams,
): Promise<ToolResult> {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const projectRoot = ctx.projectRoot ?? params.target_dir;

      // Check scenario exists
      const scenario = db
        .prepare("SELECT id, name, status, linked_tests, verification FROM quality_scenarios WHERE id = ?")
        .get(params.scenario_id) as ScenarioRow | undefined;

      if (!scenario) {
        const available = db
          .prepare("SELECT id, name, status FROM quality_scenarios ORDER BY id")
          .all() as { id: string; name: string; status: string }[];
        const list = available.length > 0
          ? available.map((s) => `  - \`${s.id}\` ${s.name} (${s.status})`).join("\n")
          : "  (none)";
        return textResult(
          `Scenario '${params.scenario_id}' not found.\n\n**Available scenarios:**\n${list}`,
        );
      }

      const oldStatus = scenario.status;
      const now = new Date().toISOString();

      // Validate linked_tests paths (no path traversal, must be relative)
      if (params.linked_tests) {
        const { isAbsolute, normalize } = await import("node:path");
        const invalid = params.linked_tests.filter((t) => {
          const norm = normalize(t);
          return isAbsolute(norm) || norm.startsWith("..");
        });
        if (invalid.length > 0) {
          return textResult(
            `Invalid test paths (must be relative, no '..' segments):\n${invalid.map((p) => `  - ${p}`).join("\n")}`,
          );
        }
      }

      // Update DB atomically
      transaction(db, () => {
        db.prepare("UPDATE quality_scenarios SET status = ?, last_checked = ? WHERE id = ?").run(
          params.status, now, params.scenario_id,
        );

        if (params.linked_tests) {
          db.prepare("UPDATE quality_scenarios SET linked_tests = ? WHERE id = ?").run(
            JSON.stringify(params.linked_tests), params.scenario_id,
          );
          // Auto-upgrade verification from 'manual' to 'semi-automatic' when tests are linked
          if (scenario.verification === "manual") {
            db.prepare("UPDATE quality_scenarios SET verification = 'semi-automatic' WHERE id = ?").run(
              params.scenario_id,
            );
          }
        }
      });

      // Sync to YAML (source of truth)
      let yamlWarning: string | undefined;
      try {
        const newVerification = (params.linked_tests && scenario.verification === "manual")
          ? "semi-automatic"
          : undefined;
        syncScenarioToYaml(projectRoot, params.scenario_id, params.status, params.linked_tests, newVerification);
      } catch (err) {
        yamlWarning = `YAML sync failed: ${err instanceof Error ? err.message : String(err)}. DB updated but YAML may be out of sync.`;
      }

      const lines = [
        `Scenario **${scenario.id}** (${scenario.name}) updated: ${oldStatus} → **${params.status}**`,
      ];

      if (params.linked_tests) {
        lines.push(
          "",
          `**Linked tests:** ${params.linked_tests.length} file(s)`,
          ...params.linked_tests.map((t) => `  - ${t}`),
        );
        if (scenario.verification === "manual") {
          lines.push("", "*Verification upgraded from manual to semi-automatic*");
        }
      }

      if (yamlWarning) {
        lines.push("", `**Warning:** ${yamlWarning}`);
      }

      return textResult(lines.join("\n"));
}
