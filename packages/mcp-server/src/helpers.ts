import { join } from "node:path";
import { existsSync } from "node:fs";
import type Database from "better-sqlite3";
import { openDatabase } from "@archlens/core";
import type { ServerContext } from "./context.js";

export function ensureDb(
  ctx: ServerContext,
  targetDir: string,
): Database.Database | null {
  if (ctx.db) return ctx.db;

  const dbPath = join(targetDir, ".archlens", "index.db");
  if (!existsSync(dbPath)) {
    return null;
  }

  ctx.db = openDatabase(dbPath);
  ctx.projectRoot = targetDir;
  return ctx.db;
}

export const NOT_INITIALIZED = {
  content: [
    {
      type: "text" as const,
      text: "ArchLens is not initialized in this directory. Run `archlens_init_project` first.",
    },
  ],
} as const;
