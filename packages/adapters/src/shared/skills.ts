import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SYNC_SKILL = `---
name: arcbridge-sync
description: Run the ArcBridge sync loop — reindex code, detect architecture drift, and update task statuses. Use after significant code changes or before completing a phase.
---

# ArcBridge Sync

Run the full sync loop to keep architecture docs and task statuses in sync with code changes.

## Steps

1. **Reindex** — \`arcbridge_reindex\` to update the symbol index with recent code changes
2. **Check drift** — \`arcbridge_check_drift\` to detect undeclared dependencies and missing modules
3. **Review tasks** — \`arcbridge_get_current_tasks\` to see if any tasks can be inferred as done
4. **Propose updates** — \`arcbridge_propose_arc42_update\` to generate documentation update proposals
`;

const REVIEW_SKILL = `---
name: arcbridge-review
description: Run ArcBridge phase boundary reviews — drift check, quality scenario verification, and practice review across 5 dimensions. Use before completing a phase.
---

# ArcBridge Phase Review

Run the full review suite before completing a phase gate.

## Steps

1. **Drift check** — \`arcbridge_check_drift\` to catch undeclared dependencies and boundary violations
2. **Verify scenarios** — \`arcbridge_verify_scenarios\` to run linked tests for quality scenarios
3. **Practice review** — \`arcbridge_get_practice_review\` to review changes across architecture, security, testing, docs, and complexity
4. **Role checks** — optionally run \`arcbridge_run_role_check\` with specific roles (security-reviewer, quality-guardian)
5. **Complete phase** — if all checks pass, run \`arcbridge_complete_phase\` to validate gates and transition
`;

/**
 * Generate ArcBridge skills under .agents/skills/.
 * By default, only writes skills that don't already exist — preserves existing content.
 * Pass force=true to overwrite existing skills (e.g., after template updates).
 * Shared between Codex and Gemini adapters.
 */
export function generateSkills(targetDir: string, force = false): void {
  const skillsDir = join(targetDir, ".agents", "skills");

  const syncPath = join(skillsDir, "arcbridge-sync", "SKILL.md");
  if (force || !existsSync(syncPath)) {
    mkdirSync(join(skillsDir, "arcbridge-sync"), { recursive: true });
    writeFileSync(syncPath, SYNC_SKILL, "utf-8");
  }

  const reviewPath = join(skillsDir, "arcbridge-review", "SKILL.md");
  if (force || !existsSync(reviewPath)) {
    mkdirSync(join(skillsDir, "arcbridge-review"), { recursive: true });
    writeFileSync(reviewPath, REVIEW_SKILL, "utf-8");
  }
}
