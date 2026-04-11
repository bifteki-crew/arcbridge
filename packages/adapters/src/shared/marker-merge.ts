import { writeFileSync, existsSync, readFileSync } from "node:fs";

export const MARKER = "<!-- arcbridge-generated -->";

/**
 * Write content to a file with marker-based merge.
 * Preserves any user content above the marker, replaces everything from the marker onwards.
 * If the file has no marker, appends after existing content.
 * If the file doesn't exist, creates it with the marker.
 */
export function writeWithMarkerMerge(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, "utf-8");
    const markerIndex = existing.indexOf(MARKER);

    if (markerIndex >= 0) {
      const userContent = existing.slice(0, markerIndex).trimEnd();
      const prefix = userContent ? `${userContent}\n\n` : "";
      writeFileSync(filePath, `${prefix}${MARKER}\n\n${content}`, "utf-8");
    } else {
      const existingTrimmed = existing.trimEnd();
      const prefix = existingTrimmed ? `${existingTrimmed}\n\n` : "";
      writeFileSync(filePath, `${prefix}${MARKER}\n\n${content}`, "utf-8");
    }
  } else {
    writeFileSync(filePath, `${MARKER}\n\n${content}`, "utf-8");
  }
}
