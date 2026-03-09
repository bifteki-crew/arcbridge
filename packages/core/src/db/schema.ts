import type Database from "better-sqlite3";

export const CURRENT_SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
-- Metadata
CREATE TABLE IF NOT EXISTS archlens_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Code Intelligence (populated in Phase 1-2)
CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('function','class','type','constant','component','hook','context','interface','enum','variable')),
  file_path TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  start_col INTEGER NOT NULL DEFAULT 0,
  end_col INTEGER NOT NULL DEFAULT 0,
  signature TEXT,
  return_type TEXT,
  doc_comment TEXT,
  is_exported INTEGER NOT NULL DEFAULT 0,
  is_async INTEGER NOT NULL DEFAULT 0,
  service TEXT NOT NULL DEFAULT 'main',
  language TEXT NOT NULL DEFAULT 'typescript',
  content_hash TEXT,
  indexed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_path);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_service ON symbols(service);

CREATE TABLE IF NOT EXISTS dependencies (
  source_symbol TEXT NOT NULL REFERENCES symbols(id),
  target_symbol TEXT NOT NULL REFERENCES symbols(id),
  kind TEXT NOT NULL CHECK(kind IN ('imports','calls','extends','implements','uses_type','renders','provides_context','consumes_context')),
  UNIQUE(source_symbol, target_symbol, kind)
);

CREATE INDEX IF NOT EXISTS idx_deps_source ON dependencies(source_symbol);
CREATE INDEX IF NOT EXISTS idx_deps_target ON dependencies(target_symbol);
CREATE INDEX IF NOT EXISTS idx_deps_kind ON dependencies(kind);

CREATE TABLE IF NOT EXISTS components (
  symbol_id TEXT PRIMARY KEY REFERENCES symbols(id),
  is_client INTEGER NOT NULL DEFAULT 0,
  is_server_action INTEGER NOT NULL DEFAULT 0,
  has_state INTEGER NOT NULL DEFAULT 0,
  context_providers TEXT NOT NULL DEFAULT '[]',
  context_consumers TEXT NOT NULL DEFAULT '[]',
  props_type TEXT
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  route_path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('page','layout','loading','error','not-found','api-route','middleware')),
  http_methods TEXT NOT NULL DEFAULT '[]',
  has_auth INTEGER NOT NULL DEFAULT 0,
  parent_layout TEXT,
  service TEXT NOT NULL DEFAULT 'main'
);

-- Architecture
CREATE TABLE IF NOT EXISTS building_blocks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  parent_id TEXT REFERENCES building_blocks(id),
  description TEXT,
  responsibility TEXT NOT NULL,
  code_paths TEXT NOT NULL DEFAULT '[]',
  interfaces TEXT NOT NULL DEFAULT '[]',
  service TEXT NOT NULL DEFAULT 'main',
  last_synced TEXT
);

CREATE TABLE IF NOT EXISTS quality_scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('security','performance','accessibility','reliability','maintainability')),
  scenario TEXT NOT NULL,
  expected TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'should' CHECK(priority IN ('must','should','could')),
  linked_code TEXT NOT NULL DEFAULT '[]',
  linked_tests TEXT NOT NULL DEFAULT '[]',
  linked_blocks TEXT NOT NULL DEFAULT '[]',
  verification TEXT NOT NULL DEFAULT 'manual' CHECK(verification IN ('automatic','manual','semi-automatic')),
  status TEXT NOT NULL DEFAULT 'untested' CHECK(status IN ('passing','failing','untested','partial')),
  last_checked TEXT
);

CREATE TABLE IF NOT EXISTS adrs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','accepted','deprecated','superseded')),
  date TEXT NOT NULL,
  context TEXT,
  decision TEXT,
  consequences TEXT,
  affected_blocks TEXT NOT NULL DEFAULT '[]',
  affected_files TEXT NOT NULL DEFAULT '[]',
  quality_scenarios TEXT NOT NULL DEFAULT '[]',
  superseded_by TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('openapi','graphql','grpc','shared-types','event-schema')),
  source_path TEXT NOT NULL,
  producer TEXT NOT NULL,
  consumers TEXT NOT NULL DEFAULT '[]',
  version TEXT,
  building_block TEXT REFERENCES building_blocks(id),
  content_hash TEXT,
  last_verified TEXT
);

-- Planning
CREATE TABLE IF NOT EXISTS phases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phase_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','in-progress','complete','blocked')),
  description TEXT NOT NULL,
  gate_status TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  phase_id TEXT NOT NULL REFERENCES phases(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in-progress','done','blocked')),
  building_block TEXT REFERENCES building_blocks(id),
  quality_scenarios TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS drift_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  detected_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('undocumented_module','missing_module','dependency_violation','unlinked_test','stale_adr')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','error')),
  description TEXT NOT NULL,
  affected_block TEXT,
  affected_file TEXT,
  resolution TEXT CHECK(resolution IN ('accepted','fixed','deferred') OR resolution IS NULL),
  resolved_at TEXT
);
`;

export function initializeSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);

  const existing = db
    .prepare("SELECT value FROM archlens_meta WHERE key = 'schema_version'")
    .get() as { value: string } | undefined;

  if (!existing) {
    const now = new Date().toISOString();
    const insert = db.prepare(
      "INSERT INTO archlens_meta (key, value) VALUES (?, ?)",
    );
    insert.run("schema_version", String(CURRENT_SCHEMA_VERSION));
    insert.run("created_at", now);
  }
}
