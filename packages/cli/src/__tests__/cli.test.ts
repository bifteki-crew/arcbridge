import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateConfig,
  generateArc42,
  generatePlan,
  generateAgentRoles,
  generateDatabase,
  type InitProjectInput,
} from "@arcbridge/core";
import { status } from "../commands/status.js";
import { drift } from "../commands/drift.js";
import { sync } from "../commands/sync.js";
import { updateTask } from "../commands/update-task.js";
import { refresh } from "../commands/refresh.js";
import { adopt } from "../commands/adopt.js";
import { generateConfigs } from "../commands/generate-configs.js";
import { openProjectDb } from "../project.js";

const TEST_INPUT: InitProjectInput = {
  name: "cli-smoke-test",
  template: "nextjs-app-router",
  features: [],
  quality_priorities: ["security", "performance", "accessibility"],
  platforms: ["claude"],
};

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-cli-test-"));

  // Generate a full project so commands have a valid DB and docs
  generateConfig(tempDir, TEST_INPUT);
  generateArc42(tempDir, TEST_INPUT);
  generatePlan(tempDir, TEST_INPUT);
  generateAgentRoles(tempDir);
  const { db } = generateDatabase(tempDir, TEST_INPUT);
  db.close();

  // Create a minimal tsconfig so indexProject (used by sync) doesn't crash
  writeFileSync(
    join(tempDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2020", module: "ESNext", moduleResolution: "bundler" },
      include: ["src"],
    }),
    "utf-8",
  );
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

afterEach(() => {
  // Commands may set process.exitCode on drift errors etc. — reset it.
  process.exitCode = undefined;
});

