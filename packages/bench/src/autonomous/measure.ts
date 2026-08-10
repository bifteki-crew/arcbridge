import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "node:fs";
import { cliEntry } from "../paths.js";

export interface DriftSummary {
  total: number;
  errors: number;
  warnings: number;
  byKind: Record<string, number>;
}

export interface Completion {
  built: boolean;
  buildDetail: string;
  artifacts: { id: string; label: string; passed: boolean }[];
  /** All required artifacts present AND the backend compiles. */
  complete: boolean;
}

/**
 * Restore the committed architecture model onto a finished run tree and measure
 * drift against it.
 *
 * This is what makes the comparison fair: the model is the RULER, applied
 * identically to both arms' output. Only one arm could see it while working. The
 * baseline is not penalised for lacking a file — it is measured against the same
 * architecture it was unknowingly building inside.
 */
export function measureDrift(runRoot: string, pristineRepo: string): DriftSummary {
  const modelDir = join(runRoot, ".arcbridge");
  // The baseline arm deleted it; the ArcBridge arm may have edited it, and an
  // edited model would move the goalposts. Both get the pristine one.
  rmSync(modelDir, { recursive: true, force: true });
  cpSync(join(pristineRepo, ".arcbridge"), modelDir, {
    recursive: true,
    filter: (src) => !src.endsWith("index.db") && !src.includes("index.db-"),
  });

  const raw = runCli(["drift", "--reindex", "--json"], runRoot);
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"))) as {
    drift?: { kind: string; severity: string }[];
    entries?: { kind: string; severity: string }[];
  };
  const entries = parsed.drift ?? parsed.entries ?? [];

  const byKind: Record<string, number> = {};
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;

  return {
    total: entries.length,
    errors: entries.filter((e) => e.severity === "error").length,
    warnings: entries.filter((e) => e.severity === "warning").length,
    byKind,
  };
}

/** Did the agent actually do the job? Measured, not asked. */
export function measureCompletion(runRoot: string): Completion {
  let built = false;
  let buildDetail: string;
  try {
    execFileSync("dotnet", ["build"], {
      cwd: join(runRoot, "api"),
      encoding: "utf-8",
      timeout: 300_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    built = true;
    buildDetail = "dotnet build succeeded";
  } catch (err) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer };
    const out = `${e.stdout?.toString() ?? ""}${e.stderr?.toString() ?? ""}`;
    const firstError = out.split("\n").find((l) => l.includes("error")) ?? "build failed";
    buildDetail = firstError.trim().slice(0, 200);
  }

  // Naming-agnostic on purpose: the task no longer dictates type or field names,
  // because the naming convention is what drift measures. A check that insisted on
  // "RoomDto" would fail a correct solution that called the type "Room" and would
  // confuse "did not finish" with "named it differently".
  const artifacts = [
    check(runRoot, "dto", "A room type exists on the backend", ["api"], /(class|record)\s+Room\w*/),
    check(runRoot, "endpoint", "A /api/rooms endpoint is served", ["api"], /["'/]api\/rooms|Route\("api\/\[controller\]"\)[\s\S]{0,400}class\s+Rooms/i),
    check(runRoot, "contract", "The room shape is typed in the frontend", ["frontend/src"], /(interface|type)\s+Room\w*/),
    check(runRoot, "client", "The frontend fetches rooms", ["frontend/src"], /["']\/api\/rooms/),
    check(runRoot, "component", "A component renders rooms", ["frontend/src/components"], /Room/),
  ];

  return {
    built,
    buildDetail,
    artifacts,
    complete: built && artifacts.every((a) => a.passed),
  };
}

function check(
  runRoot: string,
  id: string,
  label: string,
  dirs: string[],
  pattern: RegExp,
): { id: string; label: string; passed: boolean } {
  for (const dir of dirs) {
    const base = join(runRoot, dir);
    if (!existsSync(base)) continue;
    for (const file of walk(base)) {
      try {
        if (pattern.test(readFileSync(file, "utf-8"))) return { id, label, passed: true };
      } catch {
        continue;
      }
    }
  }
  return { id, label, passed: false };
}

/** Source files only — build output would produce false positives. */
function walk(dir: string): string[] {
  return globSync("**/*.{cs,ts,tsx}", { cwd: dir })
    .filter((rel) => !rel.includes("bin/") && !rel.includes("obj/") && !rel.includes("node_modules/"))
    .map((rel) => join(dir, rel));
}

function runCli(args: string[], cwd: string): string {
  try {
    return execFileSync(process.execPath, [cliEntry, ...args], {
      cwd,
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // `drift` exits non-zero when it finds error-severity drift — which is
    // exactly the case being measured, so stdout still holds the JSON.
    const e = err as { stdout?: string | Buffer };
    const out = e.stdout?.toString() ?? "";
    if (out.includes("{")) return out;
    throw err;
  }
}
