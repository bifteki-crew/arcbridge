/**
 * A compact map of the architecture, embedded directly into each platform's
 * always-loaded instruction file.
 *
 * Why push this in rather than let the agent fetch it: measured on a real
 * repository, `get_building_blocks` answers in ~300 tokens against a codebase of
 * ~300,000 — the information is essentially free. But an unattended agent given
 * the tools, and a CLAUDE.md that says in bold "use them throughout your work",
 * called them ZERO times across benchmark runs; it read files instead, which at
 * the moment of choosing is the cheaper, more certain option. Instruction had
 * already lost to the path of least resistance, so asking more loudly was not
 * going to help.
 *
 * Handing over the map removes the choice. Architectural awareness arrives with
 * the session whether or not the agent thinks to ask for it, and the tools are
 * left to answer the deeper questions a static summary cannot.
 */

export interface BlockSummary {
  id: string;
  name: string;
  codePaths: string[];
  responsibility: string;
  /** Blocks this one is allowed to depend on. */
  interfaces: string[];
  service?: string | null;
}

/** Keep the section bounded: this ships in every session's context. */
const MAX_BLOCKS = 40;
const MAX_RESPONSIBILITY_CHARS = 140;

/**
 * Render the map, or an empty string when there is nothing useful to say — an
 * empty heading in every agent's context would be pure cost.
 */
export function renderArchitectureMap(blocks: BlockSummary[]): string {
  if (blocks.length === 0) return "";

  const shown = blocks.slice(0, MAX_BLOCKS);
  const lines: string[] = [
    "## Architecture map",
    "",
    "The building blocks of this project and the paths they own. A file belongs to",
    "the block with the **longest matching path**, so nested entries win over their",
    "parents. Put new code inside an existing block where one fits.",
    "",
    "| Block | Owns | May depend on | Responsibility |",
    "|---|---|---|---|",
  ];

  for (const b of shown) {
    const owns = b.codePaths.length > 0 ? b.codePaths.map((p) => `\`${p}\``).join(", ") : "—";
    const deps = b.interfaces.length > 0 ? b.interfaces.join(", ") : "—";
    lines.push(`| \`${b.id}\` | ${owns} | ${deps} | ${summarize(b.responsibility)} |`);
  }

  if (blocks.length > shown.length) {
    lines.push("", `_${blocks.length - shown.length} further block(s) omitted — call \`arcbridge_get_building_blocks\` for the full set._`);
  }

  lines.push(
    "",
    "**Depending on a block not listed in its row is architectural drift** and is",
    "reported as an error. If a change needs a dependency that is not declared,",
    "that is a decision to record in the model, not to work around.",
    "",
  );

  return lines.join("\n");
}

/** One line, no table-breaking pipes or newlines. */
function summarize(responsibility: string): string {
  const flat = responsibility.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  if (flat.length <= MAX_RESPONSIBILITY_CHARS) return flat;
  return `${flat.slice(0, MAX_RESPONSIBILITY_CHARS - 1).trimEnd()}…`;
}
