import {
  writeFileSync,
  renameSync,
  unlinkSync,
  statSync,
  chmodSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { dirname, basename, join, resolve, relative, isAbsolute, sep } from "node:path";

let tmpCounter = 0;

/**
 * Resolve path segments against a root directory, guaranteeing the result
 * stays inside it. Throws when traversal segments (`..`) or absolute paths
 * would escape — use for any path built from external input (tool params,
 * database rows, YAML content).
 *
 * Containment is lexical: symlinks inside the root are not resolved.
 */
export function resolveWithin(root: string, ...segments: string[]): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(resolvedRoot, ...segments);
  const rel = relative(resolvedRoot, resolved);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(
      `Path escapes project root: ${segments.join("/")} resolves outside ${resolvedRoot}`,
    );
  }
  return resolved;
}

/**
 * Write a file atomically: write to a temp file in the same directory,
 * then rename over the target. A crash or full disk mid-write leaves the
 * original file untouched instead of truncated or half-written.
 *
 * Matches writeFileSync semantics that a bare rename would break:
 * - symlinks are resolved first, so the rename replaces the link's target,
 *   not the link itself
 * - an existing target's permission bits are preserved
 *
 * The temp file lives next to the resolved target — rename is only atomic
 * within a filesystem.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  let target: string;
  let mode: number | undefined;
  try {
    target = realpathSync(filePath);
    mode = statSync(target).mode & 0o777;
  } catch {
    // Path doesn't exist. A dangling symlink still needs write-through
    // semantics (writeFileSync would create the link's target) — atomicity
    // is moot since there's no existing data to protect.
    let isDanglingLink = false;
    try {
      isDanglingLink = lstatSync(filePath).isSymbolicLink();
    } catch {
      /* nothing at this path */
    }
    if (isDanglingLink) {
      writeFileSync(filePath, content, "utf-8");
      return;
    }
    target = filePath;
  }

  const tmpPath = join(
    dirname(target),
    `.${basename(target)}.${process.pid}.${tmpCounter++}.tmp`,
  );
  try {
    writeFileSync(tmpPath, content, "utf-8");
    // chmod rather than writeFileSync's mode option — the latter is masked
    // by the process umask, chmod applies the bits exactly
    if (mode !== undefined) chmodSync(tmpPath, mode);
    renameSync(tmpPath, target);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* temp file may not exist */
    }
    throw err;
  }
}
