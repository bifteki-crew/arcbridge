export interface IndexerOptions {
  projectRoot: string;
  tsconfigPath?: string;
  service?: string;
  language?: "typescript" | "csharp" | "auto";
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
  dependenciesIndexed: number;
  componentsAnalyzed: number;
  routesAnalyzed: number;
  filesProcessed: number;
  filesSkipped: number;
  filesRemoved: number;
  durationMs: number;
  /** Set when indexing was skipped entirely (e.g. no tsconfig.json found). */
  skippedReason?: string;
}

