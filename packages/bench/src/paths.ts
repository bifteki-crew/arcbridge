import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // packages/bench/src

/** Monorepo root (packages/bench/src → ../../..). */
export const repoRoot = join(here, "..", "..", "..");

/** Built CLI entry — requires `pnpm build` first. */
export const cliEntry = join(repoRoot, "packages", "cli", "dist", "index.js");

/** Committed corpus fixtures. */
export const corpusRoot = join(repoRoot, "packages", "bench", "corpus");

/** Where generated reports are written. */
export const reportsDir = join(repoRoot, "packages", "bench", "reports");
