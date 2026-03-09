import type Database from "better-sqlite3";

export interface ServerContext {
  db: Database.Database | null;
  projectRoot: string | null;
}

export function createContext(): ServerContext {
  return {
    db: null,
    projectRoot: null,
  };
}
