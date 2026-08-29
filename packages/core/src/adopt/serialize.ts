import { stringify } from "yaml";
import type { AdoptProposal } from "./propose.js";
import type { MergedBlock } from "./merge.js";

/**
 * Render a proposal as a `05-building-blocks.yaml` document matching
 * BuildingBlocksFileSchema, so it can be written straight to
 * `.arcbridge/arc42/05-building-blocks.yaml` and loaded by refreshFromDocs.
 *
 * A leading comment block carries the human-facing context (proposal stats,
 * "review the responsibilities" note) that the old markdown body used to hold —
 * YAML comments are ignored by the parser but visible to readers.
 */
export function proposalToBuildingBlocksYaml(
  proposal: AdoptProposal,
  lastSynced: string,
): string {
  const { stats } = proposal;
  const header = [
    `# Building blocks proposed by \`arcbridge adopt\` from the indexed codebase.`,
    `# Responsibilities are auto-generated — review and refine them, then commit.`,
    `# Derived from ${stats.files} files / ${stats.symbols} symbols / ${stats.edges} ` +
      `dependency edges across service(s): ${stats.services.join(", ")}.`,
    "",
  ].join("\n");

  const data = {
    section: "building-blocks",
    schema_version: 1,
    last_synced: lastSynced,
    blocks: proposal.blocks.map((b) => ({
      id: b.id,
      name: b.name,
      level: 1,
      code_paths: b.code_paths,
      interfaces: b.interfaces,
      quality_scenarios: [] as string[],
      adrs: [] as string[],
      responsibility: b.responsibility,
      service: b.service,
    })),
  };

  return header + stringify(data);
}

/**
 * Serialize an already-merged block set. Unlike the proposal serializer, the
 * header says the file is merged rather than generated — because most of what is
 * in it was written by a person, and a reader should not be told to treat their
 * own prose as auto-generated output.
 */
export function mergedBlocksToBuildingBlocksYaml(
  blocks: MergedBlock[],
  lastSynced: string,
): string {
  const header = [
    `# Building blocks: code_paths refreshed by \`arcbridge adopt --merge\`,`,
    `# everything else preserved from the existing model.`,
    "",
  ].join("\n");

  return header + stringify({
    section: "building-blocks",
    schema_version: 1,
    last_synced: lastSynced,
    blocks,
  });
}
