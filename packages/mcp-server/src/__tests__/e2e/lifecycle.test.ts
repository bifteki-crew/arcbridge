// End-to-end integration test: a real MCP Client talking to the real
// ArcBridge server over the SDK's in-memory transport, driving the full
// Plan → Build → Sync → Review lifecycle against a scratch project on disk.
// Assertions cover both the tool outputs (what an agent sees) and the on-disk
// YAML (the source of truth). This suite is the behavioral contract for the
// upcoming tool consolidation.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createArcBridgeServer } from "../../server.js";
import { createContext } from "../../context.js";

let project: string;
let emptyDir: string;
let client: Client;
const ctx = createContext();

/** Call a tool and return its concatenated text content. */
async function call(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text?: string }>;
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

function fileIn(...parts: string[]): string {
  return readFileSync(join(project, ...parts), "utf-8");
}

beforeAll(async () => {
  project = mkdtempSync(join(tmpdir(), "arcbridge-e2e-"));
  emptyDir = mkdtempSync(join(tmpdir(), "arcbridge-e2e-empty-"));

  // Tiny API-ish codebase: an api layer importing a lib layer, so indexing
  // produces symbols, adopt produces two blocks, and interfaces get derived.
  mkdirSync(join(project, "src", "lib"), { recursive: true });
  mkdirSync(join(project, "src", "api"), { recursive: true });
  const lib: Record<string, string> = {
    "store.ts": "export const store = new Map<string, string>();\nexport function put(k: string, v: string): void { store.set(k, v); }\n",
    "util.ts": "export function slug(s: string): string { return s.toLowerCase().replace(/\\W+/g, \"-\"); }\n",
    "validate.ts": "export function required(v: unknown): boolean { return v !== null && v !== undefined; }\n",
  };
  const api: Record<string, string> = {
    "routes.ts": "import { put } from \"../lib/store.js\";\nimport { slug } from \"../lib/util.js\";\nexport function createItem(name: string): void { put(slug(name), name); }\n",
    "handlers.ts": "import { required } from \"../lib/validate.js\";\nexport function handle(body: unknown): boolean { return required(body); }\n",
    "middleware.ts": "export function logRequest(path: string): void { console.log(path); }\n",
  };
  for (const [f, c] of Object.entries(lib)) writeFileSync(join(project, "src", "lib", f), c, "utf-8");
  for (const [f, c] of Object.entries(api)) writeFileSync(join(project, "src", "api", f), c, "utf-8");
  writeFileSync(
    join(project, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true },
      include: ["src/**/*"],
    }),
    "utf-8",
  );
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify({ name: "e2e-fixture", private: true, dependencies: { express: "^4.0.0" } }),
    "utf-8",
  );

  const server = createArcBridgeServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "arcbridge-e2e", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  // Close the server-side DB handle before deleting the temp project — some
  // platforms refuse to remove directories containing open DB/WAL files.
  ctx.db?.close();
  rmSync(project, { recursive: true, force: true });
  rmSync(emptyDir, { recursive: true, force: true });
});