describe("CLI smoke tests", () => {
  it("status command runs without crashing (text mode)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await status(tempDir, false);
    } finally {
      spy.mockRestore();
    }
  });

  it("status command runs without crashing (json mode)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await status(tempDir, true);
      // Should have been called with valid JSON
      const output = spy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("project_name", "cli-smoke-test");
      expect(parsed).toHaveProperty("building_blocks");
      expect(parsed).toHaveProperty("tasks");
    } finally {
      spy.mockRestore();
    }
  });

  it("drift command runs without crashing (text mode)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await drift(tempDir, false);
    } finally {
      spy.mockRestore();
    }
  });

  it("drift command runs without crashing (json mode)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await drift(tempDir, true);
      const output = spy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("drift");
      expect(Array.isArray(parsed.drift)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("sync command runs without crashing (json mode)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await sync(tempDir, true);
      const output = logSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("reindex");
      expect(parsed).toHaveProperty("drift");
      expect(parsed).toHaveProperty("warnings");
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("sync command runs without crashing (text mode)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await sync(tempDir, false);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("updateTask updates a task status", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Find a real task ID from the generated project
      const { openDatabase, migrate } = await import("@arcbridge/core");
      const db = openDatabase(join(tempDir, ".arcbridge", "index.db"));
      migrate(db);
      const task = db.prepare("SELECT id FROM tasks LIMIT 1").get() as { id: string };
      db.close();

      await updateTask(tempDir, task.id, "in-progress", true);

      const output = logSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("taskId", task.id);
      expect(parsed).toHaveProperty("newStatus", "in-progress");
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("updateTask rejects invalid status", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await updateTask(tempDir, "task-0.1", "invalid-status", true);
      const output = logSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("Invalid status");
      expect(process.exitCode).toBe(1);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("refresh command runs without crashing (json mode)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await refresh(tempDir, true);
      const output = logSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("refreshed", true);
      expect(parsed).toHaveProperty("warnings");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("refresh command runs without crashing (text mode)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await refresh(tempDir, false);
      expect(logSpy).toHaveBeenCalledWith("Database refreshed from YAML/markdown sources.");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("updateTask rejects non-existent task", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await updateTask(tempDir, "task-nonexistent-99", "done", true);
      const output = logSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("error");
      expect(parsed.error).toContain("not found");
      expect(process.exitCode).toBe(1);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});

describe("generate-configs --force", () => {
  let forceDir: string;

  beforeAll(() => {
    forceDir = mkdtempSync(join(tmpdir(), "arcbridge-force-test-"));
    const input: InitProjectInput = {
      ...TEST_INPUT,
      platforms: ["codex"],
    };
    generateConfig(forceDir, input);
    generateArc42(forceDir, input);
    generatePlan(forceDir, input);
    generateAgentRoles(forceDir);
    const { db } = generateDatabase(forceDir, input);
    db.close();
  });

  afterAll(() => {
    rmSync(forceDir, { recursive: true, force: true });
  });

  it("generates skills on first run", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await generateConfigs(forceDir, true);
    } finally {
      spy.mockRestore();
    }

    const syncPath = join(forceDir, ".agents", "skills", "arcbridge-sync", "SKILL.md");
    expect(existsSync(syncPath)).toBe(true);
  });

  it("preserves existing skills without --force", async () => {
    const syncPath = join(forceDir, ".agents", "skills", "arcbridge-sync", "SKILL.md");
    writeFileSync(syncPath, "custom content", "utf-8");

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await generateConfigs(forceDir, true, false);
    } finally {
      spy.mockRestore();
    }

    expect(readFileSync(syncPath, "utf-8")).toBe("custom content");
  });

  it("overwrites existing skills with --force", async () => {
    const syncPath = join(forceDir, ".agents", "skills", "arcbridge-sync", "SKILL.md");
    writeFileSync(syncPath, "custom content", "utf-8");

    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await generateConfigs(forceDir, true, true);
    } finally {
      spy.mockRestore();
    }

    const content = readFileSync(syncPath, "utf-8");
    expect(content).not.toBe("custom content");
    expect(content).toContain("arcbridge-sync");
  });
});

describe("openProjectDb auto-recreation", () => {
  let autoDir: string;

  beforeAll(() => {
    autoDir = mkdtempSync(join(tmpdir(), "arcbridge-cli-autodb-"));
    generateConfig(autoDir, TEST_INPUT);
    generateArc42(autoDir, TEST_INPUT);
    generatePlan(autoDir, TEST_INPUT);
    generateAgentRoles(autoDir);
    const { db } = generateDatabase(autoDir, TEST_INPUT);
    db.close();
  });

  afterAll(() => {
    rmSync(autoDir, { recursive: true, force: true });
  });

  it("throws when neither config.yaml nor index.db exist", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "arcbridge-empty-"));
    expect(() => openProjectDb(emptyDir)).toThrow("No ArcBridge project found");
    rmSync(emptyDir, { recursive: true, force: true });
  });

  it("auto-creates index.db from YAML when config exists but DB is missing", () => {
    const dbPath = join(autoDir, ".arcbridge", "index.db");
    unlinkSync(dbPath);
    expect(existsSync(dbPath)).toBe(false);

    const db = openProjectDb(autoDir);
    expect(existsSync(dbPath)).toBe(true);

    const blocks = db
      .prepare("SELECT id FROM building_blocks")
      .all() as { id: string }[];
    expect(blocks.length).toBeGreaterThan(0);

    const phases = db
      .prepare("SELECT id FROM phases")
      .all() as { id: string }[];
    expect(phases.length).toBeGreaterThan(0);

    db.close();
  });
});

