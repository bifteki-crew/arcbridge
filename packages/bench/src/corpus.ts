import { join } from "node:path";
import { corpusRoot, repoRoot } from "./paths.js";
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

interface BaseMember {
  name: string;
  questions: Question[];
}

/** A pinned fixture: copied to a temp dir, then init + adopt + drift. */
export interface FixtureMember extends BaseMember {
  kind: "fixture";
  template: InitProjectInput["template"];
  sourceDir: string;
}

/**
 * An existing repo with a committed `.arcbridge/` model, measured IN PLACE.
 * Nothing is copied and `adopt` is never run (that would overwrite a
 * hand-maintained model); only `drift --reindex` runs, which refreshes the
 * gitignored derived index.db. Cleanup is a deliberate no-op — this points at a
 * real working tree.
 */
export interface LiveMember extends BaseMember {
  kind: "live";
  root: string;
}

export type CorpusMember = FixtureMember | LiveMember;

export const CORPUS: CorpusMember[] = [
  {
    name: "ts-api",
    kind: "fixture",
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
    kind: "fixture",
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
  {
    // ArcBridge's own repo: a real TS monorepo with realistic file sizes, a
    // hand-maintained .arcbridge/ model, and real cross-package edges. Fixes
    // the magnitude problem of the tiny fixtures (their baselines were <1k
    // tokens). Known blind spot: it's library/CLI code, so it never exercises
    // the app shapes ArcBridge targets (routes, components, DTOs) — that's what
    // a purpose-built fullstack example is for.
    name: "arcbridge-self",
    kind: "live",
    root: repoRoot,
    questions: [
      { id: "structure", label: "How is this codebase organized?", kind: "structure" },
      {
        id: "block-core",
        label: "What is in the core package and what does it depend on?",
        kind: "block",
        blockPathPrefix: "packages/core/src",
      },
      {
        // Mentioned across ~18 files — the grep-then-read case the tiny
        // fixtures could not represent.
        id: "symbol-detectDrift",
        label: "What does detectDrift do and who calls it?",
        kind: "symbol",
        symbolName: "detectDrift",
      },
    ],
  },
];
