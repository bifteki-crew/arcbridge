import { execFileSync } from "node:child_process";
import { relative } from "node:path";
import type { Database } from "../db/connection.js";

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
  db?: Database,
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
 * Get list of changed files between a ref and HEAD, including uncommitted changes.
 * Merges committed diffs with staged+unstaged working tree changes so that
 * practice reviews and drift checks see all work, not just committed code.
 */
export function getChangedFiles(
  projectRoot: string,
  ref: string,
): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();

  try {
    // Verify the ref is valid before diffing — catches HEAD~1 on single-commit repos
    execFileSync("git", ["rev-parse", "--verify", ref], {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Committed changes since ref
    const output = execFileSync(
      "git",
      ["diff", "--name-status", "--no-renames", ref, "HEAD"],
      { cwd: projectRoot, encoding: "utf-8", timeout: 10000 },
    ).trim();

    if (output) {
      for (const line of output.split("\n")) {
        const [statusCode, ...pathParts] = line.split("\t");
        const path = pathParts.join("\t");
        byPath.set(path, { status: parseStatusCode(statusCode ?? "M"), path });
      }
    }
  } catch {
    // ref invalid — fall through to uncommitted only
  }

  // Always include uncommitted changes (staged + unstaged tracked files)
  for (const change of getUncommittedChanges(projectRoot)) {
    const existing = byPath.get(change.path);
    if (!existing) {
      // New file not in committed diff
      byPath.set(change.path, change);
    } else if (change.status === "deleted") {
      // Uncommitted delete overrides any committed status
      byPath.set(change.path, change);
    }
    // Otherwise keep committed "added"/"deleted" — more significant than
    // uncommitted "modified" for drift detection and practice reviews
  }

  return Array.from(byPath.values());
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
    );

    const lines = output.split("\n").filter((l) => l.length >= 3);
    if (lines.length === 0) return [];

    // Porcelain format: XY<space>filename (XY = 2-char status, then space, then path)
    // Don't trim() the full output — leading spaces in XY column are significant
    return lines.map((line) => {
      const statusCode = line.slice(0, 2).trim();
      const path = line.slice(3).replace(/\r$/, "");
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
  db: Database,
  key: "last_sync_commit" | "phase_sync_commit",
  sha: string,
): void {
  db.prepare(
    "INSERT OR REPLACE INTO arcbridge_meta (key, value) VALUES (?, ?)",
  ).run(key, sha);
}

/**
 * Get the git repository root directory.
 */
export function getRepoRoot(projectRoot: string): string | null {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: projectRoot, encoding: "utf-8", timeout: 5000 },
    ).trim();
  } catch {
    return null;
  }
}

/**
 * Filter changed files to only those within the project directory.
 * In monorepo setups, getChangedFiles returns all repo changes —
 * this scopes them to the project's subdirectory.
 */
export function scopeToProject(
  changedFiles: ChangedFile[],
  projectRoot: string,
): ChangedFile[] {
  const repoRoot = getRepoRoot(projectRoot);
  if (!repoRoot) return changedFiles;

  // Normalize: get project path relative to repo root
  const projectRel = relative(repoRoot, projectRoot);

  // If project IS the repo root, no filtering needed
  if (!projectRel || projectRel === ".") return changedFiles;

  const prefix = projectRel.replace(/\\/g, "/");
  return changedFiles
    .filter((f) => f.path.startsWith(prefix + "/") || f.path === prefix)
    .map((f) => ({
      ...f,
      // Optionally strip the prefix so paths are project-relative
      path: f.path.startsWith(prefix + "/") ? f.path.slice(prefix.length + 1) : f.path,
    }));
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
