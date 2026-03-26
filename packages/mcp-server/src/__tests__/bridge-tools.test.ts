import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  openMemoryDatabase,
  initializeSchema,
  indexProject,
  detectDrift,
  writeDriftLog,
} from "@arcbridge/core";
import type { Database } from "@arcbridge/core";

const TS_FIXTURE = join(
  __dirname,
  "..",
  "..",
  "..",
  "core",
  "src",
  "__tests__",
  "fixtures",
  "ts-project",
);

let db: Database;

beforeEach(async () => {
  db = openMemoryDatabase();
  initializeSchema(db);
});

afterEach(() => {
  db.close();
});

describe("check_drift tool queries", () => {
  it("returns no drift when blocks cover all files", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Add blocks that cover all code paths
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('all', 'Everything', 'All code', '["src/"]')`,
    ).run();

    const entries = detectDrift(db);
    expect(entries).toEqual([]);
  });

  it("groups drift by kind", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Partial coverage → undocumented + missing
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('partial', 'Partial', 'Some code', '["src/models/"]')`,
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('phantom', 'Phantom', 'Missing', '["src/nonexistent/"]')`,
    ).run();

    const entries = detectDrift(db);

    const kinds = new Set(entries.map((e) => e.kind));
    expect(kinds.has("undocumented_module")).toBe(true);
    expect(kinds.has("missing_module")).toBe(true);
  });

  it("persists drift to drift_log table", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('partial', 'Partial', 'Some', '["src/models/"]')`,
    ).run();

    const entries = detectDrift(db);
    writeDriftLog(db, entries);

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM drift_log WHERE resolution IS NULL").get() as {
        count: number;
      }
    ).count;
    expect(count).toBe(entries.length);
  });
});

describe("get_guidance tool queries", () => {
  it("matches file to building block via code_paths", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]', '[]')`,
    ).run();

    // Simulate the guidance tool's block matching logic
    const blocks = db
      .prepare("SELECT id, name, code_paths FROM building_blocks")
      .all() as { id: string; name: string; code_paths: string }[];

    let matchedBlockId: string | null = null;
    const filePath = "src/models/user.ts";
    for (const block of blocks) {
      const paths = JSON.parse(block.code_paths) as string[];
      for (const cp of paths) {
        const prefix = cp.replace(/\*+\/?$/, "");
        if (filePath.startsWith(prefix)) {
          matchedBlockId = block.id;
          break;
        }
      }
      if (matchedBlockId) break;
    }

    expect(matchedBlockId).toBe("models");
  });

  it("returns null for unmapped files", async () => {
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]')`,
    ).run();

    const blocks = db
      .prepare("SELECT id, name, code_paths FROM building_blocks")
      .all() as { id: string; name: string; code_paths: string }[];

    let matchedBlockId: string | null = null;
    const filePath = "src/unknown/something.ts";
    for (const block of blocks) {
      const paths = JSON.parse(block.code_paths) as string[];
      for (const cp of paths) {
        const prefix = cp.replace(/\*+\/?$/, "");
        if (filePath.startsWith(prefix)) {
          matchedBlockId = block.id;
          break;
        }
      }
      if (matchedBlockId) break;
    }

    expect(matchedBlockId).toBeNull();
  });

  it("finds existing patterns nearby", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    const symbols = db
      .prepare(
        "SELECT name, kind FROM symbols WHERE file_path LIKE 'src/models/%' ORDER BY kind, name",
      )
      .all() as { name: string; kind: string }[];

    expect(symbols.length).toBeGreaterThan(0);
  });

  it("filters quality scenarios by action type", async () => {
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority)
       VALUES ('SEC-01', 'Auth on routes', 'security', 'API routes require auth', 'Unauthorized returns 401', 'must')`,
    ).run();
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority)
       VALUES ('PERF-01', 'Page load', 'performance', 'Page loads quickly', 'Under 3s', 'should')`,
    ).run();

    // Simulate the "adding-api-route" filter
    const relevantCategories = ["security", "performance", "reliability"];
    const scenarios = db
      .prepare("SELECT id, name, category FROM quality_scenarios")
      .all() as { id: string; name: string; category: string }[];

    const filtered = scenarios.filter((s) =>
      relevantCategories.includes(s.category),
    );

    expect(filtered.length).toBe(2);
    expect(filtered.some((s) => s.id === "SEC-01")).toBe(true);
  });
});

