import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  detectDrift,
  writeDriftLog,
  getHeadSha,
  setSyncCommit,
  inferTaskStatuses,
  applyInferences,
  verifyScenarios,
  loadConfig,
} from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, safeParseJson } from "../helpers.js";

interface PhaseRow {
  id: string;
  name: string;
  phase_number: number;
  status: string;
  gate_status: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
}

interface ScenarioRow {
  id: string;
  name: string;
  status: string;
  priority: string;
}

export function registerCompletePhase(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_complete_phase",
    "Attempt to complete a phase by validating all gates: tasks done, no critical drift, quality scenarios passing. Transitions the phase to 'complete' if all gates pass.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      phase_id: z
        .string()
        .optional()
        .describe("Phase ID to complete (defaults to current in-progress phase)"),
      notes: z
        .string()
        .optional()
        .describe("Optional notes about this phase completion"),
      auto_infer: z
        .boolean()
        .default(true)
        .describe("Automatically infer task statuses from code state before checking gates"),
      run_tests: z
        .boolean()
        .default(false)
        .describe("Run linked tests for quality scenarios before checking the quality gate"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      // Find the target phase
      let phase: PhaseRow | undefined;
      if (params.phase_id) {
        phase = db
          .prepare("SELECT id, name, phase_number, status, gate_status FROM phases WHERE id = ?")
          .get(params.phase_id) as PhaseRow | undefined;
      } else {
        phase = db
          .prepare(
            "SELECT id, name, phase_number, status, gate_status FROM phases WHERE status = 'in-progress' LIMIT 1",
          )
          .get() as PhaseRow | undefined;
      }

      if (!phase) {
        return textResult(
          "No in-progress phase found. Use `arcbridge_get_phase_plan` to see all phases.",
        );
      }

      if (phase.status === "complete") {
        return textResult(`Phase \`${phase.name}\` is already complete.`);
      }

      const lines: string[] = [
        `# Phase Completion: ${phase.name}`,
        "",
      ];

      // Step 1: Auto-infer task statuses
      if (params.auto_infer) {
        const inferences = inferTaskStatuses(db, phase.id);
        if (inferences.length > 0) {
          applyInferences(db, inferences);
          lines.push("## Task Status Inference", "");
          for (const inf of inferences) {
            lines.push(
              `- **${inf.taskId}**: ${inf.previousStatus} → **${inf.inferredStatus}** (${inf.reason})`,
            );
          }
          lines.push("");
        }
      }

      // Step 2: Check gate — all tasks done
      const tasks = db
        .prepare("SELECT id, title, status FROM tasks WHERE phase_id = ?")
        .all(phase.id) as TaskRow[];

      const incompleteTasks = tasks.filter((t) => t.status !== "done");
      const tasksPass = incompleteTasks.length === 0;

      // Step 3: Check gate — drift
      const driftEntries = detectDrift(db);
      writeDriftLog(db, driftEntries);
      const criticalDrift = driftEntries.filter((d) => d.severity === "error");
      const driftPass = criticalDrift.length === 0;

      // Step 4: Optionally run tests to update scenario statuses
      if (params.run_tests) {
        const projectRoot = ctx.projectRoot ?? params.target_dir;
        let testCommand = "npx vitest run";
        let timeoutMs = 60000;

        const configResult = loadConfig(params.target_dir);
        if (configResult.config) {
          testCommand = configResult.config.testing.test_command;
          timeoutMs = configResult.config.testing.timeout_ms;
        }

        const verifyResult = verifyScenarios(db, projectRoot, {
          testCommand,
          timeoutMs,
        });

        if (verifyResult.results.length > 0) {
          lines.push("## Test Verification", "");
          for (const r of verifyResult.results) {
            const icon = r.passed ? "PASS" : "FAIL";
            lines.push(
              `- [${icon}] **${r.scenarioId}: ${r.scenarioName}** (${r.durationMs}ms)`,
            );
          }
          lines.push("");
        }
      }

      // Step 5: Check gate — quality scenarios
      const mustScenarios = db
        .prepare(
          "SELECT id, name, status, priority FROM quality_scenarios WHERE priority = 'must'",
        )
        .all() as ScenarioRow[];

      const failingMust = mustScenarios.filter(
        (s) => s.status === "failing",
      );
      const qualityPass = failingMust.length === 0;

      // Build gate results
      const gates = [
        { name: "All tasks complete", pass: tasksPass },
        { name: "No critical drift", pass: driftPass },
        { name: "Must-have quality scenarios not failing", pass: qualityPass },
      ];

      const allPass = gates.every((g) => g.pass);

      lines.push("## Gate Results", "");
      for (const gate of gates) {
        const icon = gate.pass ? "PASS" : "FAIL";
        lines.push(`- [${icon}] ${gate.name}`);
      }
      lines.push("");

      // Show details for failures
      if (!tasksPass) {
        lines.push("### Incomplete Tasks", "");
        for (const t of incompleteTasks) {
          const icon =
            t.status === "in-progress"
              ? "[>]"
              : t.status === "blocked"
                ? "[!]"
                : "[ ]";
          lines.push(`- ${icon} ${t.id}: ${t.title} (${t.status})`);
        }
        lines.push("");
      }

      if (!driftPass) {
        lines.push("### Critical Drift", "");
        for (const d of criticalDrift) {
          lines.push(`- [ERROR] ${d.description}`);
        }
        lines.push("");
      }

      if (!qualityPass) {
        lines.push("### Failing Must-Have Scenarios", "");
        for (const s of failingMust) {
          lines.push(`- **${s.id}: ${s.name}** — ${s.status}`);
        }
        lines.push("");
      }

      if (allPass) {
        const now = new Date().toISOString();
        const gateStatus = JSON.stringify({
          tasks: "pass",
          drift: "pass",
          quality: "pass",
          completed_at: now,
          notes: params.notes ?? null,
        });

        // Find next phase before transaction
        const nextPhase = db
          .prepare(
            "SELECT id, name FROM phases WHERE phase_number = ? AND status = 'planned'",
          )
          .get(phase.phase_number + 1) as { id: string; name: string } | undefined;

        // Transition atomically
        const transition = db.transaction(() => {
          db.prepare(
            "UPDATE phases SET status = 'complete', completed_at = ?, gate_status = ? WHERE id = ?",
          ).run(now, gateStatus, phase.id);

          if (nextPhase) {
            db.prepare(
              "UPDATE phases SET status = 'in-progress', started_at = ? WHERE id = ?",
            ).run(now, nextPhase.id);
          }
        });
        transition();

        // Store phase sync commit (non-critical, outside transaction)
        const projectRoot = ctx.projectRoot ?? params.target_dir;
        const headSha = getHeadSha(projectRoot);
        if (headSha) {
          setSyncCommit(db, "phase_sync_commit", headSha);
        }

        lines.push("## Result: PASS", "");
        lines.push(`Phase \`${phase.name}\` is now **complete**.`);

        if (!headSha) {
          lines.push("", "*Warning: Could not determine git HEAD — sync point not stored.*");
        }

        if (params.notes) {
          lines.push("", `**Notes:** ${params.notes}`);
        }

        if (nextPhase) {
          lines.push("", `Next phase **${nextPhase.name}** is now in-progress.`);
        }

        lines.push(
          "",
          "---",
          "*Run `arcbridge_propose_arc42_update` to generate documentation updates for this phase.*",
        );
      } else {
        const failCount = gates.filter((g) => !g.pass).length;
        lines.push(
          `## Result: BLOCKED (${failCount} gate${failCount > 1 ? "s" : ""} failed)`,
          "",
          "Resolve the issues above before completing this phase.",
        );
      }

      return textResult(lines.join("\n"));
    },
  );
}
