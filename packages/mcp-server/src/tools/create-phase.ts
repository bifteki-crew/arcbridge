import { addPhaseToYaml, refreshFromDocs } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult, type ToolResult } from "../helpers.js";

export interface CreatePhaseParams {
  target_dir: string;
  name: string;
  description: string;
  phase_number?: number;
  gate_requirements: string[];
}

/** `create` action of arcbridge_manage_phases. */
export async function handleCreatePhase(
  ctx: ServerContext,
  params: CreatePhaseParams,
): Promise<ToolResult> {
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
        `Use \`arcbridge_manage_tasks\` (action: create) with phase ID \`${phaseId}\` to add tasks.`,
      );

      return textResult(lines.join("\n"));
}
