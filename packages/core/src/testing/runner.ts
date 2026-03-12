import { execFileSync } from "node:child_process";
import type Database from "better-sqlite3";

export interface ScenarioTestResult {
  scenarioId: string;
  scenarioName: string;
  testPaths: string[];
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface VerifyResult {
  results: ScenarioTestResult[];
  updated: number;
  errors: string[];
}

interface ScenarioRow {
  id: string;
  name: string;
  linked_tests: string;
  verification: string;
  status: string;
}

/**
 * Run linked tests for automatic quality scenarios and update their status in the DB.
 *
 * Only runs tests for scenarios with:
 * - verification = "automatic" or "semi-automatic"
 * - non-empty linked_tests array
 *
 * Optionally filter by specific scenario IDs.
 */
export function verifyScenarios(
  db: Database.Database,
  projectRoot: string,
  options: {
    testCommand: string;
    timeoutMs: number;
    scenarioIds?: string[];
  },
): VerifyResult {
  const results: ScenarioTestResult[] = [];
  const errors: string[] = [];

  // Fetch testable scenarios
  let scenarios: ScenarioRow[];
  if (options.scenarioIds && options.scenarioIds.length > 0) {
    const placeholders = options.scenarioIds.map(() => "?").join(", ");
    scenarios = db
      .prepare(
        `SELECT id, name, linked_tests, verification, status FROM quality_scenarios
         WHERE id IN (${placeholders}) AND linked_tests != '[]'`,
      )
      .all(...options.scenarioIds) as ScenarioRow[];
  } else {
    scenarios = db
      .prepare(
        `SELECT id, name, linked_tests, verification, status FROM quality_scenarios
         WHERE verification IN ('automatic', 'semi-automatic') AND linked_tests != '[]'`,
      )
      .all() as ScenarioRow[];
  }

  if (scenarios.length === 0) {
    return { results, updated: 0, errors };
  }

  // Parse the test command into executable + args
  const parts = options.testCommand.split(/\s+/);
  const executable = parts[0]!;
  const baseArgs = parts.slice(1);

  let updated = 0;
  const updateStmt = db.prepare(
    "UPDATE quality_scenarios SET status = ? WHERE id = ?",
  );

  for (const scenario of scenarios) {
    let testPaths: string[];
    try {
      testPaths = JSON.parse(scenario.linked_tests) as string[];
    } catch {
      errors.push(`${scenario.id}: invalid linked_tests JSON`);
      continue;
    }

    if (testPaths.length === 0) continue;

    const start = Date.now();
    let passed = false;
    let output = "";

    try {
      const result = execFileSync(executable, [...baseArgs, ...testPaths], {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: options.timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB
        stdio: ["pipe", "pipe", "pipe"],
      });
      passed = true;
      output = result.slice(-2000); // Keep last 2000 chars
    } catch (err) {
      passed = false;
      if (err && typeof err === "object" && "stdout" in err) {
        const execErr = err as { stdout?: string; stderr?: string; status?: number };
        output = (execErr.stdout ?? execErr.stderr ?? "").slice(-2000);
      } else {
        output = err instanceof Error ? err.message : String(err);
      }
    }

    const durationMs = Date.now() - start;
    const newStatus = passed ? "passing" : "failing";

    // Only update if status changed
    if (scenario.status !== newStatus) {
      updateStmt.run(newStatus, scenario.id);
      updated++;
    }

    results.push({
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      testPaths,
      passed,
      output,
      durationMs,
    });
  }

  return { results, updated, errors };
}
