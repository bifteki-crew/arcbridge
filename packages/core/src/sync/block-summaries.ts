import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { BuildingBlocksFileSchema } from "../schemas/building-blocks.js";

/** The subset of a building block worth putting into every agent session. */
export interface BlockSummary {
  id: string;
  name: string;
  codePaths: string[];
  responsibility: string;
  interfaces: string[];
  service?: string | null;
  /**
   * Carried so `adopt --merge` can preserve them. The architecture map ignores
   * these, but a merge that dropped them would quietly delete the links a person
   * made between a block and its quality scenarios or decisions — exactly the
   * loss the merge exists to prevent.
   */
  level?: number;
  qualityScenarios?: string[];
  adrs?: string[];
}

/**
 * Read the building blocks straight from YAML — the source of truth — rather than
 * from the derived index.
 *
 * Deliberately reads the file rather than the database: this runs during `init`
 * before anything is indexed, and during `sync` where the YAML has just been
 * refreshed. Going to the source avoids depending on the order in which a command
 * happens to populate its database, and it means a hand-edited model is reflected
 * immediately.
 *
 * Returns an empty array when the file is absent or malformed. A missing map is a
 * missing section in a generated instruction file; it must never fail the command
 * that was only regenerating configs.
 */
export function readBlockSummaries(projectRoot: string): BlockSummary[] {
  const path = join(projectRoot, ".arcbridge", "arc42", "05-building-blocks.yaml");
  if (!existsSync(path)) return [];

  try {
    const parsed = BuildingBlocksFileSchema.safeParse(parse(readFileSync(path, "utf-8")));
    if (!parsed.success) return [];
    return parsed.data.blocks.map((b) => ({
      id: b.id,
      name: b.name,
      codePaths: b.code_paths ?? [],
      responsibility: b.responsibility ?? "",
      interfaces: b.interfaces ?? [],
      // The schema defaults this to "main", so it is always a string.
      service: b.service,
      level: b.level,
      qualityScenarios: b.quality_scenarios ?? [],
      adrs: b.adrs ?? [],
    }));
  } catch {
    return [];
  }
}
