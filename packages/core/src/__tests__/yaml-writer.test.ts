import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import {
  syncTaskToYaml,
  addTaskToYaml,
  deleteTaskFromYaml,
  addPhaseToYaml,
  syncPhaseToYaml,
  syncScenarioToYaml,
} from "../sync/yaml-writer.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-yaml-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeTaskFile(phaseId: string, tasks: object[]) {
  const dir = join(tempDir, ".arcbridge", "plan", "tasks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${phaseId}.yaml`),
    stringify({ schema_version: 1, phase_id: phaseId, tasks }),
    "utf-8",
  );
}

function readTaskFile(phaseId: string) {
  const raw = readFileSync(
    join(tempDir, ".arcbridge", "plan", "tasks", `${phaseId}.yaml`),
    "utf-8",
  );
  return parse(raw);
}

function writePhasesFile(phases: object[]) {
  const dir = join(tempDir, ".arcbridge", "plan");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "phases.yaml"),
    stringify({ schema_version: 1, phases }),
    "utf-8",
  );
}

function readPhasesFile() {
  const raw = readFileSync(
    join(tempDir, ".arcbridge", "plan", "phases.yaml"),
    "utf-8",
  );
  return parse(raw);
}

function writeScenariosFile(scenarios: object[]) {
  const dir = join(tempDir, ".arcbridge", "arc42");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "10-quality-scenarios.yaml"),
    stringify({
      schema_version: 1,
      last_updated: "2024-01-01",
      quality_goals: [{ id: "security", priority: 1, description: "Secure" }],
      scenarios,
    }),
    "utf-8",
  );
}

function readScenariosFile() {
  const raw = readFileSync(
    join(tempDir, ".arcbridge", "arc42", "10-quality-scenarios.yaml"),
    "utf-8",
  );
  return parse(raw);
}

describe("syncTaskToYaml", () => {
  it("updates task status in YAML file", () => {
    writeTaskFile("phase-0", [
      { id: "task-0.1-init", title: "Init", status: "todo", quality_scenarios: [], acceptance_criteria: [] },
    ]);

    syncTaskToYaml(tempDir, "phase-0", "task-0.1-init", "in-progress");

    const result = readTaskFile("phase-0");
    expect(result.tasks[0].status).toBe("in-progress");
  });

  it("sets completed_at when status is done", () => {
    writeTaskFile("phase-0", [
      { id: "task-0.1-init", title: "Init", status: "in-progress", quality_scenarios: [], acceptance_criteria: [] },
    ]);

    const now = "2024-06-01T00:00:00.000Z";
    syncTaskToYaml(tempDir, "phase-0", "task-0.1-init", "done", now);

    const result = readTaskFile("phase-0");
    expect(result.tasks[0].status).toBe("done");
    expect(result.tasks[0].completed_at).toBe(now);
  });

  it("removes completed_at when status changes away from done", () => {
    writeTaskFile("phase-0", [
      { id: "task-0.1-init", title: "Init", status: "done", completed_at: "2024-06-01T00:00:00.000Z", quality_scenarios: [], acceptance_criteria: [] },
    ]);

    syncTaskToYaml(tempDir, "phase-0", "task-0.1-init", "in-progress");

    const result = readTaskFile("phase-0");
    expect(result.tasks[0].status).toBe("in-progress");
    expect(result.tasks[0].completed_at).toBeUndefined();
  });

  it("does nothing when file does not exist", () => {
    // Should not throw
    syncTaskToYaml(tempDir, "nonexistent", "task-1", "done");
  });

  it("does nothing when task ID not found", () => {
    writeTaskFile("phase-0", [
      { id: "task-0.1-init", title: "Init", status: "todo", quality_scenarios: [], acceptance_criteria: [] },
    ]);

    syncTaskToYaml(tempDir, "phase-0", "task-nonexistent", "done");

    const result = readTaskFile("phase-0");
    expect(result.tasks[0].status).toBe("todo");
  });

  it("updates only the matching task in a multi-task file", () => {
    writeTaskFile("phase-0", [
      { id: "task-0.1-init", title: "Init", status: "todo", quality_scenarios: [], acceptance_criteria: [] },
      { id: "task-0.2-setup", title: "Setup", status: "todo", quality_scenarios: [], acceptance_criteria: [] },
    ]);

    syncTaskToYaml(tempDir, "phase-0", "task-0.2-setup", "done", "2024-06-01T00:00:00.000Z");

    const result = readTaskFile("phase-0");
    expect(result.tasks[0].status).toBe("todo");
    expect(result.tasks[1].status).toBe("done");
  });
});

