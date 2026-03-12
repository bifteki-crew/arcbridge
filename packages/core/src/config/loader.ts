import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";
import { ArchLensConfigSchema, type ArchLensConfig } from "../schemas/config.js";

/**
 * Load and validate the ArchLens config from `.archlens/config.yaml`.
 * Returns null if the file doesn't exist or fails validation.
 */
export function loadConfig(
  projectRoot: string,
): { config: ArchLensConfig | null; error: string | null } {
  const configPath = join(projectRoot, ".archlens", "config.yaml");

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = ArchLensConfigSchema.safeParse(yaml.parse(raw));
    if (parsed.success) {
      return { config: parsed.data, error: null };
    }
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { config: null, error: `Config validation failed: ${issues}` };
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { config: null, error: null };
    }
    return { config: null, error: `Config load error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
