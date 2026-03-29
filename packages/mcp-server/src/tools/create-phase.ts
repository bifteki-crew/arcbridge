import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { addPhaseToYaml, refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";

export function registerCreatePhase(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_create_phase",
    "Create a new phase in the project plan. Use this to add phases beyond the initial 4-phase template when the project scope requires it.",
    {
      target_dir: z.string().describe("Absolute path to the project directory"),
      name: z.string().min(1).describe("Phase name (e.g., 'Integrations', 'Performance Optimization')"),
      description: z.string().min(1).describe("What this phase covers"),
      phase_number: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Phase number (default: next after highest existing phase)"),
      gate_requirements: z
        .array(z.string())
        .default([])
        .describe("Requirements that must be met to complete this phase"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      // Refresh DB from YAML to ensure phase numbers are current
      refreshFromDocs(db, params.target_dir);

      // Determine phase number
      const maxPhase = db
        .prepare("SELECT MAX(phase_number) as max FROM phases")
        .get() as { max: number | null };
      const phaseNumber = params.phase_number ?? ((maxPhase.max ?? -1) + 1);

      // Check for duplicate phase number
      const existing = db
        .prepare("SELECT id FROM phases WHERE phase_number = ?")
        .get(phaseNumber) as { id: string } | undefined;
      if (existing) {
        return textResult(
          `Phase number ${phaseNumber} already exists (\`${existing.id}\`). Choose a different number or omit to auto-assign.`,
        );
      }

      // Generate ID
      const slug = params.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 30) || "unnamed";
      const phaseId = `phase-${phaseNumber}-${slug}`;

      // Write to YAML first (source of truth)
      const yamlResult = addPhaseToYaml(params.target_dir, {
        id: phaseId,
        name: params.name,
        phase_number: phaseNumber,
        description: params.description,
        gate_requirements: params.gate_requirements,
      });

      if (!yamlResult.success) {
        return textResult(
          `Failed to create phase: ${yamlResult.warning ?? "YAML update failed"}`,
        );
      }

      // Sync DB from YAML (single source of truth)
      refreshFromDocs(db, params.target_dir);

      const lines = [
        `Phase created: **${phaseId}**`,
        "",
        `**Name:** ${params.name}`,
        `**Number:** ${phaseNumber}`,
        `**Status:** planned`,
        `**Description:** ${params.description}`,
      ];

      if (params.gate_requirements.length > 0) {
        lines.push("", "**Gate requirements:**");
        for (const r of params.gate_requirements) {
          lines.push(`- [ ] ${r}`);
        }
      }

      lines.push(
        "",
        `Use \`arcbridge_create_task\` with phase ID \`${phaseId}\` to add tasks.`,
      );

      return textResult(lines.join("\n"));
    },
  );
}
