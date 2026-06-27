import {
  detectDrift,
  writeDriftLog,
  loadConfig,
  refreshFromDocs,
  indexConfiguredProject,
  type DriftOptions,
} from "@arcbridge/core";
import { openProjectDb } from "../project.js";

export async function drift(dir: string, json: boolean, reindex = false): Promise<void> {
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
    const entries = detectDrift(db, driftOpts);
    writeDriftLog(db, entries);

    const errors = entries.filter((e) => e.severity === "error").length;

    if (json) {
      console.log(JSON.stringify({ drift: entries }, null, 2));
    } else if (entries.length === 0) {
      console.log("No drift detected.");
    } else {
      console.log(`Found ${entries.length} drift issue(s):\n`);
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
    }

    // Fail the process on error-severity drift regardless of output mode, so CI
    // gates work with or without --json.
    if (errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}
