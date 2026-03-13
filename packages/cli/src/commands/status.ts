import { openProjectDb } from "../project.js";

interface TaskDetail {
  id: string;
  title: string;
  status: string;
}

interface QualitySummary {
  total: number;
  passing: number;
  failing: number;
  untested: number;
}

interface StatusResult {
  project_name: string;
  current_phase: { id: string; name: string; status: string } | null;
  tasks: { total: number; done: number; in_progress: number; blocked: number };
  current_tasks: TaskDetail[];
  quality: QualitySummary;
  building_blocks: number;
  symbols: number;
  drift: { total: number; errors: number; warnings: number };
}

export async function status(dir: string, json: boolean): Promise<void> {
  const db = openProjectDb(dir);

  try {
    const projectName =
      (
        db
          .prepare(
            "SELECT value FROM archlens_meta WHERE key = 'project_name'",
          )
          .get() as { value: string } | undefined
      )?.value ?? "Unknown";

    const currentPhase = db
      .prepare(
        "SELECT id, name, status FROM phases WHERE status = 'in-progress' LIMIT 1",
      )
      .get() as { id: string; name: string; status: string } | undefined;

    const allTasks = db
      .prepare("SELECT status FROM tasks")
      .all() as { status: string }[];
    const tasks = {
      total: allTasks.length,
      done: allTasks.filter((t) => t.status === "done").length,
      in_progress: allTasks.filter((t) => t.status === "in-progress").length,
      blocked: allTasks.filter((t) => t.status === "blocked").length,
    };

    const blockCount = (
      db.prepare("SELECT COUNT(*) as c FROM building_blocks").get() as {
        c: number;
      }
    ).c;
    const symbolCount = (
      db.prepare("SELECT COUNT(*) as c FROM symbols").get() as { c: number }
    ).c;

    // Current phase tasks
    const currentTasks: TaskDetail[] = currentPhase
      ? (db
          .prepare(
            "SELECT id, title, status FROM tasks WHERE phase_id = ? ORDER BY id",
          )
          .all(currentPhase.id) as TaskDetail[])
      : [];

    // Quality scenarios summary
    const scenarioStatuses = db
      .prepare("SELECT status FROM quality_scenarios")
      .all() as { status: string }[];
    const quality: QualitySummary = {
      total: scenarioStatuses.length,
      passing: scenarioStatuses.filter((s) => s.status === "passing").length,
      failing: scenarioStatuses.filter((s) => s.status === "failing").length,
      untested: scenarioStatuses.filter((s) => s.status === "untested").length,
    };

    const driftEntries = db
      .prepare(
        "SELECT severity FROM drift_log WHERE resolved_at IS NULL",
      )
      .all() as { severity: string }[];
    const driftInfo = {
      total: driftEntries.length,
      errors: driftEntries.filter((d) => d.severity === "error").length,
      warnings: driftEntries.filter((d) => d.severity === "warning").length,
    };

    const result: StatusResult = {
      project_name: projectName,
      current_phase: currentPhase ?? null,
      tasks,
      current_tasks: currentTasks,
      quality,
      building_blocks: blockCount,
      symbols: symbolCount,
      drift: driftInfo,
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Project: ${result.project_name}`);
      console.log(
        `Phase:   ${result.current_phase ? `${result.current_phase.name} (${result.current_phase.status})` : "none active"}`,
      );
      console.log(
        `Tasks:   ${result.tasks.done}/${result.tasks.total} done, ${result.tasks.in_progress} in-progress, ${result.tasks.blocked} blocked`,
      );

      if (result.current_tasks.length > 0) {
        console.log("");
        console.log(`Current phase tasks:`);
        for (const task of result.current_tasks) {
          const icon =
            task.status === "done"
              ? "[x]"
              : task.status === "in-progress"
                ? "[~]"
                : task.status === "blocked"
                  ? "[!]"
                  : "[ ]";
          console.log(`  ${icon} ${task.title}`);
        }
      }

      if (result.quality.total > 0) {
        console.log("");
        console.log(
          `Quality: ${result.quality.passing} passing, ${result.quality.failing} failing, ${result.quality.untested} untested (${result.quality.total} total)`,
        );
      }

      console.log("");
      console.log(`Blocks:  ${result.building_blocks}`);
      console.log(`Symbols: ${result.symbols}`);
      if (result.drift.total > 0) {
        console.log(
          `Drift:   ${result.drift.total} issues (${result.drift.errors} errors, ${result.drift.warnings} warnings)`,
        );
      } else {
        console.log(`Drift:   none`);
      }
    }
  } finally {
    db.close();
  }
}
