import type { Database } from "../db/connection.js";
import type { DriftEntry } from "./detector.js";
import { resolveRef, getChangedFiles, scopeToProject, refExists } from "../git/helpers.js";

/** Thrown when a `--base` ref cannot be resolved in the repo. */
export class UnresolvableRefError extends Error {
  constructor(public readonly ref: string) {
    super(
      `Cannot resolve git ref '${ref}'. Pass a branch, tag, SHA, or ` +
        `last-commit/last-sync/last-phase. In CI, make sure the ref is fetched — ` +
        `shallow checkouts often lack it (actions/checkout needs fetch-depth: 0).`,
    );
    this.name = "UnresolvableRefError";
  }
}

/**
 * The set of project-relative paths that changed since `ref`, ready to compare
 * against `DriftEntry.affectedFile`. Composes the existing git helpers:
 * resolve the ref, diff it against HEAD + working tree, then scope the
 * repo-relative paths down to the project directory (monorepo-safe). Paths use
 * forward slashes, matching indexed `file_path`s.
 *
 * `ref` accepts the same values as `resolveRef` ("last-commit", "last-sync",
 * "last-phase", or a literal branch/tag/SHA). Pass `db` so "last-sync" /
 * "last-phase" resolve the stored sync points in `arcbridge_meta` — without it
 * they fall back to HEAD~1/HEAD~5, and if that fallback commit doesn't exist
 * either (shallow clone, single-commit repo) `getChangedScope` throws
 * `UnresolvableRefError` rather than silently scoping to nothing.
 */
export interface ChangedScope {
  /** Human-readable resolved ref label, for reporting. */
  label: string;
  /** Project-relative changed paths. */
  paths: Set<string>;
}

export function getChangedScope(
  projectRoot: string,
  ref: string,
  db?: Database,
): ChangedScope {
  const resolved = resolveRef(projectRoot, ref, db);
  if (!refExists(projectRoot, resolved.sha)) {
    throw new UnresolvableRefError(ref);
  }
  const changed = scopeToProject(getChangedFiles(projectRoot, resolved.sha), projectRoot);
  return {
    label: resolved.label,
    paths: new Set(changed.map((f) => f.path)),
  };
}

export interface ScopedDrift {
  /** Entries whose affected file is in the changed set. */
  kept: DriftEntry[];
  /** Entries dropped because their affected file did not change. */
  excludedOtherFiles: number;
  /** Entries dropped because they are model-level (no single affected file). */
  excludedNonFileAnchored: number;
}

/**
 * Restrict drift entries to those touching a changed file. Detection itself is
 * unchanged — it still runs against the full building-block graph (so the
 * longest-prefix file→block assignment is intact); this only filters the
 * *reported* entries down to the diff. Model-level entries with no
 * `affectedFile` (e.g. new_dependency, missing_module) are excluded in scoped
 * mode and counted so nothing is dropped silently.
 */
export function scopeDriftToChangedFiles(
  entries: DriftEntry[],
  changed: Set<string>,
): ScopedDrift {
  const kept: DriftEntry[] = [];
  let excludedOtherFiles = 0;
  let excludedNonFileAnchored = 0;

  for (const entry of entries) {
    if (entry.affectedFile === null) {
      excludedNonFileAnchored++;
    } else if (changed.has(entry.affectedFile)) {
      kept.push(entry);
    } else {
      excludedOtherFiles++;
    }
  }

  return { kept, excludedOtherFiles, excludedNonFileAnchored };
}
