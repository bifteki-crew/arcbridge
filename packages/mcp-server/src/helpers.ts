import { join } from "node:path";
import { existsSync } from "node:fs";
import type Database from "better-sqlite3";
import { openDatabase, migrate } from "@arcbridge/core";
import type { ServerContext } from "./context.js";

export function ensureDb(
  ctx: ServerContext,
  targetDir: string,
): Database.Database | null {
  if (ctx.db) return ctx.db;

  const dbPath = join(targetDir, ".arcbridge", "index.db");
  if (!existsSync(dbPath)) {
    return null;
  }

  ctx.db = openDatabase(dbPath);
  migrate(ctx.db);
  ctx.projectRoot = targetDir;
  return ctx.db;
}

export function notInitialized() {
  return {
    content: [
      {
        type: "text" as const,
        text: "ArcBridge is not initialized in this directory. Run `arcbridge_init_project` first.",
      },
    ],
  };
}

export function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

/**
 * Escape SQL LIKE wildcards (%, _) in user-provided values.
 */
export function escapeLike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Safely parse a JSON string from a database column.
 * Returns the fallback value if parsing fails.
 */
export function safeParseJson<T>(value: string | null, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Normalize a code_path glob pattern to a plain prefix for matching.
 * Strips trailing glob patterns: "src/lib/**" → "src/lib/", "src/lib/*" → "src/lib/"
 */
export function normalizeCodePath(codePath: string): string {
  return codePath.replace(/\*+\/?$/, "");
}
