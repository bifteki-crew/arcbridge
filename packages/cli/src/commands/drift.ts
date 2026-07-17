import {
  detectDrift,
  writeDriftLog,
  loadConfig,
  refreshFromDocs,
  indexConfiguredProject,
  getChangedScope,
  scopeDriftToChangedFiles,
  UnresolvableRefError,
  type DriftEntry,
  type DriftOptions,
} from "@arcbridge/core";
import { openProjectDb } from "../project.js";

interface BaseMeta {
  ref: string;
  changedFiles: number;
  excludedOtherFiles: number;
  excludedModelLevel: number;
}

export async function drift(
  dir: string,
  json: boolean,
  reindex = false,
  base?: string,
): Promise<void> {
  const db = openProjectDb(dir);

  try {
    const configResult = loadConfig(dir);

    // --reindex makes drift self-sufficient (e.g. in CI, where index.db is not
    // committed): refresh blocks/scenarios from docs and re-scan the code so
    // symbol-based checks (undocumented modules, dependency violations) are real.
    if (reindex) {
      const refreshWarnings = refreshFromDocs(db, dir);
      const { warnings: indexWarnings } = await indexConfiguredProject(db, dir, {
        services: configResult.config?.services ?? [],
      });
      // Surface reindex warnings (e.g. skipped non-TS services, missing
      // tsconfig) so CI output shows what was and wasn't indexed.
      for (const w of [...refreshWarnings, ...indexWarnings]) {
        console.warn(`  [reindex] ${w}`);
      }
    }

    const driftOpts: DriftOptions = {
      projectType: configResult.config?.project_type,
      ignorePaths: configResult.config?.drift?.ignore_paths,
    };
    // Detection always runs against the full building-block graph so the
    // longest-prefix file→block assignment is intact; --base only scopes the
    // *reported* entries + exit code down to the diff.
    const allEntries = detectDrift(db, driftOpts);
    // The drift_log records the full model truth regardless of --base, so other
    // consumers (phase gates, metrics) still see a complete picture.
    writeDriftLog(db, allEntries);

    let entries: DriftEntry[] = allEntries;
    let baseMeta: BaseMeta | undefined;

    if (base !== undefined) {
      let scope;
      try {
        // Pass the open DB so last-sync/last-phase resolve the stored sync
        // points in arcbridge_meta instead of falling back to HEAD~1/HEAD~5.
        scope = getChangedScope(dir, base, db);
      } catch (err) {
        if (err instanceof UnresolvableRefError) {
          // Always emit the human-readable reason to stderr — the GitHub
          // Action captures stderr into its log, so CI stays diagnosable even
          // when stdout carries JSON.
          console.error(err.message);
          if (json) {
            console.log(JSON.stringify({ error: err.message }, null, 2));
          }
          process.exitCode = 1;
          return;
        }
        throw err;
      }
      const scoped = scopeDriftToChangedFiles(allEntries, scope.paths);
      entries = scoped.kept;
      baseMeta = {
        ref: scope.label,
        changedFiles: scope.paths.size,
        excludedOtherFiles: scoped.excludedOtherFiles,
        excludedModelLevel: scoped.excludedNonFileAnchored,
      };
    }

    const errors = entries.filter((e) => e.severity === "error").length;

    if (json) {
      console.log(
        JSON.stringify(baseMeta ? { drift: entries, base: baseMeta } : { drift: entries }, null, 2),
      );
    } else if (entries.length === 0) {
      console.log(
        baseMeta
          ? `No drift detected on files changed since ${baseMeta.ref} (${baseMeta.changedFiles} file(s)).`
          : "No drift detected.",
      );
      printBaseFooter(baseMeta);
    } else {
      const scopeNote = baseMeta ? ` on files changed since ${baseMeta.ref}` : "";
      console.log(`Found ${entries.length} drift issue(s)${scopeNote}:\n`);
      for (const e of entries) {
        const icon =
          e.severity === "error"
            ? "[ERROR]"
            : e.severity === "warning"
              ? "[WARN] "
              : "[INFO] ";
        console.log(`  ${icon} ${e.kind}: ${e.description}`);
        if (e.affectedBlock) {
          console.log(`         Block: ${e.affectedBlock}`);
        }
        if (e.affectedFile) {
          console.log(`         File:  ${e.affectedFile}`);
        }
      }
      if (errors > 0) {
        console.log(`\n${errors} error(s) found — these block phase completion.`);
      }
      printBaseFooter(baseMeta);
    }

    // Fail the process on error-severity drift regardless of output mode, so CI
    // gates work with or without --json. In --base mode this reflects only the
    // drift on changed files — the point of a PR-incremental check.
    if (errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}

/** Report what --base excluded so nothing is dropped silently. */
function printBaseFooter(baseMeta: BaseMeta | undefined): void {
  if (!baseMeta) return;
  const parts: string[] = [];
  if (baseMeta.excludedOtherFiles > 0) parts.push(`${baseMeta.excludedOtherFiles} on unchanged files`);
  if (baseMeta.excludedModelLevel > 0) parts.push(`${baseMeta.excludedModelLevel} model-level (no single file)`);
  if (parts.length > 0) {
    console.log(`\n(--base: excluded ${parts.join(" + ")}; run without --base for the full report.)`);
  }
}
