import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  collectReportData,
  renderReportHtml,
  resolveWithin,
} from "@arcbridge/core";
import { openProjectDb } from "../project.js";

/**
 * Generate a self-contained HTML report: architecture health (always available
 * from the committed model + latest drift run) plus agent activity (from
 * recorded telemetry, which may be empty). Derived output — regenerate freely.
 */
export async function report(
  dir: string,
  json: boolean,
  out?: string,
): Promise<void> {
  const db = openProjectDb(dir);

  try {
    const data = collectReportData(db, new Date().toISOString());

    if (json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // Default inside .arcbridge/ (gitignored reports dir); an explicit --out is
    // contained within the project so a stray path can't escape it.
    let target: string;
    try {
      target = out
        ? resolveWithin(dir, out)
        : resolveWithin(dir, ".arcbridge", "reports", "report.html");
    } catch {
      console.error(`Error: --out path '${out}' escapes the project directory.`);
      process.exitCode = 1;
      return;
    }

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderReportHtml(data), "utf-8");

    const { architecture: arch, activity } = data;
    const shown = relative(resolve(dir), target) || target;
    console.log(`Report written to ${shown}`);
    console.log(
      `  Architecture: ${arch.blocks.total} block(s), ${arch.drift.total} open drift ` +
        `(${arch.drift.bySeverity.error ?? 0} error), ` +
        `scenario pass rate ${arch.scenarios.passRate === null ? "not measured" : `${arch.scenarios.passRate}%`}`,
    );
    console.log(
      activity.hasData
        ? `  Activity: ${activity.totals.activities} recorded, ${activity.totals.tokens.toLocaleString("en-US")} tokens, $${activity.totals.costUsd.toFixed(4)}`
        : "  Activity: none recorded (enable metrics.auto_record, or have agents call record_activity)",
    );
  } finally {
    db.close();
  }
}