describe("addTaskToYaml", () => {
  it("adds a task to an existing file", () => {
    writeTaskFile("phase-0", [
      { id: "task-0.1-init", title: "Init", status: "todo", quality_scenarios: [], acceptance_criteria: [] },
    ]);

    addTaskToYaml(tempDir, "phase-0", {
      id: "task-0.2-new",
      title: "New task",
      status: "todo",
      quality_scenarios: [],
      acceptance_criteria: [],
    });

    const result = readTaskFile("phase-0");
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[1].id).toBe("task-0.2-new");
  });

  it("creates file when it does not exist", () => {
    addTaskToYaml(tempDir, "phase-new", {
      id: "task-new.1-first",
      title: "First task",
      status: "todo",
      quality_scenarios: [],
      acceptance_criteria: [],
    });

    const result = readTaskFile("phase-new");
    expect(result.tasks).toHaveLength(1);
    expect(result.phase_id).toBe("phase-new");
  });

  it("does not duplicate tasks with the same ID", () => {
    writeTaskFile("phase-0", [
      { id: "task-0.1-init", title: "Init", status: "todo", quality_scenarios: [], acceptance_criteria: [] },
    ]);

    addTaskToYaml(tempDir, "phase-0", {
      id: "task-0.1-init",
      title: "Init duplicate",
      status: "done",
      quality_scenarios: [],
      acceptance_criteria: [],
    });

    const result = readTaskFile("phase-0");
    expect(result.tasks).toHaveLength(1);
  });
});

describe("syncPhaseToYaml", () => {
  it("updates phase status", () => {
    writePhasesFile([
      { id: "phase-0", name: "Setup", phase_number: 0, status: "planned", description: "Setup phase" },
    ]);

    syncPhaseToYaml(tempDir, "phase-0", "in-progress", "2024-06-01T00:00:00.000Z");

    const result = readPhasesFile();
    expect(result.phases[0].status).toBe("in-progress");
    expect(result.phases[0].started_at).toBe("2024-06-01T00:00:00.000Z");
  });

  it("sets completed_at when completing", () => {
    writePhasesFile([
      { id: "phase-0", name: "Setup", phase_number: 0, status: "in-progress", description: "Setup phase", started_at: "2024-06-01T00:00:00.000Z" },
    ]);

    syncPhaseToYaml(tempDir, "phase-0", "complete", null, "2024-07-01T00:00:00.000Z");

    const result = readPhasesFile();
    expect(result.phases[0].status).toBe("complete");
    expect(result.phases[0].completed_at).toBe("2024-07-01T00:00:00.000Z");
  });

  it("does nothing when file does not exist", () => {
    syncPhaseToYaml(tempDir, "phase-0", "complete");
  });

  it("does nothing when phase ID not found", () => {
    writePhasesFile([
      { id: "phase-0", name: "Setup", phase_number: 0, status: "planned", description: "Setup phase" },
    ]);

    syncPhaseToYaml(tempDir, "nonexistent", "complete");

    const result = readPhasesFile();
    expect(result.phases[0].status).toBe("planned");
  });
});

