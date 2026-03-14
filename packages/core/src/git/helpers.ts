import { execFileSync } from "node:child_process";
import type Database from "better-sqlite3";

export interface ChangedFile {
  status: "added" | "modified" | "deleted" | "renamed";
  path: string;
  oldPath?: string;
}

export interface GitRef {
  sha: string;
  label: string;
}

/**
 * Resolve a human-readable "since" value to a git ref.
 *
 * - "last-commit" → HEAD~1
 * - "last-session" / "last-sync" → commit stored in arcbridge_meta, or HEAD~1 fallback
 * - "last-phase" → commit stored in arcbridge_meta under "phase_sync_commit", or HEAD~5 fallback
 * - anything else → treated as a literal git ref (branch, tag, SHA)
 */
export function resolveRef(
  projectRoot: string,
  since: string,
  db?: Database.Database,
): GitRef {
  switch (since) {
    case "last-commit":
      return { sha: "HEAD~1", label: "last commit" };

    case "last-session":
    case "last-sync": {
      if (db) {
        const row = db
          .prepare("SELECT value FROM arcbridge_meta WHERE key = 'last_sync_commit'")
          .get() as { value: string } | undefined;
        if (row) return { sha: row.value, label: `last sync (${row.value.slice(0, 7)})` };
      }
      return { sha: "HEAD~1", label: "last commit (no sync point found)" };
    }

    case "last-phase": {
      if (db) {
        const row = db
          .prepare("SELECT value FROM arcbridge_meta WHERE key = 'phase_sync_commit'")
          .get() as { value: string } | undefined;
        if (row) return { sha: row.value, label: `last phase (${row.value.slice(0, 7)})` };
      }
      return { sha: "HEAD~5", label: "last 5 commits (no phase sync point found)" };
    }

    default:
      return { sha: since, label: since };
  }
}

/**
 * Get list of changed files between a ref and HEAD.
 */
export function getChangedFiles(
  projectRoot: string,
  ref: string,
): ChangedFile[] {
  try {
    // Verify the ref is valid before diffing — catches HEAD~1 on single-commit repos
    execFileSync("git", ["rev-parse", "--verify", ref], {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const output = execFileSync(
      "git",
      ["diff", "--name-status", "--no-renames", ref, "HEAD"],
      { cwd: projectRoot, encoding: "utf-8", timeout: 10000 },
    ).trim();

    if (!output) return [];

    return output.split("\n").map((line) => {
      const [statusCode, ...pathParts] = line.split("\t");
      const path = pathParts.join("\t");
      const status = parseStatusCode(statusCode ?? "M");
      return { status, path };
    });
  } catch {
    // Also try unstaged changes if ref comparison fails
    return getUncommittedChanges(projectRoot);
  }
}

/**
 * Get uncommitted (staged + unstaged) changes.
 */
export function getUncommittedChanges(projectRoot: string): ChangedFile[] {
  try {
    const output = execFileSync(
      "git",
      ["status", "--porcelain", "-uno"],
      { cwd: projectRoot, encoding: "utf-8", timeout: 5000 },
    ).trim();

    if (!output) return [];

    return output.split("\n").map((line) => {
      const statusCode = line.slice(0, 2).trim();
      const path = line.slice(3);
      const status = statusCode === "D" ? "deleted" : statusCode === "A" ? "added" : "modified";
      return { status, path };
    });
  } catch {
    return [];
  }
}

/**
 * Get current HEAD commit SHA.
 */
export function getHeadSha(projectRoot: string): string | null {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: projectRoot, encoding: "utf-8", timeout: 5000 },
    ).trim();
  } catch {
    return null;
  }
}

/**
 * Store the current sync point in arcbridge_meta.
 */
export function setSyncCommit(
  db: Database.Database,
  key: "last_sync_commit" | "phase_sync_commit",
  sha: string,
): void {
  db.prepare(
    "INSERT OR REPLACE INTO arcbridge_meta (key, value) VALUES (?, ?)",
  ).run(key, sha);
}

function parseStatusCode(code: string): ChangedFile["status"] {
  switch (code.charAt(0)) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}
