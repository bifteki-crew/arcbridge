import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";
import type { PlatformAdapter, AdapterOptions } from "../types.js";
import { generateSkills } from "../shared/skills.js";
import { writeWithMarkerMerge } from "../shared/marker-merge.js";
import { generateInstructions } from "../shared/instructions.js";
import { mcpCommand, mcpCommandArray } from "../shared/mcp-command.js";

function generateOpenCodeJson(): string {
  const config = {
    $schema: "https://opencode.ai/config.json",
    instructions: ["OPENCODE.md"],
    mcp: {
      arcbridge: {
        type: "local",
        command: mcpCommandArray(),
      },
    },
  };
  return JSON.stringify(config, null, 2) + "\n";
}

function yamlQuote(value: string): string {
  if (/[:#{}&*!|>'"%@`\n]/.test(value) || value !== value.trim()) {
    return JSON.stringify(value);
  }
  return value;
}

function generateAgentFile(role: AgentRole): string {
  const lines: string[] = [
    "---",
    `description: ${yamlQuote(role.description)}`,
  ];

  // All ArcBridge roles are invokable via @mention, so they use subagent mode
  lines.push(`mode: subagent`);

  // Tool permissions — deny write/edit for read-only roles
  if (role.read_only) {
    lines.push("permission:");
    lines.push("  edit: deny");
    lines.push("  write: deny");
  }

  lines.push("---", "");
  lines.push(role.system_prompt, "");

  return lines.join("\n");
}

export class OpenCodeAdapter implements PlatformAdapter {
  platform = "opencode";

  generateProjectConfig(targetDir: string, config: ArcBridgeConfig): void {
    // Generate opencode.json (MCP config)
    const configPath = join(targetDir, "opencode.json");
    if (!existsSync(configPath)) {
      writeFileSync(configPath, generateOpenCodeJson(), "utf-8");
    } else {
      // Merge arcbridge config into existing opencode.json without overwriting user settings
      try {
        const existing = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
        let changed = false;

        // Ensure $schema is set
        if (!existing.$schema) {
          existing.$schema = "https://opencode.ai/config.json";
          changed = true;
        }

        // Ensure instructions array includes OPENCODE.md
        const instructions = existing.instructions as string[] | undefined;
        if (!Array.isArray(instructions)) {
          existing.instructions = ["OPENCODE.md"];
          changed = true;
        } else if (!instructions.includes("OPENCODE.md")) {
          instructions.push("OPENCODE.md");
          changed = true;
        }

        // Ensure mcp.arcbridge is present (reset mcp if it's not a plain object)
        const mcp = existing.mcp;
        const mcpObj: Record<string, unknown> =
          typeof mcp === "object" && mcp !== null && !Array.isArray(mcp)
            ? (mcp as Record<string, unknown>)
            : {};
        if (!mcpObj.arcbridge) {
          mcpObj.arcbridge = {
            type: "local",
            command: mcpCommandArray(),
          };
          existing.mcp = mcpObj;
          changed = true;
        }

        if (changed) {
          writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
        }
      } catch {
        // Can't parse existing opencode.json — leave it alone
      }
    }

    // Generate OPENCODE.md (project instructions — opencode reads AGENTS.md by default,
    // but we use OPENCODE.md + the instructions config field to avoid colliding with Codex)
    const instructionsContent = generateInstructions(config);
    writeWithMarkerMerge(join(targetDir, "OPENCODE.md"), instructionsContent);
  }

  generateAgentConfigs(targetDir: string, roles: AgentRole[], options?: AdapterOptions): void {
    // Generate .opencode/agents/*.md (OpenCode subagents mapped from ArcBridge roles)
    const agentsDir = join(targetDir, ".opencode", "agents");
    mkdirSync(agentsDir, { recursive: true });

    for (const role of roles) {
      const content = generateAgentFile(role);
      writeFileSync(join(agentsDir, `${role.role_id}.md`), content, "utf-8");
    }

    // Generate skills under .opencode/skills/ (OpenCode loads from .opencode/skills/*/SKILL.md)
    generateSkills(targetDir, options?.force, join(targetDir, ".opencode", "skills"));

    // Also generate shared .agents/skills/ (OpenCode loads these too)
    generateSkills(targetDir, options?.force);
  }
}
