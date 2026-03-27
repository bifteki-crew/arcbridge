import { DatabaseSync } from "node:sqlite";

/** Re-export DatabaseSync as Database for use across the codebase. */
export type Database = DatabaseSync;

/**
 * Suppress the node:sqlite ExperimentalWarning for this process.
 * Call once at the top of entry points (CLI, MCP server).
 * This is opt-in — @arcbridge/core does not suppress warnings automatically.
 */
let suppressed = false;
export function suppressSqliteWarning(): void {
  if (suppressed) return;
  suppressed = true;
  const origEmit = process.emit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).emit = function (event: string, ...args: any[]) {
    if (
      event === "warning" &&
      args[0]?.name === "ExperimentalWarning" &&
      typeof args[0]?.message === "string" &&
      args[0].message.includes("SQLite")
    ) {
      return true;
    }
    return origEmit.apply(process, [event, ...args] as Parameters<typeof origEmit>);
  };
}

/**
 * Convert undefined values to null for node:sqlite compatibility.
 * better-sqlite3 accepted undefined and converted to null silently;
 * node:sqlite throws "Provided value cannot be bound to SQLite parameter".
 */
function sanitizeParams(params: unknown[]): unknown[] {
  return params.map((p) => (p === undefined ? null : p));
}

export function openDatabase(dbPath: string): Database {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  patchPrepare(db);
  return db;
}

export function openMemoryDatabase(): Database {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  patchPrepare(db);
  return db;
}

/**
 * Patch db.prepare() to return statements that auto-convert undefined to null.
 */
function patchPrepare(db: Database): void {
  const originalPrepare = db.prepare.bind(db);
  db.prepare = (sql: string) => {
    const stmt = originalPrepare(sql);
    const origRun = stmt.run.bind(stmt);
    const origGet = stmt.get.bind(stmt);
    const origAll = stmt.all.bind(stmt);

    stmt.run = (...params: unknown[]) => origRun(...sanitizeParams(params) as never[]);
    stmt.get = (...params: unknown[]) => origGet(...sanitizeParams(params) as never[]);
    stmt.all = (...params: unknown[]) => origAll(...sanitizeParams(params) as never[]);

    return stmt;
  };
}

function rejectAsync(fn: () => unknown): void {
  if (fn.constructor.name === "AsyncFunction") {
    throw new Error(
      "transaction() received an async function. Use a synchronous function — " +
      "node:sqlite is synchronous and the transaction would commit before the async work completes.",
    );
  }
}

// Track nesting depth for safe nested transactions via SAVEPOINT
const txDepth = new WeakMap<Database, number>();

/**
 * Wrap a synchronous function in a SQLite transaction (BEGIN/COMMIT/ROLLBACK).
 * Supports nesting via SAVEPOINTs — inner calls create savepoints
 * instead of starting a new transaction.
 *
 * fn must be synchronous — passing an async function will throw.
 */
export function transaction<T>(db: Database, fn: () => T): T {
  rejectAsync(fn);
  const depth = txDepth.get(db) ?? 0;

  if (depth === 0) {
    // Outermost: real transaction
    db.exec("BEGIN");
    txDepth.set(db, 1);
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (err) {
      try { db.exec("ROLLBACK"); } catch { /* ignore rollback errors */ }
      throw err;
    } finally {
      txDepth.set(db, 0);
    }
  }

  // Nested: use SAVEPOINT
  const name = `sp_${depth}`;
  db.exec(`SAVEPOINT ${name}`);
  txDepth.set(db, depth + 1);
  try {
    const result = fn();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (err) {
    try {
      db.exec(`ROLLBACK TO ${name}`);
      db.exec(`RELEASE ${name}`);
    } catch { /* ignore rollback errors */ }
    throw err;
  } finally {
    txDepth.set(db, depth);
  }
}
