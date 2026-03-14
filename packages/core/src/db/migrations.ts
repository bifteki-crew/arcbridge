import type Database from "better-sqlite3";
import { CURRENT_SCHEMA_VERSION } from "./schema.js";

interface Migration {
  version: number;
  up: (db: Database.Database) => void;
}

// Add future migrations here. Version 1 is the initial schema (handled by initializeSchema).
const migrations: Migration[] = [];

export function migrate(db: Database.Database): void {
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
    db.transaction(() => {
      migration.up(db);
      db.prepare(
        "UPDATE arcbridge_meta SET value = ? WHERE key = 'schema_version'",
      ).run(String(migration.version));
    })();
  }
}
