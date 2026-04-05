import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentRole, ArcBridgeConfig } from "@arcbridge/core";
import { GeminiAdapter } from "../gemini/gemini-adapter.js";

const TEST_CONFIG: ArcBridgeConfig = {
  schema_version: 1,
  project_name: "test-app",
  project_type: "nextjs-app-router",
  services: [],
  platforms: ["gemini"],
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
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-gemini-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("GeminiAdapter", () => {
  const adapter = new GeminiAdapter();

  describe("generateProjectConfig", () => {
    it("creates .gemini/settings.json with MCP config", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const settingsPath = join(tempDir, ".gemini", "settings.json");
      expect(existsSync(settingsPath)).toBe(true);

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.mcpServers.arcbridge).toBeDefined();
      expect(settings.mcpServers.arcbridge.command).toBe("npx");
    });

    it("creates .gemini/styleguide.md with project info", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const content = readFileSync(join(tempDir, ".gemini", "styleguide.md"), "utf-8");
      expect(content).toContain("test-app");
      expect(content).toContain("nextjs-app-router");
      expect(content).toContain("Plan → Build → Sync → Review");
      expect(content).toContain("arcbridge-generated");
    });

    it("creates GEMINI.md for CLI users", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const content = readFileSync(join(tempDir, "GEMINI.md"), "utf-8");
      expect(content).toContain("test-app");
      expect(content).toContain("arcbridge-generated");
    });

    it("includes React section for frontend templates", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const content = readFileSync(join(tempDir, ".gemini", "styleguide.md"), "utf-8");
      expect(content).toContain("arcbridge_get_component_graph");
    });

    it("excludes React section for non-frontend templates", () => {
      const apiConfig = { ...TEST_CONFIG, project_type: "api-service" as const };
      adapter.generateProjectConfig(tempDir, apiConfig);

      const content = readFileSync(join(tempDir, ".gemini", "styleguide.md"), "utf-8");
      expect(content).not.toContain("arcbridge_get_component_graph");
    });

    it("preserves existing user content in styleguide.md", () => {
      const geminiDir = join(tempDir, ".gemini");
      const { mkdirSync } = require("node:fs");
      mkdirSync(geminiDir, { recursive: true });
      writeFileSync(join(geminiDir, "styleguide.md"), "# My Custom Rules\n\nUse tabs.\n", "utf-8");

      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const result = readFileSync(join(geminiDir, "styleguide.md"), "utf-8");
      expect(result).toContain("My Custom Rules");
      expect(result).toContain("test-app");
    });

    it("is idempotent on re-run", () => {
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);
      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const result = readFileSync(join(tempDir, ".gemini", "styleguide.md"), "utf-8");
      const markerCount = (result.match(/arcbridge-generated/g) || []).length;
      expect(markerCount).toBe(1);
    });

    it("adds arcbridge to existing settings.json without overwriting", () => {
      const geminiDir = join(tempDir, ".gemini");
      const { mkdirSync } = require("node:fs");
      mkdirSync(geminiDir, { recursive: true });
      writeFileSync(
        join(geminiDir, "settings.json"),
        JSON.stringify({ mcpServers: { other: { command: "other" } } }, null, 2),
        "utf-8",
      );

      adapter.generateProjectConfig(tempDir, TEST_CONFIG);

      const settings = JSON.parse(readFileSync(join(geminiDir, "settings.json"), "utf-8"));
      expect(settings.mcpServers.arcbridge).toBeDefined();
      expect(settings.mcpServers.other).toBeDefined();
    });
  });

  describe("generateAgentConfigs", () => {
    it("creates .gemini/agents/*.md for each role", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      expect(existsSync(join(tempDir, ".gemini", "agents", "architect.md"))).toBe(true);
      expect(existsSync(join(tempDir, ".gemini", "agents", "code-reviewer.md"))).toBe(true);
    });

    it("agent files have valid frontmatter", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const content = readFileSync(join(tempDir, ".gemini", "agents", "architect.md"), "utf-8");
      expect(content).toContain("name: architect");
      expect(content).toContain("description: Designs system structure");
      expect(content).toContain("tools:");
      expect(content).toContain("model: gemini-2.5-pro");
    });

    it("read-only roles get read-only tools", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const content = readFileSync(join(tempDir, ".gemini", "agents", "code-reviewer.md"), "utf-8");
      expect(content).toContain("read_file");
      expect(content).toContain("grep_search");
    });

    it("generates skills if not already present", () => {
      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      expect(existsSync(join(tempDir, ".agents", "skills", "arcbridge-sync", "SKILL.md"))).toBe(true);
      expect(existsSync(join(tempDir, ".agents", "skills", "arcbridge-review", "SKILL.md"))).toBe(true);
    });

    it("does not overwrite skills if already present", () => {
      // Simulate Codex adapter having already created skills
      const { mkdirSync } = require("node:fs");
      const syncDir = join(tempDir, ".agents", "skills", "arcbridge-sync");
      mkdirSync(syncDir, { recursive: true });
      writeFileSync(join(syncDir, "SKILL.md"), "existing content", "utf-8");

      adapter.generateAgentConfigs(tempDir, TEST_ROLES);

      const content = readFileSync(join(syncDir, "SKILL.md"), "utf-8");
      expect(content).toBe("existing content");
    });
  });
});
