import { z } from "zod";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

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
 * ADRs (09) are individual files managed by propose_arc42_update.
 */
const VALID_SECTIONS = [
  "01-introduction",
  "02-constraints",
  "03-context",
  "04-solution-strategy",
  "06-runtime-views",
  "07-deployment",
  "08-crosscutting",
  "11-risks-debt",
] as const;

type SectionId = (typeof VALID_SECTIONS)[number];

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

export function registerUpdateArc42Section(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_update_arc42_section",
    "Read or update an arc42 documentation section. Omit `content` to read the current section. Provide `content` to replace the markdown body (frontmatter is preserved automatically). Use this for sections without dedicated tools: introduction, constraints, context, solution strategy, runtime views, deployment, crosscutting concepts, risks & debt. For building blocks use `arcbridge_get_building_blocks`, for quality scenarios use `arcbridge_get_quality_scenarios`.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      section: z
        .enum(VALID_SECTIONS)
        .describe(
          "Arc42 section to read or update: " +
          VALID_SECTIONS.map((s) => `${s} (${SECTION_LABELS[s]})`).join(", "),
        ),
      content: z
        .string()
        .optional()
        .describe(
          "New markdown content for the section body. Omit to read the current content. " +
          "Frontmatter is preserved automatically — only provide the markdown body.",
        ),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const filePath = join(
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
      writeFileSync(filePath, updated, "utf-8");

      const label = SECTION_LABELS[params.section];
      return textResult(
        `Updated **${label}** (\`${params.section}.md\`). Frontmatter preserved.`,
      );
    },
  );
}
