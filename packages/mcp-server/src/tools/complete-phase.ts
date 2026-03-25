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
  refreshFromDocs,
  syncPhaseToYaml,
} from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";
import { autoRecord } from "../auto-record.js";

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

      // Refresh DB from docs to pick up any YAML edits (new tasks, phase changes, etc.)
      refreshFromDocs(db, params.target_dir);

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
          applyInferences(db, inferences, ctx.projectRoot ?? params.target_dir);
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

      // Check for ADR coverage — advisory, not a gate blocker
      const adrCount = (db
        .prepare("SELECT COUNT(*) as count FROM adrs")
        .get() as { count: number }).count;

      // Check if any tasks in this phase involved architectural decisions
      // (auth, database, middleware, DI — things that typically warrant ADRs)
      const architecturalKeywords = ["auth", "database", "middleware", "validation", "caching", "dependency injection", "error handling"];
      const phaseTasks = tasks.map((t) => t.title.toLowerCase());
      const hasArchitecturalWork = phaseTasks.some((title) =>
        architecturalKeywords.some((kw) => title.includes(kw)),
      );

      if (hasArchitecturalWork && adrCount <= 1) {
        lines.push(
          "## ADR Reminder",
          "",
          "This phase involved architectural decisions that should be documented as ADRs.",
          "Use `arcbridge_get_relevant_adrs` to review existing ADRs and create new ones in `.arcbridge/arc42/09-decisions/` for:",
          "",
        );
        for (const t of tasks) {
          const lower = t.title.toLowerCase();
          if (architecturalKeywords.some((kw) => lower.includes(kw))) {
            lines.push(`- **${t.title}** — document the chosen approach and alternatives considered`);
          }
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

        // Write back to YAML
        const projectRoot = ctx.projectRoot ?? params.target_dir;
        syncPhaseToYaml(projectRoot, phase.id, "complete", undefined, now);
        if (nextPhase) {
          syncPhaseToYaml(projectRoot, nextPhase.id, "in-progress", now);
        }

        // Store phase sync commit (non-critical, outside transaction)
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
          "## Arc42 Documentation Review",
          "",
          "Before moving on, review and update these arc42 sections for changes made in this phase:",
          "",
          "- [ ] **01 Introduction** — Do project goals still reflect reality?",
          "- [ ] **03 Context** — Any new external systems or integrations added?",
          "- [ ] **05 Building Blocks** — Are all new modules mapped? Run `arcbridge_check_drift` to verify.",
          "- [ ] **06 Runtime Views** — Any new key workflows to document (auth flow, data processing, etc.)?",
          "- [ ] **07 Deployment** — Any changes to infrastructure, environments, or deployment strategy?",
          "- [ ] **08 Crosscutting Concepts** — Any new patterns established (error handling, validation, logging)?",
          "- [ ] **09 Decisions** — ADRs for all significant choices? Run `arcbridge_get_relevant_adrs` to check.",
          "- [ ] **10 Quality Scenarios** — Any new quality requirements or changed thresholds?",
          "- [ ] **11 Risks & Debt** — Any known limitations or tech debt introduced?",
          "",
          "*Run `arcbridge_propose_arc42_update` to auto-detect documentation gaps.*",
        );
      } else {
        const failCount = gates.filter((g) => !g.pass).length;
        lines.push(
          `## Result: BLOCKED (${failCount} gate${failCount > 1 ? "s" : ""} failed)`,
          "",
          "Resolve the issues above before completing this phase.",
        );
      }

      autoRecord(db, params.target_dir, {
        toolName: "arcbridge_complete_phase",
        action: `${phase.name}: ${allPass ? "PASSED" : "BLOCKED"}`,
        phaseId: params.phase_id,
      });

      return textResult(lines.join("\n"));
    },
  );
}
