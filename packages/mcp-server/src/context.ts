import type { Database } from "@arcbridge/core";

export interface ServerContext {
  db: Database | null;
  projectRoot: string | null;
}

export function createContext(): ServerContext {
  return {
    db: null,
    projectRoot: null,
  };
}
