import { join } from "node:path";
import { corpusRoot } from "./paths.js";
import type { InitProjectInput } from "@arcbridge/core";

/**
 * A benchmark question, keyed to the fixture's real code. Each maps to one
 * ArcBridge tool call and a fair "files an agent would otherwise read" baseline.
 *
 * - `structure`: understand how the codebase is organized → `get_building_blocks`.
 *   Baseline: every source file (no map ⇒ read everything).
 * - `block`: what's in one module and what it depends on → `get_building_blocks`
 *   with a `block_id`. Baseline: the files under that block's code paths.
 * - `symbol`: what a function is and who calls it → `query_symbols` with a
 *   `symbol_id`. Baseline: the file defining it + files that reference its name.
 */
export interface Question {
  id: string;
  label: string;
  kind: "structure" | "block" | "symbol";
  /** For `block`: a code-path prefix identifying the target block. */
  blockPathPrefix?: string;
  /** For `symbol`: the symbol name to look up. */
  symbolName?: string;
}

export interface CorpusMember {
  name: string;
  template: InitProjectInput["template"];
  sourceDir: string;
  questions: Question[];
}

export const CORPUS: CorpusMember[] = [
  {
    name: "ts-api",
    template: "api-service",
    sourceDir: join(corpusRoot, "ts-api"),
    questions: [
      { id: "structure", label: "How is this codebase organized?", kind: "structure" },
      {
        id: "block-routes",
        label: "What is in the routes module and what does it depend on?",
        kind: "block",
        blockPathPrefix: "src/routes",
      },
      {
        id: "symbol-createUser",
        label: "What does createUser do and who calls it?",
        kind: "symbol",
        symbolName: "createUser",
      },
    ],
  },
  {
    name: "ts-frontend",
    template: "react-vite",
    sourceDir: join(corpusRoot, "ts-frontend"),
    questions: [
      { id: "structure", label: "How is this codebase organized?", kind: "structure" },
      {
        id: "block-components",
        label: "What is in the components module and what does it depend on?",
        kind: "block",
        blockPathPrefix: "src/components",
      },
      {
        id: "symbol-useBookmarks",
        label: "What does useBookmarks do and who calls it?",
        kind: "symbol",
        symbolName: "useBookmarks",
      },
    ],
  },
];
