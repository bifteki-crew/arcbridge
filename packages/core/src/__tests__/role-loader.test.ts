import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import { loadRoles, loadRole } from "../roles/loader.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `arcbridge-role-test-${Date.now()}`);
  mkdirSync(join(tmpDir, ".arcbridge", "agents"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeRoleFile(roleId: string, overrides: Record<string, unknown> = {}, body = "You are a test agent."): void {
  const frontmatter = {
    role_id: roleId,
    name: roleId.charAt(0).toUpperCase() + roleId.slice(1),
    description: `The ${roleId} role`,
    version: 1,
    required_tools: ["arcbridge_get_building_blocks"],
    denied_tools: [],
    read_only: false,
    quality_focus: ["maintainability"],
    model_preferences: {
      reasoning_depth: "medium",
      speed_priority: "medium",
      suggested_models: {},
    },
    platform_overrides: {},
    ...overrides,
  };
  const content = matter.stringify(body, frontmatter);
  writeFileSync(join(tmpDir, ".arcbridge", "agents", `${roleId}.md`), content, "utf-8");
}

describe("loadRoles", () => {
  it("loads all valid role files from .arcbridge/agents/", () => {
    writeRoleFile("architect");
    writeRoleFile("implementer");

    const result = loadRoles(tmpDir);
    expect(result.errors).toHaveLength(0);
    expect(result.roles).toHaveLength(2);
    expect(result.roles.map((r) => r.role_id).sort()).toEqual(["architect", "implementer"]);
  });

  it("returns errors for invalid role files without stopping", () => {
    writeRoleFile("valid-role");
    // Write an invalid file — missing required fields
    writeFileSync(
      join(tmpDir, ".arcbridge", "agents", "bad-role.md"),
      "---\nrole_id: bad-role\n---\nNo other fields",
      "utf-8",
    );

    const result = loadRoles(tmpDir);
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].role_id).toBe("valid-role");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("bad-role.md");
    expect(result.errors[0]).toContain("validation failed");
  });

  it("returns empty results when agents directory is missing", () => {
    rmSync(join(tmpDir, ".arcbridge"), { recursive: true, force: true });

    const result = loadRoles(tmpDir);
    expect(result.roles).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("not found");
  });

  it("ignores non-.md files", () => {
    writeRoleFile("architect");
    writeFileSync(
      join(tmpDir, ".arcbridge", "agents", "notes.txt"),
      "not a role file",
      "utf-8",
    );

    const result = loadRoles(tmpDir);
    expect(result.roles).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it("preserves full AgentRole schema fields including model_preferences", () => {
    writeRoleFile("architect", {
      model_preferences: {
        reasoning_depth: "high",
        speed_priority: "low",
        suggested_models: { claude: "claude-opus-4-6" },
      },
      platform_overrides: {
        claude: { constraint_style: "narrative" },
      },
    });

    const result = loadRoles(tmpDir);
    expect(result.errors).toHaveLength(0);
    const role = result.roles[0];
    expect(role.model_preferences.reasoning_depth).toBe("high");
    expect(role.model_preferences.speed_priority).toBe("low");
    expect(role.model_preferences.suggested_models?.claude).toBe("claude-opus-4-6");
    expect(role.platform_overrides.claude).toEqual({ constraint_style: "narrative" });
  });

  it("applies schema defaults for optional fields", () => {
    // Minimal frontmatter — only required fields
    const content = matter.stringify("System prompt body.", {
      role_id: "minimal",
      name: "Minimal",
      description: "A minimal role",
    });
    writeFileSync(
      join(tmpDir, ".arcbridge", "agents", "minimal.md"),
      content,
      "utf-8",
    );

    const result = loadRoles(tmpDir);
    expect(result.errors).toHaveLength(0);
    const role = result.roles[0];
    expect(role.version).toBe(1);
    expect(role.required_tools).toEqual([]);
    expect(role.denied_tools).toEqual([]);
    expect(role.read_only).toBe(false);
    expect(role.quality_focus).toEqual([]);
    expect(role.model_preferences.reasoning_depth).toBe("medium");
  });
});

describe("loadRole", () => {
  it("loads a single role by ID", () => {
    writeRoleFile("architect", {
      quality_focus: ["maintainability", "security"],
    });

    const result = loadRole(tmpDir, "architect");
    expect(result.error).toBeNull();
    expect(result.role).not.toBeNull();
    expect(result.role!.role_id).toBe("architect");
    expect(result.role!.quality_focus).toEqual(["maintainability", "security"]);
  });

  it("returns null with no error for missing role file", () => {
    const result = loadRole(tmpDir, "nonexistent");
    expect(result.role).toBeNull();
    expect(result.error).toBeNull();
  });

  it("returns validation error for invalid file", () => {
    writeFileSync(
      join(tmpDir, ".arcbridge", "agents", "bad.md"),
      "---\nrole_id: bad\n---\n",
      "utf-8",
    );

    const result = loadRole(tmpDir, "bad");
    expect(result.role).toBeNull();
    expect(result.error).toContain("Validation failed");
  });

  it("rejects path traversal attempts", () => {
    const result = loadRole(tmpDir, "../../../etc/passwd");
    expect(result.role).toBeNull();
    expect(result.error).toContain("Invalid role ID");
  });

  it("rejects role IDs with slashes", () => {
    const result = loadRole(tmpDir, "foo/bar");
    expect(result.role).toBeNull();
    expect(result.error).toContain("Invalid role ID");
  });
});
