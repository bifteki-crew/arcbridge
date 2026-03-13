import { detectDrift, writeDriftLog, loadConfig, type DriftOptions } from "@archlens/core";
import { openProjectDb } from "../project.js";

export async function drift(dir: string, json: boolean): Promise<void> {
  const db = openProjectDb(dir);

  try {
    const configResult = loadConfig(dir);
    const driftOpts: DriftOptions = {
      projectType: configResult.config?.project_type,
      ignorePaths: configResult.config?.drift?.ignore_paths,
    };
    const entries = detectDrift(db, driftOpts);
    writeDriftLog(db, entries);

    if (json) {
      console.log(JSON.stringify({ drift: entries }, null, 2));
    } else {
      if (entries.length === 0) {
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

        const errors = entries.filter((e) => e.severity === "error").length;
        if (errors > 0) {
          console.log(`\n${errors} error(s) found — these block phase completion.`);
          process.exitCode = 1;
        }
      }
    }
  } finally {
    db.close();
  }
}
