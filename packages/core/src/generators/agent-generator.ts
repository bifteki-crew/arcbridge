import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { AgentRole } from "../schemas/agent-roles.js";
import { architectTemplate } from "../templates/agents/architect.js";
import { implementerTemplate } from "../templates/agents/implementer.js";
import { securityReviewerTemplate } from "../templates/agents/security-reviewer.js";
import { qualityGuardianTemplate } from "../templates/agents/quality-guardian.js";
import { phaseManagerTemplate } from "../templates/agents/phase-manager.js";
import { onboardingTemplate } from "../templates/agents/onboarding.js";

function writeAgentRole(dir: string, role: AgentRole): void {
  const { system_prompt, ...frontmatter } = role;
  const content = matter.stringify(system_prompt, frontmatter);
  writeFileSync(join(dir, `${role.role_id}.md`), content, "utf-8");
}

export function generateAgentRoles(targetDir: string): AgentRole[] {
  const agentsDir = join(targetDir, ".archlens", "agents");
  mkdirSync(agentsDir, { recursive: true });

  const roles = [
    architectTemplate(),
    implementerTemplate(),
    securityReviewerTemplate(),
    qualityGuardianTemplate(),
    phaseManagerTemplate(),
    onboardingTemplate(),
  ];

  for (const role of roles) {
    writeAgentRole(agentsDir, role);
  }

  return roles;
}
