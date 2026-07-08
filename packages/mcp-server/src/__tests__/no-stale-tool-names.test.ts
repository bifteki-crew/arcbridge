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

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");

const ROOTS = [
  join(__dirname, "..", "tools"),
  join(__dirname, "..", "..", "..", "adapters", "src"),
  join(__dirname, "..", "..", "..", "core", "src", "templates"),
  join(__dirname, "..", "..", "README.md"),
  // The repo-root README — the primary user/agent-facing tool reference
  join(REPO_ROOT, "README.md"),
  // This repo's committed, agent-facing role files (generated from templates)
  join(REPO_ROOT, ".arcbridge", "agents"),
  // User/agent-facing usage docs — tutorials that show real tool calls. The
  // internal planning docs (arcbridge-*-plan.md) are deliberately NOT scanned:
  // they record history and old→new mappings that must keep the retired names.
  join(REPO_ROOT, "docs", "project-overview.md"),
  join(REPO_ROOT, "docs", "how-agents-use-arcbridge.md"),
  join(REPO_ROOT, "docs", "walkthrough.md"),
  join(REPO_ROOT, "docs", "adopting-existing-codebases.md"),
];

function collectFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...collectFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

describe("no stale tool names (0.10.0 consolidation)", () => {
  it("retired tool names do not appear in tool sources, adapters, or role templates", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of collectFiles(root)) {
        const content = readFileSync(file, "utf-8");
        for (const name of RETIRED_TOOLS) {
          // Word boundary: `arcbridge_get_building_block` must not match
          // `arcbridge_get_building_blocks`.
          const re = new RegExp(`${name}\\b`, "g");
          for (const match of content.matchAll(re)) {
            const line = content.slice(0, match.index).split("\n").length;
            const context = content.split("\n")[line - 1] ?? "";
            // Code comments are maintainer-facing (e.g. "replaces X" notes in
            // the merged registrations' doc comments) — everything else,
            // including tool description strings, must be clean. Covers line
            // comments (//), block/JSDoc openers (/* /**) and continuation (*).
            if (file.endsWith(".ts") && /^\s*(\/\/|\/\*|\*)/.test(context)) continue;
            offenders.push(`${file}:${line} → ${name}`);
          }
        }
      }
    }
    expect(offenders, `stale tool names found:\n${offenders.join("\n")}`).toEqual([]);
  });
});
