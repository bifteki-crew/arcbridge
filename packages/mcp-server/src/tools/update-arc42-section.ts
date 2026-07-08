import { existsSync, readFileSync } from "node:fs";
import { atomicWriteFileSync, resolveWithin } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, type ToolResult } from "../helpers.js";

/**
 * Split a markdown file with YAML frontmatter into frontmatter block and body.
 * Returns the raw frontmatter string (including ---) and the markdown body.
 */
function splitFrontmatter(raw: string): { frontmatterBlock: string; body: string } {
  if (!raw.startsWith("---")) {
    return { frontmatterBlock: "", body: raw };
  }
  const endIndex = raw.indexOf("\n---", 3);
  if (endIndex < 0) {
    // Unterminated frontmatter — treat entire content as body to avoid crashing tool handler
    return { frontmatterBlock: "", body: raw };
  }
  const fmEnd = endIndex + 4; // include the closing ---\n
  return {
    frontmatterBlock: raw.slice(0, fmEnd),
    body: raw.slice(fmEnd).replace(/^\n/, ""),
  };
}

/**
 * Sections that this tool manages — plain markdown with frontmatter.
 * Building blocks (05) and quality scenarios (10) have dedicated tools.
 * ADRs (09) are individual files managed by arcbridge_arc42 (action: propose).
 */
export const VALID_SECTIONS = [
  "01-introduction",
  "02-constraints",
  "03-context",
  "04-solution-strategy",
  "06-runtime-views",
  "07-deployment",
  "08-crosscutting",
  "11-risks-debt",
] as const;

export type SectionId = (typeof VALID_SECTIONS)[number];

const SECTION_LABELS: Record<SectionId, string> = {
  "01-introduction": "Introduction & Goals",
  "02-constraints": "Architecture Constraints",
  "03-context": "Context & Scope",
  "04-solution-strategy": "Solution Strategy",
  "06-runtime-views": "Runtime Views",
  "07-deployment": "Deployment View",
  "08-crosscutting": "Crosscutting Concepts",
  "11-risks-debt": "Risks & Technical Debt",
};

export interface Arc42SectionParams {
  target_dir: string;
  section: SectionId;
  content?: string;
}

/** `read`/`update` actions of arcbridge_arc42 (content present = update). */
export async function handleArc42Section(
  ctx: ServerContext,
  params: Arc42SectionParams,
): Promise<ToolResult> {
  const db = ensureDb(ctx, params.target_dir);
  if (!db) return notInitialized();

  // section is enum-validated; containment is defense in depth
  const filePath = resolveWithin(
    params.target_dir,
    ".arcbridge",
    "arc42",
    `${params.section}.md`,
  );

  if (!existsSync(filePath)) {
    return textResult(
      `Section file \`${params.section}.md\` not found. Run \`arcbridge_init_project\` first.`,
    );
  }

  // Read mode — return current content
  if (params.content === undefined) {
    const raw = readFileSync(filePath, "utf-8");
    const { body } = splitFrontmatter(raw);
    const label = SECTION_LABELS[params.section];

    const trimmedBody = body.trim();
    const startsWithHeading = /^#\s+/.test(trimmedBody);

    const outputLines: string[] = [];
    if (!startsWithHeading) {
      outputLines.push(`# ${label}`, "");
    }
    outputLines.push(
      `**File:** \`.arcbridge/arc42/${params.section}.md\``,
      "",
      trimmedBody,
    );

    return textResult(outputLines.join("\n"));
  }

  // Write mode — update the markdown body, preserve frontmatter
  const raw = readFileSync(filePath, "utf-8");
  const { frontmatterBlock } = splitFrontmatter(raw);

  const updated = frontmatterBlock
    ? `${frontmatterBlock}\n${params.content}\n`
    : `${params.content}\n`;
  atomicWriteFileSync(filePath, updated);

  const label = SECTION_LABELS[params.section];
  return textResult(
    `Updated **${label}** (\`${params.section}.md\`). Frontmatter preserved.`,
  );
}
