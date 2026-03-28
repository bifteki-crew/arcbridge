import type { Database } from "./connection.js";
import { transaction } from "./connection.js";
import { CURRENT_SCHEMA_VERSION } from "./schema.js";

interface Migration {
  version: number;
  up: (db: Database) => void;
}

const migrations: Migration[] = [
  {
    version: 2,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_activity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool_name TEXT NOT NULL,
          action TEXT,
          model TEXT,
          agent_role TEXT,
          task_id TEXT,
          phase_id TEXT,
          input_tokens INTEGER,
          output_tokens INTEGER,
          total_tokens INTEGER,
          cost_usd REAL,
          duration_ms INTEGER,
          drift_count INTEGER,
          drift_errors INTEGER,
          test_pass_count INTEGER,
          test_fail_count INTEGER,
          lint_clean INTEGER,
          typecheck_clean INTEGER,
          notes TEXT,
          metadata TEXT NOT NULL DEFAULT '{}',
          recorded_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_activity_recorded_at ON agent_activity(recorded_at);
        CREATE INDEX IF NOT EXISTS idx_activity_model ON agent_activity(model);
        CREATE INDEX IF NOT EXISTS idx_activity_task ON agent_activity(task_id);
        CREATE INDEX IF NOT EXISTS idx_activity_phase ON agent_activity(phase_id);
      `);
    },
  },
  {
    version: 3,
    up: (db) => {
      // Add 'cancelled' to task status enum.
      // SQLite CHECK constraints can't be altered — recreate the table.
      db.exec(`
        CREATE TABLE tasks_new (
          id TEXT PRIMARY KEY,
          phase_id TEXT NOT NULL REFERENCES phases(id),
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in-progress','done','blocked','cancelled')),
          building_block TEXT REFERENCES building_blocks(id),
          quality_scenarios TEXT NOT NULL DEFAULT '[]',
          acceptance_criteria TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          completed_at TEXT
        );
        INSERT INTO tasks_new (id, phase_id, title, description, status, building_block, quality_scenarios, acceptance_criteria, created_at, completed_at)
          SELECT id, phase_id, title, description, status, building_block, quality_scenarios, acceptance_criteria, created_at, completed_at FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_new RENAME TO tasks;
      `);
    },
  },
];

export function migrate(db: Database): void {
  const row = db
    .prepare("SELECT value FROM arcbridge_meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;

  const currentVersion = row ? Number(row.value) : 0;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return;
  }

  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    transaction(db, () => {
      migration.up(db);
      db.prepare(
        "UPDATE arcbridge_meta SET value = ? WHERE key = 'schema_version'",
      ).run(String(migration.version));
    });
  }
}
