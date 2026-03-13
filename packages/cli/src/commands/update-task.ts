import { openProjectDb } from "../project.js";

type TaskStatus = "todo" | "in-progress" | "done" | "blocked";

const VALID_STATUSES: TaskStatus[] = ["todo", "in-progress", "done", "blocked"];

export async function updateTask(
  dir: string,
  taskId: string,
  newStatus: string,
  json: boolean,
): Promise<void> {
  if (!VALID_STATUSES.includes(newStatus as TaskStatus)) {
    const msg = `Invalid status "${newStatus}". Valid values: ${VALID_STATUSES.join(", ")}`;
    if (json) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exitCode = 1;
    return;
  }

  const db = openProjectDb(dir);

  try {
    const task = db
      .prepare("SELECT id, title, status, phase_id FROM tasks WHERE id = ?")
      .get(taskId) as { id: string; title: string; status: string; phase_id: string } | undefined;

    if (!task) {
      const msg = `Task "${taskId}" not found`;
      if (json) {
        console.log(JSON.stringify({ error: msg }));
      } else {
        console.error(`Error: ${msg}`);
      }
      process.exitCode = 1;
      return;
    }

    const previousStatus = task.status;
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run(newStatus, taskId);

    if (json) {
      console.log(
        JSON.stringify({
          taskId: task.id,
          title: task.title,
          previousStatus,
          newStatus,
        }),
      );
    } else {
      console.log(`${task.id}: ${previousStatus} → ${newStatus} (${task.title})`);
    }
  } finally {
    db.close();
  }
}
