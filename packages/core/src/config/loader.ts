import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";
import { ArcBridgeConfigSchema, type ArcBridgeConfig } from "../schemas/config.js";

/**
 * Load and validate the ArcBridge config from `.arcbridge/config.yaml`.
 * Returns null if the file doesn't exist or fails validation.
 */
export function loadConfig(
  projectRoot: string,
): { config: ArcBridgeConfig | null; error: string | null } {
  const configPath = join(projectRoot, ".arcbridge", "config.yaml");

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = ArcBridgeConfigSchema.safeParse(yaml.parse(raw));
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