describe("error paths and adopt", () => {
  let adoptDir: string;
  let corruptDir: string;
  let bareDir: string;

  beforeAll(() => {
    bareDir = mkdtempSync(join(tmpdir(), "arcbridge-cli-bare-"));

    // A project with real source so adopt has something to cluster
    adoptDir = mkdtempSync(join(tmpdir(), "arcbridge-cli-adopt-"));
    for (const dir of ["lib", "api"]) {
      mkdirSync(join(adoptDir, "src", dir), { recursive: true });
      for (let i = 0; i < 3; i++) {
        writeFileSync(join(adoptDir, "src", dir, `f${i}.ts`), `export function ${dir}Fn${i}(): number { return ${i}; }\n`, "utf-8");
      }
    }
    writeFileSync(
      join(adoptDir, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler" }, include: ["src/**/*"] }),
      "utf-8",
    );
    generateConfig(adoptDir, { ...TEST_INPUT, name: "adopt-fixture", template: "api-service" });
    generateArc42(adoptDir, { ...TEST_INPUT, name: "adopt-fixture", template: "api-service" });
    generatePlan(adoptDir, { ...TEST_INPUT, name: "adopt-fixture", template: "api-service" });
    const { db } = generateDatabase(adoptDir, { ...TEST_INPUT, name: "adopt-fixture", template: "api-service" });
    db.close();

    // A project whose phases.yaml is malformed
    corruptDir = mkdtempSync(join(tmpdir(), "arcbridge-cli-corrupt-"));
    generateConfig(corruptDir, { ...TEST_INPUT, name: "corrupt-fixture" });
    generateArc42(corruptDir, { ...TEST_INPUT, name: "corrupt-fixture" });
    generatePlan(corruptDir, { ...TEST_INPUT, name: "corrupt-fixture" });
    const gen = generateDatabase(corruptDir, { ...TEST_INPUT, name: "corrupt-fixture" });
    gen.db.close();
    writeFileSync(join(corruptDir, ".arcbridge", "plan", "phases.yaml"), "phases: [unclosed\n", "utf-8");
  });

  afterAll(() => {
    for (const d of [adoptDir, corruptDir, bareDir]) rmSync(d, { recursive: true, force: true });
  });

  it("status on an uninitialized directory names `arcbridge init`", async () => {
    await expect(status(bareDir, false)).rejects.toThrow(/No ArcBridge project found.*arcbridge init/s);
  });

  it("drift on an uninitialized directory names `arcbridge init`", async () => {
    await expect(drift(bareDir, false)).rejects.toThrow(/No ArcBridge project found.*arcbridge init/s);
  });

  it("refresh surfaces a malformed phases.yaml as RefreshValidationError", async () => {
    await expect(refresh(corruptDir, false)).rejects.toThrow(/phases\.yaml/);
  });

  it("adopt --json emits the structured proposal and writes the proposals file", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await adopt(adoptDir, {}, true);
      const parsed = JSON.parse(logSpy.mock.calls.at(-1)?.[0] as string);
      expect(Array.isArray(parsed.blocks)).toBe(true);
      const ids = parsed.blocks.map((b: { id: string }) => b.id);
      expect(ids).toEqual(expect.arrayContaining(["lib", "api"]));
      expect(parsed.unassigned).toEqual([]);
      expect(parsed.stats.files).toBeGreaterThanOrEqual(6);
      // Reviewable proposal written alongside, not applied
      expect(existsSync(join(adoptDir, ".arcbridge", "proposals", "building-blocks.yaml"))).toBe(true);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("adopt --apply leaves drift --reindex clean (CLI mirror of the e2e property)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await adopt(adoptDir, { apply: true }, false);
      await drift(adoptDir, false, true);
      expect(process.exitCode).not.toBe(1);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("adopt with an unknown --service lists the available services", async () => {
    await expect(adopt(adoptDir, { service: "nope" }, false)).rejects.toThrow(/Available services/);
  });

  it("adopt reports the no-symbols case as an error with exit code 1", async () => {
    const noSrc = mkdtempSync(join(tmpdir(), "arcbridge-cli-nosrc-"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      generateConfig(noSrc, { ...TEST_INPUT, name: "no-src" });
      generateArc42(noSrc, { ...TEST_INPUT, name: "no-src" });
      generatePlan(noSrc, { ...TEST_INPUT, name: "no-src" });
      const gen = generateDatabase(noSrc, { ...TEST_INPUT, name: "no-src" });
      gen.db.close();

      await adopt(noSrc, {}, true);
      const parsed = JSON.parse(logSpy.mock.calls.at(-1)?.[0] as string);
      expect(parsed).toHaveProperty("error");
      expect(process.exitCode).toBe(1);
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      rmSync(noSrc, { recursive: true, force: true });
    }
  });
});
