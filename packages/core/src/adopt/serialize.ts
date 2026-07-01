import matter from "gray-matter";
import type { AdoptProposal, ProposedBlock } from "./propose.js";

/**
 * Render a proposal as a `05-building-blocks.md` document (YAML frontmatter +
 * markdown body) matching BuildingBlocksFrontmatterSchema, so it can be written
 * straight to `.arcbridge/arc42/05-building-blocks.md` and loaded by
 * refreshFromDocs.
 */
export function proposalToBuildingBlocksMarkdown(
  proposal: AdoptProposal,
  lastSynced: string,
): string {
  const frontmatter = {
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
  return matter.stringify(buildBody(proposal), frontmatter);
}

function blockLine(b: ProposedBlock): string {
  const deps = b.interfaces.length ? ` → ${b.interfaces.join(", ")}` : "";
  const syms = b.evidence.topSymbols.length
    ? ` Key exports: ${b.evidence.topSymbols.join(", ")}.`
    : "";
  return [
    `### ${b.name} \`${b.id}\``,
    "",
    `**Code:** \`${b.code_paths.map((p) => p || ".").join("`, `")}\`${deps}`,
    "",
    `> ${b.responsibility}`,
    "",
    `${b.evidence.fileCount} file(s), ${b.evidence.internalEdges} internal / ` +
      `${b.evidence.inboundEdges} inbound / ${b.evidence.outboundEdges} outbound edges ` +
      `(confidence: ${b.confidence}).${syms}`,
  ].join("\n");
}

function buildBody(proposal: AdoptProposal): string {
  const { stats } = proposal;
  const lines = [
    "# Building Block View",
    "",
    "> Proposed by `arcbridge adopt` from the indexed codebase. Responsibilities are",
    "> auto-generated — review and refine them, then commit.",
    "",
    `Derived from ${stats.files} files / ${stats.symbols} symbols / ${stats.edges} ` +
      `dependency edges across service(s): ${stats.services.join(", ")}.`,
    "",
    "## Level 1: Top-Level Decomposition",
    "",
    ...proposal.blocks.map(blockLine).flatMap((s) => [s, ""]),
  ];
  if (proposal.unassigned.length) {
    lines.push(
      "## Unassigned files",
      "",
      "These indexed files weren't claimed by any block (no extractable symbols " +
        "in a clustered directory):",
      "",
      ...proposal.unassigned.slice(0, 20).map((f) => `- \`${f}\``),
      "",
    );
  }
  return lines.join("\n");
}