describe("syncScenarioToYaml", () => {
  const makeScenario = (id: string, status: string) => ({
    id,
    name: `Scenario ${id}`,
    category: "security",
    priority: "must",
    scenario: "When something happens",
    expected: "Something is expected",
    linked_code: [],
    linked_tests: [],
    linked_blocks: [],
    verification: "automatic",
    status,
  });

  it("updates scenario status in YAML", () => {
    writeScenariosFile([makeScenario("SEC-01", "untested")]);

    syncScenarioToYaml(tempDir, "SEC-01", "passing");

    const result = readScenariosFile();
    expect(result.scenarios[0].status).toBe("passing");
  });

  it("does nothing when file does not exist", () => {
    syncScenarioToYaml(tempDir, "SEC-01", "passing");
  });

  it("does nothing when scenario ID not found", () => {
    writeScenariosFile([makeScenario("SEC-01", "untested")]);

    syncScenarioToYaml(tempDir, "PERF-01", "passing");

    const result = readScenariosFile();
    expect(result.scenarios[0].status).toBe("untested");
  });

  it("updates only the matching scenario", () => {
    writeScenariosFile([
      makeScenario("SEC-01", "untested"),
      makeScenario("PERF-01", "untested"),
    ]);

    syncScenarioToYaml(tempDir, "PERF-01", "failing");

    const result = readScenariosFile();
    expect(result.scenarios[0].status).toBe("untested");
    expect(result.scenarios[1].status).toBe("failing");
  });

  it("updates linked_tests when provided", () => {
    writeScenariosFile([makeScenario("SEC-01", "untested")]);

    syncScenarioToYaml(tempDir, "SEC-01", "passing", [
      "src/__tests__/auth.test.ts",
      "src/__tests__/security.test.ts",
    ]);

    const result = readScenariosFile();
    expect(result.scenarios[0].status).toBe("passing");
    expect(result.scenarios[0].linked_tests).toEqual([
      "src/__tests__/auth.test.ts",
      "src/__tests__/security.test.ts",
    ]);
  });

  it("preserves existing linked_tests when not provided", () => {
    const scenarios = [{ ...makeScenario("SEC-01", "untested"), linked_tests: ["existing-test.ts"] }];
    writeScenariosFile(scenarios);

    syncScenarioToYaml(tempDir, "SEC-01", "passing");

    const result = readScenariosFile();
    expect(result.scenarios[0].status).toBe("passing");
    expect(result.scenarios[0].linked_tests).toEqual(["existing-test.ts"]);
  });
});

describe("deleteTaskFromYaml", () => {
  function setupTaskFile(tasks: Array<{ id: string; title: string }>) {
    const tasksDir = join(tempDir, ".arcbridge", "plan", "tasks");
    mkdirSync(tasksDir, { recursive: true });
    const taskFile = {
      schema_version: 1,
      phase_id: "phase-0-setup",
      tasks: tasks.map((t) => ({
        ...t,
        status: "todo",
        quality_scenarios: [],
        acceptance_criteria: ["test"],
      })),
    };
    writeFileSync(join(tasksDir, "phase-0-setup.yaml"), stringify(taskFile), "utf-8");
  }

  function readTaskFile() {
    const raw = readFileSync(
      join(tempDir, ".arcbridge", "plan", "tasks", "phase-0-setup.yaml"),
      "utf-8",
    );
    return parse(raw);
  }

  it("removes a task from the YAML file", () => {
    setupTaskFile([
      { id: "task-1", title: "First" },
      { id: "task-2", title: "Second" },
      { id: "task-3", title: "Third" },
    ]);

    const result = deleteTaskFromYaml(tempDir, "phase-0-setup", "task-2");
    expect(result.success).toBe(true);

    const file = readTaskFile();
    expect(file.tasks.length).toBe(2);
    expect(file.tasks.map((t: { id: string }) => t.id)).toEqual(["task-1", "task-3"]);
  });

  it("returns success when task not in YAML (MCP-only task)", () => {
    setupTaskFile([{ id: "task-1", title: "First" }]);

    const result = deleteTaskFromYaml(tempDir, "phase-0-setup", "nonexistent");
    expect(result.success).toBe(true);

    // File unchanged
    const file = readTaskFile();
    expect(file.tasks.length).toBe(1);
  });

  it("returns success when YAML file does not exist", () => {
    const result = deleteTaskFromYaml(tempDir, "phase-99-missing", "task-1");
    expect(result.success).toBe(true);
  });

  it("returns warning on invalid YAML", () => {
    const tasksDir = join(tempDir, ".arcbridge", "plan", "tasks");
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, "phase-0-setup.yaml"), "not: valid: yaml: [broken", "utf-8");

    const result = deleteTaskFromYaml(tempDir, "phase-0-setup", "task-1");
    expect(result.success).toBe(false);
    expect(result.warning).toBeDefined();
  });
});

