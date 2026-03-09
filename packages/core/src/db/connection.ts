import Database from "better-sqlite3";

export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function openMemoryDatabase(): Database.Database {
  return openDatabase(":memory:");
}
