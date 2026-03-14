import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
