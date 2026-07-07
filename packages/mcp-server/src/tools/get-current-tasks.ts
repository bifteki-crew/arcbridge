import { refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, safeParseJson, type ToolResult } from "../helpers.js";
import type { TaskRow, PhaseRow } from "../db-types.js";

export interface CurrentTasksParams {
  target_dir: string;
  phase_id?: string;
  status?: "todo" | "in-progress" | "done" | "blocked";
}

/** `view: tasks` mode of arcbridge_get_phase_plan. */
export async function handleGetCurrentTasks(
  ctx: ServerContext,
  params: CurrentTasksParams,
): Promise<ToolResult> {
  const db = ensureDb(ctx, params.target_dir);
  if (!db) return notInitialized();

  // Refresh DB from docs to pick up any YAML edits
  refreshFromDocs(db, params.target_dir);

  // Find phase: explicit phase_id, or current in-progress, or first planned
  let currentPhase: PhaseRow | undefined;

  if (params.phase_id) {
    currentPhase = db
      .prepare("SELECT id, name FROM phases WHERE id = ?")
      .get(params.phase_id) as PhaseRow | undefined;
    if (!currentPhase) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Phase '${params.phase_id}' not found. Use \`arcbridge_get_phase_plan\` to see all phases.`,
          },
        ],
      };
    }
  } else {
    currentPhase = db
      .prepare(
        "SELECT id, name FROM phases WHERE status = 'in-progress' ORDER BY phase_number LIMIT 1",
      )
      .get() as PhaseRow | undefined;

    if (!currentPhase) {
      currentPhase = db
        .prepare(
          "SELECT id, name FROM phases WHERE status = 'planned' ORDER BY phase_number LIMIT 1",
        )
        .get() as PhaseRow | undefined;
    }

    if (!currentPhase) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No active or planned phases found. Use `arcbridge_get_phase_plan` to see all phases.",
          },
        ],
      };
    }
  }

  let query =
    "SELECT id, phase_id, title, description, status, building_block, quality_scenarios, acceptance_criteria FROM tasks WHERE phase_id = ?";
  const queryParams: string[] = [currentPhase.id];

  if (params.status) {
    query += " AND status = ?";
    queryParams.push(params.status);
  }

  query += " ORDER BY id";

  const tasks = db.prepare(query).all(...queryParams) as TaskRow[];

  const lines: string[] = [
    `# Current Tasks: ${currentPhase.name}`,
    "",
  ];

  if (tasks.length === 0) {
    lines.push(
      params.status
        ? `No tasks with status '${params.status}' in this phase.`
        : "No tasks in this phase.",
    );
  } else {
    const done = tasks.filter((t) => t.status === "done").length;
    lines.push(`**Progress:** ${done}/${tasks.length} complete`, "");

    for (const task of tasks) {
      const check =
        task.status === "done"
          ? "[x]"
          : task.status === "in-progress"
            ? "[>]"
            : task.status === "blocked"
              ? "[!]"
              : "[ ]";

      lines.push(`## ${check} ${task.id}: ${task.title}`, "");
      lines.push(`**Status:** ${task.status}`);

      if (task.building_block) {
        lines.push(`**Building block:** \`${task.building_block}\``);
      }

      const qScenarios = safeParseJson<string[]>(task.quality_scenarios, []);
      if (qScenarios.length > 0) {
        lines.push(
          `**Quality scenarios:** ${qScenarios.join(", ")}`,
        );
      }

      const criteria = safeParseJson<string[]>(task.acceptance_criteria, []);
      if (criteria.length > 0) {
        lines.push("", "**Acceptance criteria:**");
        for (const c of criteria) {
          lines.push(
            `- ${task.status === "done" ? "[x]" : "[ ]"} ${c}`,
          );
        }
      }

      lines.push("");
    }
  }

  // Warn about future phases with no tasks
  const emptyFuturePhases = db
    .prepare(`
      SELECT p.id, p.name, p.phase_number FROM phases p
      WHERE p.status IN ('planned', 'in-progress')
        AND p.id != ?
        AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.phase_id = p.id)
      ORDER BY p.phase_number
    `)
    .all(currentPhase.id) as { id: string; name: string; phase_number: number }[];

  if (emptyFuturePhases.length > 0) {
    lines.push(
      "---",
      "",
      "**Warning:** The following phases have no tasks yet:",
      ...emptyFuturePhases.map((p) => `- Phase ${p.phase_number}: ${p.name} (\`${p.id}\`)`),
      "",
      "Use `arcbridge_manage_tasks` (action: create) to plan tasks before reaching these phases.",
    );
  }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
