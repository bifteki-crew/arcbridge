import { writeFileSync, renameSync, unlinkSync, statSync, chmodSync } from "node:fs";
import { dirname, basename, join } from "node:path";

let tmpCounter = 0;

/**
 * Write a file atomically: write to a temp file in the same directory,
 * then rename over the target. A crash or full disk mid-write leaves the
 * original file untouched instead of truncated or half-written.
 *
 * The temp file must live in the same directory — rename is only atomic
 * within a filesystem. An existing target's permission bits are preserved
 * (the rename would otherwise replace them with the temp file's default).
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  let mode: number | undefined;
  try {
    mode = statSync(filePath).mode & 0o777;
  } catch {
    /* target doesn't exist yet — keep default mode */
  }

  const tmpPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${tmpCounter++}.tmp`,
  );
  try {
    writeFileSync(tmpPath, content, "utf-8");
    // chmod rather than writeFileSync's mode option — the latter is masked
    // by the process umask, chmod applies the bits exactly
    if (mode !== undefined) chmodSync(tmpPath, mode);
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* temp file may not exist */
    }
    throw err;
  }
}
