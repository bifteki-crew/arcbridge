import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type Database from "better-sqlite3";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import {
  insertActivity,
  getSessionTotals,
  queryMetrics,
  exportMetrics,
} from "../metrics/activity.js";

describe("agent activity metrics", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openMemoryDatabase();
    initializeSchema(db);
  });

  afterEach(() => {
    db?.close();
  });

  describe("insertActivity", () => {
    it("inserts a row and returns the row ID", () => {
      const id = insertActivity(db, {
        toolName: "arcbridge_update_task",
        action: "implement login",
        model: "claude-sonnet-4",
      });

      expect(id).toBeGreaterThan(0);

      const row = db
        .prepare("SELECT * FROM agent_activity WHERE id = ?")
        .get(id) as Record<string, unknown>;
      expect(row.tool_name).toBe("arcbridge_update_task");
      expect(row.action).toBe("implement login");
      expect(row.model).toBe("claude-sonnet-4");
    });

    it("auto-computes total_tokens from input + output", () => {
      const id = insertActivity(db, {
        toolName: "test",
        inputTokens: 1000,
        outputTokens: 500,
      });

      const row = db
        .prepare("SELECT total_tokens FROM agent_activity WHERE id = ?")
        .get(id) as { total_tokens: number };
      expect(row.total_tokens).toBe(1500);
    });

    it("uses explicit total_tokens over auto-computed", () => {
      const id = insertActivity(db, {
        toolName: "test",
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 2000,
      });

      const row = db
        .prepare("SELECT total_tokens FROM agent_activity WHERE id = ?")
        .get(id) as { total_tokens: number };
      expect(row.total_tokens).toBe(2000);
    });

    it("stores metadata as JSON", () => {
      const id = insertActivity(db, {
        toolName: "test",
        metadata: { retries: 3, cached: true },
      });

      const row = db
        .prepare("SELECT metadata FROM agent_activity WHERE id = ?")
        .get(id) as { metadata: string };
      expect(JSON.parse(row.metadata)).toEqual({ retries: 3, cached: true });
    });

    it("stores boolean quality fields as integers", () => {
      const id = insertActivity(db, {
        toolName: "test",
        lintClean: true,
        typecheckClean: false,
      });

      const row = db
        .prepare("SELECT lint_clean, typecheck_clean FROM agent_activity WHERE id = ?")
        .get(id) as { lint_clean: number; typecheck_clean: number };
      expect(row.lint_clean).toBe(1);
      expect(row.typecheck_clean).toBe(0);
    });

    it("works with minimal params (only toolName required)", () => {
      const id = insertActivity(db, { toolName: "test" });
      expect(id).toBeGreaterThan(0);
    });
  });

  describe("getSessionTotals", () => {
    it("sums cost and tokens", () => {
      insertActivity(db, { toolName: "a", totalTokens: 100, costUsd: 0.01 });
      insertActivity(db, { toolName: "b", totalTokens: 200, costUsd: 0.02 });
      insertActivity(db, { toolName: "c", totalTokens: 300, costUsd: 0.03 });

      const totals = getSessionTotals(db);
      expect(totals.activityCount).toBe(3);
      expect(totals.totalTokens).toBe(600);
      expect(totals.totalCost).toBeCloseTo(0.06);
    });

    it("filters by model", () => {
      insertActivity(db, { toolName: "a", model: "claude", totalTokens: 100 });
      insertActivity(db, { toolName: "b", model: "gpt", totalTokens: 200 });

      const totals = getSessionTotals(db, undefined, "claude");
      expect(totals.activityCount).toBe(1);
      expect(totals.totalTokens).toBe(100);
    });

    it("returns zeros when no activity", () => {
      const totals = getSessionTotals(db);
      expect(totals.activityCount).toBe(0);
      expect(totals.totalTokens).toBe(0);
      expect(totals.totalCost).toBe(0);
    });
  });

  describe("queryMetrics", () => {
    beforeEach(() => {
      insertActivity(db, {
        toolName: "update_task",
        model: "claude-sonnet-4",
        totalTokens: 1000,
        costUsd: 0.01,
        durationMs: 5000,
        driftCount: 2,
        testPassCount: 40,
        testFailCount: 1,
      });
      insertActivity(db, {
        toolName: "code_edit",
        model: "claude-sonnet-4",
        totalTokens: 2000,
        costUsd: 0.02,
        durationMs: 8000,
      });
      insertActivity(db, {
        toolName: "update_task",
        model: "gpt-4o",
        totalTokens: 1500,
        costUsd: 0.015,
        durationMs: 6000,
      });
    });

    it("returns recent rows with group_by=none", () => {
      const result = queryMetrics(db, { groupBy: "none", limit: 50 });
      expect(result.grouped).toBe(false);
      expect(result.rows.length).toBe(3);
      expect(result.totals.activityCount).toBe(3);
    });

    it("groups by model", () => {
      const result = queryMetrics(db, { groupBy: "model", limit: 50 });
      expect(result.grouped).toBe(true);
      expect(result.rows.length).toBe(2);

      const claude = (result.rows as Array<{ groupKey: string; activityCount: number }>)
        .find((r) => r.groupKey === "claude-sonnet-4");
      expect(claude?.activityCount).toBe(2);
    });

    it("groups by tool", () => {
      const result = queryMetrics(db, { groupBy: "tool", limit: 50 });
      expect(result.grouped).toBe(true);
      expect(result.rows.length).toBe(2);
    });

    it("filters by model", () => {
      const result = queryMetrics(db, {
        groupBy: "none",
        limit: 50,
        model: "gpt-4o",
      });
      expect(result.rows.length).toBe(1);
      expect(result.totals.activityCount).toBe(1);
    });

    it("returns latest quality snapshot", () => {
      const result = queryMetrics(db, { groupBy: "none", limit: 50 });
      expect(result.qualitySnapshot.driftCount).toBe(2);
      expect(result.qualitySnapshot.testPassCount).toBe(40);
      expect(result.qualitySnapshot.testFailCount).toBe(1);
      expect(result.qualitySnapshot.capturedAt).not.toBeNull();
    });

    it("returns null quality snapshot when no quality data", () => {
      // Clear and insert without quality data
      db.prepare("DELETE FROM agent_activity").run();
      insertActivity(db, { toolName: "test", model: "x" });

      const result = queryMetrics(db, { groupBy: "none", limit: 50 });
      expect(result.qualitySnapshot.capturedAt).toBeNull();
    });

    it("respects limit", () => {
      const result = queryMetrics(db, { groupBy: "none", limit: 2 });
      expect(result.rows.length).toBe(2);
      expect(result.totals.activityCount).toBe(3); // totals still reflect all
    });
  });

  describe("exportMetrics", () => {
    const tmpDir = join(tmpdir(), "arcbridge-test-export-" + Date.now());

    beforeEach(() => {
      insertActivity(db, {
        toolName: "update_task",
        model: "claude",
        totalTokens: 1000,
        costUsd: 0.01,
        driftCount: 2,
        testPassCount: 40,
        lintClean: true,
      });
    });

    afterEach(() => {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    });

    it("exports JSON", () => {
      const filePath = exportMetrics(db, tmpDir, "json", {});
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toMatch(/\.json$/);

      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.activities.length).toBe(1);
      expect(content.totals.activityCount).toBe(1);
    });

    it("exports CSV", () => {
      const filePath = exportMetrics(db, tmpDir, "csv", {});
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toMatch(/\.csv$/);

      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(2); // header + 1 row
      expect(lines[0]).toContain("tool_name");
    });

    it("exports Markdown", () => {
      const filePath = exportMetrics(db, tmpDir, "markdown", {});
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toMatch(/\.md$/);

      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("# Agent Activity Report");
      expect(content).toContain("update_task");
    });
  });

  describe("schema migration", () => {
    it("agent_activity table exists in fresh schema", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_activity'",
        )
        .all();
      expect(tables.length).toBe(1);
    });

    it("agent_activity survives refreshFromDocs pattern", () => {
      // Insert activity
      insertActivity(db, { toolName: "test" });

      // Simulate refreshFromDocs: delete doc-sourced tables
      db.prepare("DELETE FROM tasks").run();
      db.prepare("DELETE FROM phases").run();
      db.prepare("DELETE FROM building_blocks").run();

      // Activity should survive
      const count = db
        .prepare("SELECT COUNT(*) as n FROM agent_activity")
        .get() as { n: number };
      expect(count.n).toBe(1);
    });
  });
});