describe.sequential("MCP e2e lifecycle (Plan → Build → Sync → Review)", () => {
  it("rejects tool calls before init with a clear message", async () => {
    const out = await call("arcbridge_get_project_status", { target_dir: emptyDir });
    expect(out).toContain("not initialized");
  });

  it("Plan: init_project scaffolds the model on disk", async () => {
    const out = await call("arcbridge_init_project", {
      name: "e2e-fixture",
      template: "api-service",
      target_dir: project,
    });
    expect(out).toContain("e2e-fixture");

    for (const f of [
      ["config.yaml"],
      ["arc42", "05-building-blocks.yaml"],
      ["arc42", "10-quality-scenarios.yaml"],
      ["plan", "phases.yaml"],
      ["agents", "architect.md"],
    ]) {
      expect(existsSync(join(project, ".arcbridge", ...f)), `.arcbridge/${f.join("/")} missing`).toBe(true);
    }
  });

  it("Plan: adopt replaces template blocks with ones derived from the code", async () => {
    const out = await call("arcbridge_propose_building_blocks", {
      target_dir: project,
      apply: true,
    });
    expect(out).toContain("Every indexed file is mapped (0 undocumented modules).");

    const doc = parse(fileIn(".arcbridge", "arc42", "05-building-blocks.yaml")) as {
      blocks: Array<{ id: string; code_paths: string[]; interfaces: string[] }>;
    };
    const byId = new Map(doc.blocks.map((b) => [b.id, b]));
    expect(byId.get("api")?.code_paths).toEqual(["src/api/"]);
    expect(byId.get("lib")?.code_paths).toEqual(["src/lib/"]);
    // Interface direction derived from the real import edges: api → lib
    expect(byId.get("api")?.interfaces).toContain("lib");
    expect(byId.get("lib")?.interfaces ?? []).not.toContain("api");
  });

  it("Build: reindex reports the fixture's symbols", async () => {
    const out = await call("arcbridge_reindex", { target_dir: project });
    const symbols = Number(/\*\*Symbols indexed:\*\* (\d+)/.exec(out)?.[1] ?? NaN);
    expect(symbols).toBeGreaterThanOrEqual(6);
  });

  it("Build: search_symbols finds a fixture function", async () => {
    const out = await call("arcbridge_search_symbols", { target_dir: project, query: "createItem" });
    expect(out).toContain("createItem");
    expect(out).toContain("src/api/routes.ts");
  });

  it("Build: get_guidance maps a file to its adopted block", async () => {
    const out = await call("arcbridge_get_guidance", {
      target_dir: project,
      file_path: "src/api/routes.ts",
    });
    expect(out.toLowerCase()).toContain("api");
    expect(out).not.toContain("not mapped to any building block");
  });

  it("Sync: check_drift is clean after adopt", async () => {
    const out = await call("arcbridge_check_drift", { target_dir: project });
    expect(out).not.toContain("undocumented_module");
    expect(out).not.toContain("dependency_violation");
  });

  it("Plan: create_task writes through to the phase task YAML", async () => {
    const out = await call("arcbridge_create_task", {
      target_dir: project,
      phase_id: "phase-0-setup",
      title: "E2E lifecycle task",
      acceptance_criteria: ["asserted by the e2e suite"],
    });
    const taskId = /Task created: \*\*(task-[^*]+)\*\*/.exec(out)?.[1];
    expect(taskId, `no task id in output:\n${out}`).toBeTruthy();

    const yaml = parse(fileIn(".arcbridge", "plan", "tasks", "phase-0-setup.yaml")) as {
      tasks: Array<{ id: string; title: string; status: string }>;
    };
    const task = yaml.tasks.find((t) => t.id === taskId);
    expect(task?.title).toBe("E2E lifecycle task");
    expect(task?.status).toBe("todo");
  });

  it("Build: update_task syncs the new status to YAML", async () => {
    const before = parse(fileIn(".arcbridge", "plan", "tasks", "phase-0-setup.yaml")) as {
      tasks: Array<{ id: string; title: string }>;
    };
    const taskId = before.tasks.find((t) => t.title === "E2E lifecycle task")!.id;

    const out = await call("arcbridge_update_task", {
      target_dir: project,
      task_id: taskId,
      status: "done",
    });
    expect(out).toContain("done");

    const after = parse(fileIn(".arcbridge", "plan", "tasks", "phase-0-setup.yaml")) as {
      tasks: Array<{ id: string; status: string; completed_at?: string }>;
    };
    const task = after.tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe("done");
    expect(task?.completed_at).toBeTruthy();
  });

  it("Review: complete_phase refuses while tasks are open (gate)", async () => {
    const out = await call("arcbridge_complete_phase", {
      target_dir: project,
      phase_id: "phase-0-setup",
      auto_infer: false,
      run_tests: false,
    });
    expect(out).toContain("FAIL");

    const phases = parse(fileIn(".arcbridge", "plan", "phases.yaml")) as {
      phases: Array<{ id: string; status: string }>;
    };
    expect(phases.phases.find((p) => p.id === "phase-0-setup")?.status).not.toBe("complete");
  });

  it("Plan: create_phase and delete_phase write through to phases.yaml", async () => {
    const out = await call("arcbridge_create_phase", {
      target_dir: project,
      name: "E2E extra phase",
      description: "Temporary phase created by the e2e suite",
    });
    expect(out).toContain("E2E extra phase");

    const withPhase = parse(fileIn(".arcbridge", "plan", "phases.yaml")) as {
      phases: Array<{ id: string; name: string }>;
    };
    const created = withPhase.phases.find((p) => p.name === "E2E extra phase");
    expect(created).toBeTruthy();

    await call("arcbridge_delete_phase", { target_dir: project, phase_id: created!.id });
    const withoutPhase = parse(fileIn(".arcbridge", "plan", "phases.yaml")) as {
      phases: Array<{ id: string }>;
    };
    expect(withoutPhase.phases.find((p) => p.id === created!.id)).toBeUndefined();
  });

  it("survives a full refresh round-trip: statuses restored from YAML", async () => {
    // get_phase_plan triggers refreshFromDocs — the DB is rebuilt from YAML,
    // and the task status set earlier must survive.
    const out = await call("arcbridge_get_phase_plan", { target_dir: project, phase_id: "phase-0-setup" });
    // Our task renders as a checked checkbox — the "done" status survived the
    // DB rebuild because it lives in the YAML.
    const taskLine = out.split("\n").find((l) => l.includes("e2e-lifecycle-task"));
    expect(taskLine, `task line missing in:\n${out}`).toBeTruthy();
    expect(taskLine).toContain("[x]");
  });
});
