import { existsSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, migrate } from "@archlens/core";
import type Database from "better-sqlite3";

export function openProjectDb(projectDir: string): Database.Database {
  const dbPath = join(projectDir, ".archlens", "index.db");
  if (!existsSync(dbPath)) {
    throw new Error(
      `No ArchLens project found at ${projectDir}. Run \`archlens_init_project\` via MCP first.`,
    );
  }
  const db = openDatabase(dbPath);
  migrate(db);
  return db;
}

export function ensureInitialized(projectDir: string): void {
  const configPath = join(projectDir, ".archlens", "config.yaml");
  if (!existsSync(configPath)) {
    throw new Error(
      `No ArchLens project found at ${projectDir}. Run \`archlens_init_project\` via MCP first.`,
    );
  }
}
