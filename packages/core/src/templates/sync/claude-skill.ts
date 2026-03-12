import type { ArchLensConfig } from "../../schemas/config.js";

export interface GeneratedFile {
  relativePath: string;
  content: string;
}

/**
 * Generate the Claude Code skill file for the ArchLens sync loop.
 */
export function claudeSkillTemplate(config: ArchLensConfig): GeneratedFile {
  const triggerNote =
    config.sync.propose_updates_on === "session-end"
      ? "This skill auto-runs at session end. You can also invoke it manually."
      : config.sync.propose_updates_on === "phase-complete"
        ? "This skill runs when a phase is completed. You can also invoke it manually."
        : "This skill runs only when invoked manually.";

  const content = `---
description: "Run the ArchLens architecture sync loop — detect drift, infer task status, and propose arc42 updates"
---

# ArchLens Sync

${triggerNote}

## Steps

1. First, call \`archlens_check_drift\` to detect any architecture drift
2. Call \`archlens_get_current_tasks\` to see the current phase progress
3. Call \`archlens_propose_arc42_update\` with \`changes_since: "last-sync"\` to generate update proposals
4. Present the proposals to the developer for review
5. If the developer approves, update the relevant arc42 files and run \`archlens_reindex\`

## When to Run

- After completing a set of related changes
- Before marking a phase as complete
- When switching context to a different building block
- At the end of a coding session (if configured)

## Quick Check

If you just want a quick status without full proposals:
1. Call \`archlens_get_project_status\` for an overview
2. Call \`archlens_get_open_questions\` to see gaps
`;

  return {
    relativePath: ".claude/skills/archlens-sync.md",
    content,
  };
}
