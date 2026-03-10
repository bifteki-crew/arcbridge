import type Database from "better-sqlite3";

export interface IndexerOptions {
  projectRoot: string;
  tsconfigPath?: string;
  service?: string;
}

export type SymbolKind =
  | "function"
  | "class"
  | "type"
  | "constant"
  | "interface"
  | "enum"
  | "variable"
  | "component"
  | "hook"
  | "context";

export interface ExtractedSymbol {
  id: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
  signature: string | null;
  returnType: string | null;
  docComment: string | null;
  isExported: boolean;
  isAsync: boolean;
  contentHash: string;
}

export interface IndexResult {
  symbolsIndexed: number;
  filesProcessed: number;
  filesSkipped: number;
  filesRemoved: number;
  durationMs: number;
}

export interface IndexProjectDeps {
  db: Database.Database;
  options: IndexerOptions;
}
