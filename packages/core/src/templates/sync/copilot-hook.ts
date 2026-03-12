import type { ArchLensConfig } from "../../schemas/config.js";
import type { GeneratedFile } from "./claude-skill.js";

/**
 * Generate the Copilot session-end hook for automatic sync triggers.
 * Note: Copilot hooks are an evolving feature — this generates a
 * documentation file that describes the intended behavior.
 */
export function copilotHookTemplate(config: ArchLensConfig): GeneratedFile {
  const content = `# ArchLens Sync Hook for Copilot

## Configuration

Sync mode: \`${config.sync.propose_updates_on}\`
Drift threshold: \`${config.sync.drift_severity_threshold}\`

## Session End Behavior

When a Copilot coding session ends${config.sync.propose_updates_on === "session-end" ? " (auto-triggered)" : " (manual only)"}:

1. Run \`archlens_check_drift\` to detect architecture drift
2. If drift is found above the \`${config.sync.drift_severity_threshold}\` threshold:
   - Run \`archlens_propose_arc42_update\` with \`changes_since: "last-sync"\`
   - Create a branch with proposed documentation changes
   - Open a PR for review

## Pre-Tool-Use Enforcement

The following role restrictions are enforced:

- **Implementer**: Cannot use \`archlens_propose_arc42_update\`
- **Security Reviewer**: Read-only access, cannot modify code or documentation
- **Quality Guardian**: Read-only access

## Setup

To enable automatic sync:
1. Ensure the ArchLens MCP server is configured in your Copilot settings
2. The GitHub Action workflow at \`.github/workflows/archlens-sync.yml\` handles automated sync
3. For session-level hooks, configure Copilot to invoke the sync skill after coding sessions
`;

  return {
    relativePath: ".github/archlens-sync-hook.md",
    content,
  };
}
