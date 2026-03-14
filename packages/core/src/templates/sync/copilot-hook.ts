import type { ArcBridgeConfig } from "../../schemas/config.js";
import type { GeneratedFile } from "./claude-skill.js";

/**
 * Generate the Copilot session-end hook for automatic sync triggers.
 * Note: Copilot hooks are an evolving feature — this generates a
 * documentation file that describes the intended behavior.
 */
export function copilotHookTemplate(config: ArcBridgeConfig): GeneratedFile {
  const content = `# ArcBridge Sync Hook for Copilot

## Configuration

Sync mode: \`${config.sync.propose_updates_on}\`
Drift threshold: \`${config.sync.drift_severity_threshold}\`

## Session End Behavior

When a Copilot coding session ends${config.sync.propose_updates_on === "session-end" ? " (auto-triggered)" : " (manual only)"}:

1. Run \`arcbridge_check_drift\` to detect architecture drift
2. If drift is found above the \`${config.sync.drift_severity_threshold}\` threshold:
   - Run \`arcbridge_propose_arc42_update\` with \`changes_since: "last-sync"\`
   - Create a branch with proposed documentation changes
   - Open a PR for review

## Pre-Tool-Use Enforcement

The following role restrictions are enforced:

- **Implementer**: Cannot use \`arcbridge_propose_arc42_update\`
- **Security Reviewer**: Read-only access, cannot modify code or documentation
- **Quality Guardian**: Read-only access

## Setup

To enable automatic sync:
1. Ensure the ArcBridge MCP server is configured in your Copilot settings
2. The GitHub Action workflow at \`.github/workflows/arcbridge-sync.yml\` handles automated sync
3. For session-level hooks, configure Copilot to invoke the sync skill after coding sessions
`;

  return {
    relativePath: ".github/arcbridge-sync-hook.md",
    content,
  };
}
