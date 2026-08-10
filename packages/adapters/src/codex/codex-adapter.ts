import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";
import type { AdapterOptions, PlatformAdapter } from "../types.js";
import { generateSkills } from "../shared/skills.js";
import { writeWithMarkerMerge } from "../shared/marker-merge.js";
import { generateInstructions } from "../shared/instructions.js";

function generateAgentsMd(config: ArcBridgeConfig, architecture?: string): string {
  return generateInstructions(config, {
    architecture,
    prefix: [
      "## Codex MCP Setup",
      "",
      "Add this to your `~/.codex/config.toml` (one-time setup):",
      "",
      "**macOS / Linux:**",
      "```toml",
      "[mcp_servers.arcbridge]",
      'command = "npx"',
      'args = ["-y", "@arcbridge/mcp-server"]',
      "```",
      "",
      "**Windows:**",
      "```toml",
      "[mcp_servers.arcbridge]",
      'command = "cmd"',
      'args = ["/c", "npx", "-y", "@arcbridge/mcp-server"]',
      "```",
      "",
    ],
    suffix: [
      "## Agent Roles",
      "",
      "Activate roles with `arcbridge_activate_role` to get specialized context.",
      "Roles are defined in `.arcbridge/agents/`.",
      "",
      "*Role table is appended below after agent configs are generated.*",
      "",
    ],
  });
}

export class CodexAdapter implements PlatformAdapter {
  platform = "codex";

  generateProjectConfig(targetDir: string, config: ArcBridgeConfig, options?: AdapterOptions): void {
    const agentsMdContent = generateAgentsMd(config, options?.architecture);
    writeWithMarkerMerge(join(targetDir, "AGENTS.md"), agentsMdContent);
  }

  generateAgentConfigs(targetDir: string, roles: AgentRole[], options?: AdapterOptions): void {
    // Append dynamic role table to AGENTS.md (replaces placeholder)
    const agentsMdPath = join(targetDir, "AGENTS.md");
    if (existsSync(agentsMdPath)) {
      let content = readFileSync(agentsMdPath, "utf-8");
      const roleTable = [
        "| Role | Description |",
        "|------|-------------|",
        ...roles.map((r) => `| \`${r.role_id}\` | ${r.description} |`),
        "",
      ].join("\n");

      const placeholder = "*Role table is appended below after agent configs are generated.*";
      if (content.includes(placeholder)) {
        content = content.replace(placeholder, roleTable);
      } else {
        // Fallback: append role table at the end if placeholder was removed
        content = `${content.trimEnd()}\n\n## Agent Roles\n\n${roleTable}\n`;
      }
      writeFileSync(agentsMdPath, content, "utf-8");
    }

    // Generate missing skills (shared with Gemini adapter — only writes if not present)
    generateSkills(targetDir, options?.force);
  }
}
