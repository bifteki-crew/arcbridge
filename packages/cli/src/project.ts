import { existsSync } from "node:fs";
import { join } from "node:path";
import { openDatabase, migrate } from "@arcbridge/core";
import type { Database } from "@arcbridge/core";

export function openProjectDb(projectDir: string): Database {
  const dbPath = join(projectDir, ".arcbridge", "index.db");
  if (!existsSync(dbPath)) {
    throw new Error(
      `No ArcBridge project found at ${projectDir}. Run \`arcbridge_init_project\` via MCP first.`,
    );
  }
  const db = openDatabase(dbPath);
  migrate(db);
  return db;
}

export function ensureInitialized(projectDir: string): void {
  const configPath = join(projectDir, ".arcbridge", "config.yaml");
  if (!existsSync(configPath)) {
    throw new Error(
      `No ArcBridge project found at ${projectDir}. Run \`arcbridge_init_project\` via MCP first.`,
    );
  }
}
