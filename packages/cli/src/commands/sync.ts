import {
  indexProject,
  detectDrift,
  writeDriftLog,
  inferTaskStatuses,
  applyInferences,
  getChangedFiles,
  resolveRef,
  getHeadSha,
  setSyncCommit,
  verifyScenarios,
  loadConfig,
  refreshFromDocs,
  type DriftEntry,
  type IndexResult,
  type TaskInferenceResult,
  type ChangedFile,
  type ScenarioTestResult,
  type DriftOptions,
} from "@arcbridge/core";
import { openProjectDb } from "../project.js";

interface SyncResult {
  reindex: { files: number; symbols: number; dependencies: number };
  drift: DriftEntry[];
  inferences: TaskInferenceResult[];
  scenarios: ScenarioTestResult[];
  changedFiles: ChangedFile[];
  syncCommit: string | null;
  warnings: string[];
}

export async function sync(dir: string, json: boolean): Promise<void> {
  const db = openProjectDb(dir);

  try {
    // Step 0: Refresh DB from arc42 docs (picks up manual edits to building blocks, scenarios, etc.)
    if (!json) console.log("Refreshing from docs...");
    const docWarnings = refreshFromDocs(db, dir);
    if (!json && docWarnings.length > 0) {
      for (const w of docWarnings) console.log(`  ${w}`);
    }

    // Step 1: Reindex
    if (!json) console.log("Reindexing...");
    const indexResult: IndexResult = await indexProject(db, { projectRoot: dir });
    if (!json)
      console.log(
        `  Indexed ${indexResult.filesProcessed} files, ${indexResult.symbolsIndexed} symbols, ${indexResult.dependenciesIndexed} deps`,
      );

    // Step 2: Detect drift
    if (!json) console.log("Checking drift...");
    const configForDrift = loadConfig(dir);
    const driftOpts: DriftOptions = {
      projectType: configForDrift.config?.project_type,
      ignorePaths: configForDrift.config?.drift?.ignore_paths,
    };
    const driftEntries = detectDrift(db, driftOpts);
    writeDriftLog(db, driftEntries);
    if (!json) {
      if (driftEntries.length === 0) {
        console.log("  No drift detected.");
      } else {
        console.log(`  Found ${driftEntries.length} drift issue(s)`);
        for (const e of driftEntries) {
          const icon =
            e.severity === "error" ? "[ERROR]" : e.severity === "warning" ? "[WARN] " : "[INFO] ";
          console.log(`    ${icon} ${e.kind}: ${e.description}`);
        }
      }
    }

    // Step 3: Infer task statuses
    if (!json) console.log("Inferring task statuses...");
    const currentPhase = db
      .prepare("SELECT id FROM phases WHERE status = 'in-progress' LIMIT 1")
      .get() as { id: string } | undefined;

    let inferences: TaskInferenceResult[] = [];
    if (currentPhase) {
      inferences = inferTaskStatuses(db, currentPhase.id);
      if (inferences.length > 0) {
        applyInferences(db, inferences, dir);
        if (!json) {
          console.log(`  Updated ${inferences.length} task(s):`);
          for (const inf of inferences) {
            console.log(
              `    ${inf.taskId}: ${inf.previousStatus} -> ${inf.inferredStatus} (${inf.reason})`,
            );
          }
        }
      } else {
        if (!json) console.log("  No task status changes inferred.");
      }
    } else {
      if (!json) console.log("  No active phase — skipping task inference.");
    }

    // Step 4: Verify quality scenarios with linked tests
    let scenarios: ScenarioTestResult[] = [];
    const configResult = loadConfig(dir);
    if (configResult.config) {
      const testCommand = configResult.config.testing.test_command;
      const timeoutMs = configResult.config.testing.timeout_ms;

      if (!json) console.log("Verifying quality scenarios...");
      const verifyResult = verifyScenarios(db, dir, { testCommand, timeoutMs });
      scenarios = verifyResult.results;

      if (!json) {
        if (scenarios.length === 0) {
          console.log("  No testable scenarios found.");
        } else {
          const passing = scenarios.filter((r) => r.passed).length;
          console.log(
            `  ${scenarios.length} scenario(s) verified: ${passing} passing, ${scenarios.length - passing} failing`,
          );
        }
      }
    } else {
      if (!json) console.log("  No config found — skipping scenario verification.");
    }

    // Step 5: Get changed files since last sync
    const warnings: string[] = [];
    let changedFiles: ChangedFile[] = [];
    try {
      const ref = resolveRef(dir, "last-sync", db);
      changedFiles = getChangedFiles(dir, ref.sha);
      if (!json && changedFiles.length > 0) {
        console.log(`Changed files since ${ref.label}: ${changedFiles.length}`);
      }
    } catch {
      const msg = "Could not determine changed files (git not available or no sync point).";
      warnings.push(msg);
      if (!json) console.log(`  ${msg}`);
    }

    // Step 6: Update sync point
    let syncCommit: string | null = null;
    try {
      const head = getHeadSha(dir);
      if (head) {
        syncCommit = head;
        setSyncCommit(db, "last_sync_commit", head);
        if (!json) console.log(`Sync point updated to ${head.slice(0, 7)}.`);
      }
    } catch {
      const msg = "Could not update sync point (git not available).";
      warnings.push(msg);
      if (!json) console.log(`  ${msg}`);
    }

    // Summary
    const result: SyncResult = {
      reindex: {
        files: indexResult.filesProcessed,
        symbols: indexResult.symbolsIndexed,
        dependencies: indexResult.dependenciesIndexed,
      },
      drift: driftEntries,
      inferences,
      scenarios,
      changedFiles,
      syncCommit,
      warnings,
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\nSync complete.");
      const errors = driftEntries.filter((e) => e.severity === "error").length;
      if (errors > 0) {
        console.log(`WARNING: ${errors} drift error(s) would block phase completion.`);
        process.exitCode = 1;
      }
    }
  } finally {
    db.close();
  }
}
