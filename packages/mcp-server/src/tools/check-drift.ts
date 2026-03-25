import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { detectDrift, writeDriftLog } from "@arcbridge/core";
import type { ServerContext } from "../context.js";
import { ensureDb, notInitialized, textResult } from "../helpers.js";
import { autoRecord } from "../auto-record.js";

export function registerCheckDrift(
  server: McpServer,
  ctx: ServerContext,
): void {
  server.tool(
    "arcbridge_check_drift",
    "Detect architecture drift: undocumented modules, missing code paths, cross-block dependency violations, and stale ADR references.",
    {
      target_dir: z
        .string()
        .describe("Absolute path to the project directory"),
      persist: z
        .boolean()
        .default(true)
        .describe("Write findings to drift_log table (default: true)"),
    },
    async (params) => {
      const db = ensureDb(ctx, params.target_dir);
      if (!db) return notInitialized();

      const entries = detectDrift(db);

      if (params.persist) {
        writeDriftLog(db, entries);
      }

      if (entries.length === 0) {
        return textResult(
          "# Drift Check\n\nNo architecture drift detected. Code aligns with documented building blocks.",
        );
      }

      // Group by kind
      const byKind = new Map<string, typeof entries>();
      for (const e of entries) {
        const existing = byKind.get(e.kind) ?? [];
        existing.push(e);
        byKind.set(e.kind, existing);
      }

      const kindLabels: Record<string, string> = {
        undocumented_module: "Undocumented Modules",
        missing_module: "Missing Modules",
        dependency_violation: "Dependency Violations",
        stale_adr: "Stale ADR References",
        unlinked_test: "Unlinked Tests",
      };

      const severityIcon: Record<string, string> = {
        error: "ERROR",
        warning: "WARN",
        info: "INFO",
      };

      const lines: string[] = [
        `# Drift Check (${entries.length} issues)`,
        "",
      ];

      // Summary
      const errors = entries.filter((e) => e.severity === "error").length;
      const warnings = entries.filter((e) => e.severity === "warning").length;
      const infos = entries.filter((e) => e.severity === "info").length;
      lines.push(
        `**${errors}** errors, **${warnings}** warnings, **${infos}** info`,
        "",
      );

      for (const [kind, items] of byKind) {
        lines.push(`## ${kindLabels[kind] ?? kind}`, "");
        for (const item of items) {
          const icon = severityIcon[item.severity] ?? item.severity;
          lines.push(`- [${icon}] ${item.description}`);
        }
        lines.push("");
      }

      if (params.persist) {
        lines.push(
          "---",
          "*Findings saved to drift_log. Use `arcbridge_update_task` or resolve drift by updating `.arcbridge/arc42/05-building-blocks.md`.*",
          "",
        );
      }

      autoRecord(db, params.target_dir, {
        toolName: "arcbridge_check_drift",
        action: `${entries.length} issues (${errors} errors)`,
        driftCount: entries.length,
        driftErrors: errors,
      });

      return textResult(lines.join("\n"));
    },
  );
}
