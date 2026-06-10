import { writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, basename, join } from "node:path";

let tmpCounter = 0;

/**
 * Write a file atomically: write to a temp file in the same directory,
 * then rename over the target. A crash or full disk mid-write leaves the
 * original file untouched instead of truncated or half-written.
 *
 * The temp file must live in the same directory — rename is only atomic
 * within a filesystem.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${tmpCounter++}.tmp`,
  );
  try {
    writeFileSync(tmpPath, content, "utf-8");
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
