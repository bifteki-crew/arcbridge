import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";
import { OpenCodeAdapter } from "../opencode/opencode-adapter.js";
import { mcpCommandArray } from "../shared/mcp-command.js";

const TEST_CONFIG: ArcBridgeConfig = {
  schema_version: 1,
  project_name: "test-app",
  project_type: "nextjs-app-router",
  services: [],
  platforms: ["opencode"],
  quality_priorities: ["security", "performance"],
  indexing: { include: ["src/**/*.ts"], exclude: ["node_modules"], default_mode: "fast", csharp_indexer: "auto" },
  testing: { test_command: "npx vitest run", timeout_ms: 60000 },
  drift: { ignore_paths: [] },
  metrics: { auto_record: false },
  sync: { auto_detect_drift: true, drift_severity_threshold: "warning", propose_updates_on: "phase-complete" },
};

const TEST_ROLES: AgentRole[] = [
  {
    role_id: "architect",
    name: "Architect",
    description: "Designs system structure",
    version: 1,
    required_tools: ["arcbridge_get_building_blocks", "arcbridge_check_drift"],
    denied_tools: [],
    read_only: false,
    quality_focus: ["maintainability"],
    model_preferences: {
      reasoning_depth: "high",
      speed_priority: "low",
      suggested_models: { claude: "claude-opus-4-6" },
    },
    platform_overrides: {},
    system_prompt: "You are the Architect agent.",
  },
  {
    role_id: "code-reviewer",
    name: "Code Reviewer",
    description: "On-demand code review",
    version: 1,
    required_tools: ["arcbridge_get_building_block"],
    denied_tools: [],
    read_only: true,
    quality_focus: ["maintainability", "reliability"],
    model_preferences: {
      reasoning_depth: "high",
      speed_priority: "low",
      suggested_models: { claude: "claude-opus-4-6" },
    },
    platform_overrides: {},
    system_prompt: "You are the Code Reviewer agent.",
  },
];

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-opencode-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("OpenCodeAdapter", () => {
  const adapter = new OpenCodeAdapter();

  describe("generateProjectConfig", () => {
    it("creates opencode.json with MCP config", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const configPath = join(tempDir, "opencode.json");
      expect(existsSync(configPath)).toBe(true);

      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(config.mcp.arcbridge).toBeDefined();
      expect(config.mcp.arcbridge.type).toBe("local");
      expect(config.mcp.arcbridge.command).toEqual(mcpCommandArray());
    });

    it("includes $schema and instructions in opencode.json", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const config = JSON.parse(readFileSync(join(tempDir, "opencode.json"), "utf-8"));
      expect(config.$schema).toBe("https://opencode.ai/config.json");
      expect(config.instructions).toEqual(["OPENCODE.md"]);
    });

    it("creates OPENCODE.md with project info", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const content = readFileSync(join(tempDir, "OPENCODE.md"), "utf-8");
      expect(content).toContain("test-app");
      expect(content).toContain("nextjs-app-router");
      expect(content).toContain("Plan → Build → Sync → Review");
      expect(content).toContain("arcbridge-generated");
    });

    it("includes React section for frontend templates", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const content = readFileSync(join(tempDir, "OPENCODE.md"), "utf-8");
      expect(content).toContain("arcbridge_get_component_graph");
    });

    it("excludes React section for non-frontend templates", () => {
      const apiConfig = { ...TEST_CONFIG, project_type: "api-service" as const };
      adapter.generateProjectConfig(tempDir, apiConfig);

      const content = readFileSync(join(tempDir, "OPENCODE.md"), "utf-8");
      expect(content).not.toContain("arcbridge_get_component_graph");
    });

    it("preserves existing user content in OPENCODE.md", () => {
      writeFileSync(join(tempDir, "OPENCODE.md"), "# My Custom Rules\n\nUse tabs.\n", "utf-8");

      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const result = readFileSync(join(tempDir, "OPENCODE.md"), "utf-8");
      expect(result).toContain("My Custom Rules");
      expect(result).toContain("test-app");
    });

    it("is idempotent on re-run", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const result = readFileSync(join(tempDir, "OPENCODE.md"), "utf-8");
      const markerCount = (result.match(/arcbridge-generated/g) || []).length;
      expect(markerCount).toBe(1);
    });

    it("adds arcbridge to existing opencode.json without overwriting", () => {
      writeFileSync(
        join(tempDir, "opencode.json"),
        JSON.stringify({ mcp: { other: { type: "local", command: ["other"] } } }, null, 2),
        "utf-8",
      );

      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const config = JSON.parse(readFileSync(join(tempDir, "opencode.json"), "utf-8"));
      expect(config.mcp.arcbridge).toBeDefined();
      expect(config.mcp.other).toBeDefined();
    });

    it("does not overwrite existing arcbridge config in opencode.json", () => {
      const customConfig = {
        mcp: {
          arcbridge: { type: "local", command: ["node", "custom-path.js"] },
        },
      };
      writeFileSync(join(tempDir, "opencode.json"), JSON.stringify(customConfig, null, 2), "utf-8");

      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const config = JSON.parse(readFileSync(join(tempDir, "opencode.json"), "utf-8"));
      expect(config.mcp.arcbridge.command).toEqual(["node", "custom-path.js"]);
    });

    it("ensures $schema and instructions in existing opencode.json", () => {
      writeFileSync(
        join(tempDir, "opencode.json"),
        JSON.stringify({ mcp: { arcbridge: { type: "local", command: ["npx"] } } }, null, 2),
        "utf-8",
      );

      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const config = JSON.parse(readFileSync(join(tempDir, "opencode.json"), "utf-8"));
      expect(config.$schema).toBe("https://opencode.ai/config.json");
      expect(config.instructions).toEqual(["OPENCODE.md"]);
    });

    it("appends OPENCODE.md to existing instructions without duplicating", () => {
      writeFileSync(
        join(tempDir, "opencode.json"),
        JSON.stringify({ instructions: ["CUSTOM.md"] }, null, 2),
        "utf-8",
      );

      adapter.generateProjectConfig(tempDir, TEST_CONFIG);
      adapter.generateProjectConfig(tempDir, TEST_CONFIG); // run twice

      const config = JSON.parse(readFileSync(join(tempDir, "opencode.json"), "utf-8"));
      expect(config.instructions).toEqual(["CUSTOM.md", "OPENCODE.md"]);
    });
  });

  describe("generateAgentConfigs", () => {
    it("creates .opencode/agents/*.md for each role", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      expect(existsSync(join(tempDir, ".opencode", "agents", "architect.md"))).toBe(true);
      expect(existsSync(join(tempDir, ".opencode", "agents", "code-reviewer.md"))).toBe(true);
    });

    it("agent files have valid frontmatter", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const content = readFileSync(join(tempDir, ".opencode", "agents", "architect.md"), "utf-8");
      expect(content).toContain("description: Designs system structure");
      expect(content).toContain("mode: subagent");
      expect(content).toContain("You are the Architect agent.");
    });

    it("read-only roles deny edit and write permissions", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const content = readFileSync(join(tempDir, ".opencode", "agents", "code-reviewer.md"), "utf-8");
      expect(content).toContain("permission:");
      expect(content).toContain("edit: deny");
      expect(content).toContain("write: deny");
    });

    it("non-read-only roles do not have permission restrictions", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const content = readFileSync(join(tempDir, ".opencode", "agents", "architect.md"), "utf-8");
      expect(content).not.toContain("permission:");
      expect(content).not.toContain("edit: deny");
    });

    it("generates .opencode/skills/", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      expect(existsSync(join(tempDir, ".opencode", "skills", "arcbridge-sync", "SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, ".opencode", "skills", "arcbridge-review", "SKILL.md"))).toBe(true);
    });

    it("generates shared .agents/skills/ too", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      expect(existsSync(join(tempDir, ".agents", "skills", "arcbridge-sync", "SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, ".agents", "skills", "arcbridge-review", "SKILL.md"))).toBe(true);
    });

    it("does not overwrite existing skills", () => {
      const syncDir = join(tempDir, ".opencode", "skills", "arcbridge-sync");
      mkdirSync(syncDir, { recursive: true });
      writeFileSync(join(syncDir, "SKILL.md"), "existing sync", "utf-8");

      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      expect(readFileSync(join(syncDir, "SKILL.md"), "utf-8")).toBe("existing sync");
      // Review skill should still be generated
      expect(existsSync(join(tempDir, ".opencode", "skills", "arcbridge-review", "SKILL.md"))).toBe(true);
    });
  });
});
