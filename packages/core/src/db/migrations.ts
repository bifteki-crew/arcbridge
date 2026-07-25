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
  {
    version: 4,
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase_id);
        CREATE INDEX IF NOT EXISTS idx_phases_status ON phases(status);
      `);
    },
  },
  {
    version: 5,
    up: (db) => {
      // Endpoint contracts: api_calls table (consumer half), plus
      // 'contract_violation' drift kind and 'http-endpoint' contract kind.
      // SQLite CHECK constraints can't be altered — recreate the tables.
      // drift_log entries are transient detector output and contracts was
      // never populated before v5, so neither needs a data copy beyond
      // drift_log's (kept for history).
      db.exec(`
        CREATE TABLE IF NOT EXISTS api_calls (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          method TEXT NOT NULL,
          file_path TEXT NOT NULL,
          line INTEGER NOT NULL,
          service TEXT NOT NULL DEFAULT 'main'
        );
        CREATE INDEX IF NOT EXISTS idx_api_calls_service ON api_calls(service);

        CREATE TABLE drift_log_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          detected_at TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('undocumented_module','missing_module','dependency_violation','unlinked_test','stale_adr','new_dependency','contract_violation')),
          severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','error')),
          description TEXT NOT NULL,
          affected_block TEXT,
          affected_file TEXT,
          resolution TEXT CHECK(resolution IN ('accepted','fixed','deferred') OR resolution IS NULL),
          resolved_at TEXT
        );
        INSERT INTO drift_log_new (id, detected_at, kind, severity, description, affected_block, affected_file, resolution, resolved_at)
          SELECT id, detected_at, kind, severity, description, affected_block, affected_file, resolution, resolved_at FROM drift_log;
        DROP TABLE drift_log;
        ALTER TABLE drift_log_new RENAME TO drift_log;

        CREATE TABLE contracts_new (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL CHECK(kind IN ('openapi','graphql','grpc','shared-types','event-schema','http-endpoint')),
          source_path TEXT NOT NULL,
          producer TEXT NOT NULL,
          consumers TEXT NOT NULL DEFAULT '[]',
          version TEXT,
          building_block TEXT REFERENCES building_blocks(id),
          content_hash TEXT,
          last_verified TEXT
        );
        INSERT INTO contracts_new (id, kind, source_path, producer, consumers, version, building_block, content_hash, last_verified)
          SELECT id, kind, source_path, producer, consumers, version, building_block, content_hash, last_verified FROM contracts;
        DROP TABLE contracts;
        ALTER TABLE contracts_new RENAME TO contracts;
      `);
    },
  },
  {
    version: 6,
    up: (db) => {
      // Field-level contracts: the DTO an endpoint returns and the type a fetch
      // call expects. Plain nullable columns; guarded so re-running against a
      // schema that already has them (e.g. current-schema-then-downgrade) is safe.
      addColumnIfMissing(db, "routes", "response_type", "TEXT");
      addColumnIfMissing(db, "api_calls", "expected_type", "TEXT");
    },
  },
];

/** Identifiers/type declarations may only be simple SQL-safe tokens. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_COLUMN_DECL = /^[A-Za-z0-9_ ()]+$/;

/**
 * Add a column only if it isn't already present (idempotent ALTER).
 * Identifiers can't be bound as parameters in DDL, so they're validated
 * against a strict allowlist — current callers pass constants, and this keeps
 * a future caller from accidentally interpolating something unsafe.
 */
function addColumnIfMissing(db: Database, table: string, column: string, decl: string): void {
  if (!SAFE_IDENTIFIER.test(table)) throw new Error(`Unsafe table identifier: ${table}`);
  if (!SAFE_IDENTIFIER.test(column)) throw new Error(`Unsafe column identifier: ${column}`);
  if (!SAFE_COLUMN_DECL.test(decl)) throw new Error(`Unsafe column declaration: ${decl}`);

  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

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
