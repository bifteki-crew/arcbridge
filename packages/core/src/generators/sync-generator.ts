import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ArcBridgeConfig } from "../schemas/config.js";
import { claudeSkillTemplate } from "../templates/sync/claude-skill.js";
import { githubActionTemplate } from "../templates/sync/github-action.js";
import { copilotHookTemplate } from "../templates/sync/copilot-hook.js";

/**
 * Generate sync loop trigger files based on configured platforms.
 */
export function generateSyncFiles(
  targetDir: string,
  config: ArcBridgeConfig,
): string[] {
  const generated: string[] = [];

  // Always generate the GitHub Action workflow
  const action = githubActionTemplate(config);
  const actionPath = join(targetDir, action.relativePath);
  mkdirSync(dirname(actionPath), { recursive: true });
  writeFileSync(actionPath, action.content, "utf-8");
  generated.push(action.relativePath);

  // Claude Code skill
  if (config.platforms.includes("claude")) {
    const skill = claudeSkillTemplate(config);
    const skillPath = join(targetDir, skill.relativePath);
    mkdirSync(dirname(skillPath), { recursive: true });
    writeFileSync(skillPath, skill.content, "utf-8");
    generated.push(skill.relativePath);
  }

  // Copilot hook documentation
  if (config.platforms.includes("copilot")) {
    const hook = copilotHookTemplate(config);
    const hookPath = join(targetDir, hook.relativePath);
    mkdirSync(dirname(hookPath), { recursive: true });
    writeFileSync(hookPath, hook.content, "utf-8");
    generated.push(hook.relativePath);
  }

  return generated;
}