describe("addPhaseToYaml", () => {
  function setupPhasesFile(phases: Array<{ id: string; name: string; phase_number: number }>) {
    const planDir = join(tempDir, ".arcbridge", "plan");
    mkdirSync(planDir, { recursive: true });
    const phasesFile = {
      schema_version: 1,
      phases: phases.map((p) => ({
        ...p,
        status: "planned",
        description: "Test phase",
        gate_requirements: [],
      })),
    };
    writeFileSync(join(planDir, "phases.yaml"), stringify(phasesFile), "utf-8");
  }

  function readPhasesFile() {
    return parse(readFileSync(join(tempDir, ".arcbridge", "plan", "phases.yaml"), "utf-8"));
  }

  it("adds a phase to existing phases.yaml", () => {
    setupPhasesFile([
      { id: "phase-0-setup", name: "Setup", phase_number: 0 },
    ]);

    const result = addPhaseToYaml(tempDir, {
      id: "phase-1-foundation",
      name: "Foundation",
      phase_number: 1,
      description: "Core setup",
    });

    expect(result.success).toBe(true);
    const file = readPhasesFile();
    expect(file.phases.length).toBe(2);
    expect(file.phases[1].id).toBe("phase-1-foundation");
  });

  it("sorts phases by phase_number", () => {
    setupPhasesFile([
      { id: "phase-0-setup", name: "Setup", phase_number: 0 },
      { id: "phase-2-features", name: "Features", phase_number: 2 },
    ]);

    addPhaseToYaml(tempDir, {
      id: "phase-1-foundation",
      name: "Foundation",
      phase_number: 1,
      description: "Core setup",
    });

    const file = readPhasesFile();
    expect(file.phases.map((p: { phase_number: number }) => p.phase_number)).toEqual([0, 1, 2]);
  });

  it("creates empty task file for new phase", () => {
    setupPhasesFile([]);

    addPhaseToYaml(tempDir, {
      id: "phase-0-setup",
      name: "Setup",
      phase_number: 0,
      description: "Initial setup",
    });

    const taskFilePath = join(tempDir, ".arcbridge", "plan", "tasks", "phase-0-setup.yaml");
    const taskFile = parse(readFileSync(taskFilePath, "utf-8"));
    expect(taskFile.phase_id).toBe("phase-0-setup");
    expect(taskFile.tasks).toEqual([]);
  });

  it("prevents duplicate phases (idempotent)", () => {
    setupPhasesFile([
      { id: "phase-0-setup", name: "Setup", phase_number: 0 },
    ]);

    const result = addPhaseToYaml(tempDir, {
      id: "phase-0-setup",
      name: "Setup Again",
      phase_number: 0,
      description: "Duplicate",
    });

    expect(result.success).toBe(true);
    const file = readPhasesFile();
    expect(file.phases.length).toBe(1);
  });

  it("returns warning when phases.yaml missing", () => {
    const result = addPhaseToYaml(tempDir, {
      id: "phase-0",
      name: "Test",
      phase_number: 0,
      description: "Test",
    });

    expect(result.success).toBe(false);
    expect(result.warning).toContain("not found");
  });
});
