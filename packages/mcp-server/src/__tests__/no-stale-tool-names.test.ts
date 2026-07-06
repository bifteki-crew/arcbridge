// Guards the 0.10.0 tool consolidation: none of the retired tool names may
// reappear in the tool sources, adapter instruction strings, or agent role
// templates — those strings are what agents read, so a stale name sends them
// to a tool that no longer exists.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RETIRED_TOOLS = [
  "arcbridge_get_building_block",
  "arcbridge_search_symbols",
  "arcbridge_get_symbol",
  "arcbridge_create_task",
  "arcbridge_update_task",
  "arcbridge_delete_task",
  "arcbridge_create_phase",
  "arcbridge_delete_phase",
  "arcbridge_complete_phase",
  "arcbridge_get_quality_scenarios",
  "arcbridge_update_scenario_status",
  "arcbridge_export_metrics",
  "arcbridge_propose_arc42_update",
  "arcbridge_update_arc42_section",
  "arcbridge_get_current_tasks",
] as const;

const ROOTS = [
  join(__dirname, "..", "tools"),
  join(__dirname, "..", "..", "..", "adapters", "src"),
  join(__dirname, "..", "..", "..", "core", "src", "templates"),
];

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("no stale tool names (0.10.0 consolidation)", () => {
  it("retired tool names do not appear in tool sources, adapters, or role templates", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of collectTsFiles(root)) {
        const content = readFileSync(file, "utf-8");
        for (const name of RETIRED_TOOLS) {
          // Word boundary: `arcbridge_get_building_block` must not match
          // `arcbridge_get_building_blocks`.
          const re = new RegExp(`${name}\\b`, "g");
          for (const match of content.matchAll(re)) {
            const line = content.slice(0, match.index).split("\n").length;
            const context = content.split("\n")[line - 1] ?? "";
            // The merged registrations intentionally say "replaces <old name>"
            // in their descriptions and doc comments — comments are for
            // maintainers; only agent-facing strings must be clean.
            if (/replaces/i.test(context)) continue;
            if (/^\s*(\*|\/\/)/.test(context)) continue;
            offenders.push(`${file}:${line} → ${name}`);
          }
        }
      }
    }
    expect(offenders, `stale tool names found:\n${offenders.join("\n")}`).toEqual([]);
  });
});