describe("get_open_questions tool queries", () => {
  it("surfaces untested must-have scenarios", async () => {
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority, status)
       VALUES ('SEC-01', 'Auth', 'security', 'scenario', 'expected', 'must', 'untested')`,
    ).run();
    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, priority, status)
       VALUES ('PERF-01', 'Speed', 'performance', 'scenario', 'expected', 'must', 'passing')`,
    ).run();

    const untested = db
      .prepare(
        "SELECT id FROM quality_scenarios WHERE priority = 'must' AND status IN ('untested', 'failing')",
      )
      .all() as { id: string }[];

    expect(untested.length).toBe(1);
    expect(untested[0]!.id).toBe("SEC-01");
  });

  it("finds building blocks without code_paths", async () => {
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('empty', 'Empty Block', 'Nothing mapped', '[]')`,
    ).run();
    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('filled', 'Filled Block', 'Has code', '["src/"]')`,
    ).run();

    const allBlocks = db
      .prepare("SELECT id, code_paths FROM building_blocks")
      .all() as { id: string; code_paths: string }[];

    const emptyBlocks = allBlocks.filter((b) => {
      const paths = JSON.parse(b.code_paths);
      return paths.length === 0;
    });

    expect(emptyBlocks.length).toBe(1);
  });

  it("finds unresolved drift entries", async () => {
    db.prepare(
      `INSERT INTO drift_log (detected_at, kind, severity, description)
       VALUES ('2024-01-01', 'undocumented_module', 'warning', 'Test drift')`,
    ).run();
    db.prepare(
      `INSERT INTO drift_log (detected_at, kind, severity, description, resolution, resolved_at)
       VALUES ('2024-01-01', 'missing_module', 'warning', 'Resolved', 'fixed', '2024-01-02')`,
    ).run();

    const unresolved = db
      .prepare("SELECT kind FROM drift_log WHERE resolution IS NULL")
      .all() as { kind: string }[];

    expect(unresolved.length).toBe(1);
    expect(unresolved[0]!.kind).toBe("undocumented_module");
  });

  it("finds tasks without acceptance criteria in current phase", async () => {
    db.prepare(
      `INSERT INTO phases (id, name, phase_number, status, description)
       VALUES ('phase-1', 'Phase 1', 1, 'in-progress', 'Current')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, acceptance_criteria, created_at)
       VALUES ('task-1', 'phase-1', 'Task with criteria', 'todo', '["criterion 1"]', '2024-01-01')`,
    ).run();
    db.prepare(
      `INSERT INTO tasks (id, phase_id, title, status, acceptance_criteria, created_at)
       VALUES ('task-2', 'phase-1', 'Task without criteria', 'todo', '[]', '2024-01-01')`,
    ).run();

    const currentPhase = db
      .prepare("SELECT id FROM phases WHERE status = 'in-progress' LIMIT 1")
      .get() as { id: string } | undefined;

    expect(currentPhase).toBeDefined();

    const tasks = db
      .prepare("SELECT id, acceptance_criteria FROM tasks WHERE phase_id = ? AND status != 'done'")
      .all(currentPhase!.id) as { id: string; acceptance_criteria: string }[];

    const withoutCriteria = tasks.filter((t) => {
      const criteria = JSON.parse(t.acceptance_criteria);
      return criteria.length === 0;
    });

    expect(withoutCriteria.length).toBe(1);
    expect(withoutCriteria[0]!.id).toBe("task-2");
  });
});

describe("get_building_block mapped symbols", () => {
  it("returns symbols matching code_paths", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('models', 'Models', 'Data models', '["src/models/"]')`,
    ).run();

    const symbols = db
      .prepare(
        "SELECT name, kind FROM symbols WHERE file_path LIKE ? ESCAPE '\\' ORDER BY name",
      )
      .all("src/models/%") as { name: string; kind: string }[];

    expect(symbols.length).toBeGreaterThan(0);
  });

  it("returns empty for blocks with no matching symbols", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      `INSERT INTO building_blocks (id, name, responsibility, code_paths)
       VALUES ('ghost', 'Ghost', 'Missing', '["src/nonexistent/"]')`,
    ).run();

    const symbols = db
      .prepare(
        "SELECT name FROM symbols WHERE file_path LIKE ? ESCAPE '\\'",
      )
      .all("src/nonexistent/%") as { name: string }[];

    expect(symbols.length).toBe(0);
  });
});

describe("unlinked_test drift detection", () => {
  it("detects quality scenarios with non-existent test paths", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, linked_tests)
       VALUES ('SEC-01', 'Auth', 'security', 'scenario', 'expected', '["tests/auth.test.ts"]')`,
    ).run();

    const entries = detectDrift(db);
    const unlinked = entries.filter((e) => e.kind === "unlinked_test");
    expect(unlinked.length).toBeGreaterThan(0);
    expect(unlinked[0]!.affectedFile).toBe("tests/auth.test.ts");
  });

  it("does not flag linked tests that match indexed files", async () => {
    await indexProject(db, { projectRoot: TS_FIXTURE });

    // Use a path that actually exists in the indexed project
    const existingFile = db
      .prepare("SELECT file_path FROM symbols LIMIT 1")
      .get() as { file_path: string };

    db.prepare(
      `INSERT INTO quality_scenarios (id, name, category, scenario, expected, linked_tests)
       VALUES ('SEC-01', 'Auth', 'security', 'scenario', 'expected', ?)`,
    ).run(JSON.stringify([existingFile.file_path]));

    const entries = detectDrift(db);
    const unlinked = entries.filter(
      (e) => e.kind === "unlinked_test" && e.description.includes("SEC-01"),
    );
    expect(unlinked.length).toBe(0);
  });
});
