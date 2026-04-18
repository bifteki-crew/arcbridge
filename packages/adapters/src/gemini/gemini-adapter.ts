import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";
import type { PlatformAdapter, AdapterOptions } from "../types.js";
import { generateSkills } from "../shared/skills.js";
import { writeWithMarkerMerge } from "../shared/marker-merge.js";
import { generateInstructions } from "../shared/instructions.js";
import { mcpCommand } from "../shared/mcp-command.js";

function generateSettingsJson(): string {
  const settings = {
    mcpServers: {
      arcbridge: mcpCommand(),
    },
  };
  return JSON.stringify(settings, null, 2) + "\n";
}

function yamlQuote(value: string): string {
  // Quote if value contains YAML-significant characters
  if (/[:#{}&*!|>'"%@`\n]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}

function generateAgentFile(role: AgentRole): string {
  const lines: string[] = [
    "---",
    `name: ${role.role_id}`,
    `description: ${yamlQuote(role.description)}`,
  ];

  // Build tools allowlist from role's required_tools (respects read_only constraint)
  const tools: string[] = role.required_tools.map(
    (tool) => `mcp_*_${tool}`,
  );
  if (role.read_only) {
    tools.push("read_file", "grep_search", "list_directory");
  }
  if (tools.length > 0) {
    lines.push("tools:");
    for (const tool of tools) {
      lines.push(`  - ${tool}`);
    }
  }

  const suggestedModel = role.model_preferences?.suggested_models?.gemini?.trim();
  if (suggestedModel) {
    lines.push(`model: ${yamlQuote(suggestedModel)}`);
  } else if (role.model_preferences.reasoning_depth === "high") {
    lines.push("model: gemini-2.5-pro");
  }

  lines.push("---", "");
  lines.push(role.system_prompt, "");

  return lines.join("\n");
}

export class GeminiAdapter implements PlatformAdapter {
  platform = "gemini";

  generateProjectConfig(targetDir: string, config: ArcBridgeConfig): void {
    const geminiDir = join(targetDir, ".gemini");
    mkdirSync(geminiDir, { recursive: true });

    // Generate .gemini/settings.json (MCP config)
    const settingsPath = join(geminiDir, "settings.json");
    if (!existsSync(settingsPath)) {
      writeFileSync(settingsPath, generateSettingsJson(), "utf-8");
    } else {
      // Add arcbridge MCP server if not already present
      try {
        const existing = JSON.parse(readFileSync(settingsPath, "utf-8")) as {
          mcpServers?: Record<string, unknown>;
        };
        if (!existing.mcpServers?.arcbridge) {
          existing.mcpServers = existing.mcpServers ?? {};
          existing.mcpServers.arcbridge = mcpCommand();
          writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
        }
      } catch {
        // Can't parse existing settings.json — leave it alone
      }
    }

    // Generate .gemini/styleguide.md and GEMINI.md (same content)
    const instructionsContent = generateInstructions(config);
    writeWithMarkerMerge(join(geminiDir, "styleguide.md"), instructionsContent);
    writeWithMarkerMerge(join(targetDir, "GEMINI.md"), instructionsContent);
  }

  generateAgentConfigs(targetDir: string, roles: AgentRole[], options?: AdapterOptions): void {
    // Generate .gemini/agents/*.md (Gemini subagents mapped from ArcBridge roles)
    const agentsDir = join(targetDir, ".gemini", "agents");
    mkdirSync(agentsDir, { recursive: true });

    for (const role of roles) {
      const content = generateAgentFile(role);
      writeFileSync(join(agentsDir, `${role.role_id}.md`), content, "utf-8");
    }

    // Generate missing skills (shared with Codex adapter — only writes if not present)
    generateSkills(targetDir, options?.force);
  }
}
