import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
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
 * - `route`: what endpoints exist and which methods they allow → `get_route_map`.
 *   Baseline: the files that declare routes (controllers, endpoint groups).
 * - `component`: which components exist and which are client components →
 *   `get_component_graph`. Baseline: the component and page files.
 * - `contract`: does the frontend's use of the API match what the API serves →
 *   `check_drift`. Baseline: BOTH halves — the client call sites and the
 *   controllers plus DTOs they target. The most expensive question to answer by
 *   reading, because the answer lives in the gap between two languages.
 * - `quality`: what quality constraints govern this block → `get_quality_scenarios`.
 *   Baseline: NONE. This information does not exist in source code, so there is no
 *   set of files that answers it. Reported as n/a rather than as a saving —
 *   claiming an infinite saving against a baseline of zero would be dishonest, and
 *   "the tool answers a question the codebase cannot" is the more useful finding.
 */
export interface Question {
  id: string;
  label: string;
  kind: "structure" | "block" | "symbol" | "route" | "component" | "contract" | "quality";
  /** For `block`: a code-path prefix identifying the target block. */
  blockPathPrefix?: string;
  /** For `symbol`: the symbol name to look up. */
  symbolName?: string;
  /**
   * For `route` / `component` / `contract`: the path prefixes an agent would read
   * to answer the question without ArcBridge. Chosen per member, because "where
   * the routes are declared" is a property of the project, not of the tool.
   */
  baselinePrefixes?: string[];
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

/**
 * The fullstack example lives in its own repository (it is a public showcase, and
 * keeping it out of this tree stops its code inflating arcbridge-self's own
 * baseline). Defaults to a sibling checkout.
 */
const fullstackRoot =
  process.env.ARCBRIDGE_BENCH_FULLSTACK ??
  resolve(repoRoot, "..", "arcbridge-example-fullstack");

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
  /**
   * The purpose-built fullstack example: a Next.js consumer and an ASP.NET Core
   * producer with twelve DTOs crossing the boundary. It is the only member that
   * can answer route, component, and cross-service contract questions at all —
   * arcbridge-self is library/CLI code with no routes, components, or DTOs, and
   * the two small fixtures are single-service.
   *
   * Skipped rather than failed when the checkout is absent, so the benchmark
   * still runs for anyone who only cloned this repository. Override the location
   * with ARCBRIDGE_BENCH_FULLSTACK.
   */
  ...(existsSync(fullstackRoot)
    ? [
        {
          name: "example-fullstack",
          kind: "live" as const,
          root: fullstackRoot,
          questions: [
            { id: "structure", label: "How is this codebase organized?", kind: "structure" as const },
            {
              id: "block-api-client",
              label: "What is in the frontend API client and what does it depend on?",
              kind: "block" as const,
              blockPathPrefix: "frontend/src/lib/api",
            },
            {
              id: "route-map",
              label: "What endpoints does the API expose, and which methods does each allow?",
              kind: "route" as const,
              baselinePrefixes: ["api/Controllers/", "api/Endpoints/"],
            },
            {
              id: "component-graph",
              label: "Which React components exist, and which of them are client components?",
              kind: "component" as const,
              baselinePrefixes: ["frontend/src/components/", "frontend/app/"],
            },
            {
              id: "contract-alignment",
              label: "Does the frontend's use of the API still match what the API returns?",
              kind: "contract" as const,
              // Both halves: the call sites, and the controllers plus DTOs they hit.
              baselinePrefixes: [
                "frontend/src/lib/api/",
                "frontend/src/contracts/",
                "api/Controllers/",
                "api/Endpoints/",
                "api/Models/",
              ],
            },
            {
              id: "quality-constraints",
              label: "What quality constraints govern the API controllers?",
              kind: "quality" as const,
            },
          ],
        },
      ]
    : []),
];
