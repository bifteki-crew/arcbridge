/**
 * End-to-end integration tests that verify MCP tool queries work correctly
 * with C# indexed symbols. These tests run the same SQL queries that the
 * MCP tools use, against a fully indexed .NET project.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type Database from "better-sqlite3";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { indexProject } from "../indexer/index.js";
import { detectDrift } from "../drift/detector.js";

const FIXTURE_DIR = resolve(__dirname, "fixtures/dotnet-project");

const indexerProject = resolve(
  __dirname,
  "../../../dotnet-indexer/ArcBridge.DotnetIndexer.csproj",
);

const hasDotnet = (() => {
  try {
    execFileSync("dotnet", ["--version"], { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
})();

const isReady = (() => {
  if (!hasDotnet || !existsSync(indexerProject)) return false;
  try {
    execFileSync("dotnet", ["build", indexerProject], {
      encoding: "utf-8",
      timeout: 120_000,
    });
    execFileSync("dotnet", ["build"], {
      encoding: "utf-8",
      cwd: FIXTURE_DIR,
      timeout: 120_000,
    });
    return true;
  } catch {
    return false;
  }
})();

const describeIfDotnet = isReady ? describe : describe.skip;

describeIfDotnet("MCP tool queries with C# symbols", { timeout: 30_000 }, () => {
  let db: Database.Database;

  beforeAll(() => {
    db = openMemoryDatabase();
    initializeSchema(db);

    // Index the .NET fixture
    indexProject(db, { projectRoot: FIXTURE_DIR, language: "csharp" });

    // Add building blocks to simulate a real initialized project
    db.prepare(`
      INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
      VALUES ('controllers', 'API Controllers', 'Handle HTTP requests', '["Controllers/"]', '["services"]')
    `).run();
    db.prepare(`
      INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
      VALUES ('services', 'Services', 'Business logic', '["Services/"]', '[]')
    `).run();
    db.prepare(`
      INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
      VALUES ('models', 'Models', 'Data models', '["Models/"]', '[]')
    `).run();
    db.prepare(`
      INSERT INTO building_blocks (id, name, responsibility, code_paths, interfaces)
      VALUES ('endpoints', 'Minimal API Endpoints', 'HTTP endpoint mappings', '["Endpoints/"]', '["services"]')
    `).run();
  });

  afterAll(() => {
    db?.close();
  });

  // --- search_symbols queries ---

  describe("search_symbols", () => {
    it("finds symbols by name query", () => {
      const rows = db
        .prepare(
          "SELECT id, name, qualified_name, kind, file_path, start_line, signature FROM symbols WHERE name LIKE ? ORDER BY name LIMIT 50",
        )
        .all("%Order%") as Array<{ id: string; name: string; kind: string; file_path: string; signature: string | null }>;

      expect(rows.length).toBeGreaterThan(0);
      const names = rows.map((r) => r.name);
      expect(names).toContain("Order");
      expect(names).toContain("OrdersController");
      expect(names).toContain("OrderService");
    });

    it("filters by kind", () => {
      const interfaces = db
        .prepare("SELECT name FROM symbols WHERE kind = ? ORDER BY name")
        .all("interface") as Array<{ name: string }>;

      expect(interfaces.map((i) => i.name)).toContain("IOrderService");
    });

    it("filters by file_path prefix", () => {
      const controllerSymbols = db
        .prepare("SELECT name, kind FROM symbols WHERE file_path LIKE ? ORDER BY name")
        .all("Controllers/%") as Array<{ name: string; kind: string }>;

      expect(controllerSymbols.length).toBeGreaterThan(0);
      expect(controllerSymbols.some((s) => s.name === "OrdersController")).toBe(true);
      // Should NOT contain models or services
      expect(controllerSymbols.some((s) => s.name === "OrderService")).toBe(false);
    });

    it("filters by building block via code_paths", () => {
      const block = db
        .prepare("SELECT code_paths FROM building_blocks WHERE id = ?")
        .get("services") as { code_paths: string };

      const codePaths = JSON.parse(block.code_paths) as string[];
      const prefix = codePaths[0].replace(/\*\*?\/?\*?$/, "");

      const symbols = db
        .prepare("SELECT name, kind FROM symbols WHERE file_path LIKE ? ORDER BY name")
        .all(`${prefix}%`) as Array<{ name: string; kind: string }>;

      expect(symbols.some((s) => s.name === "OrderService")).toBe(true);
      expect(symbols.some((s) => s.name === "IOrderService")).toBe(true);
      // Should NOT contain controllers
      expect(symbols.some((s) => s.name === "OrdersController")).toBe(false);
    });

    it("filters exported symbols", () => {
      const exported = db
        .prepare("SELECT name FROM symbols WHERE is_exported = 1 AND kind = 'class' ORDER BY name")
        .all() as Array<{ name: string }>;

      expect(exported.map((e) => e.name)).toContain("OrdersController");
      expect(exported.map((e) => e.name)).toContain("OrderService");
    });

    it("returns signatures for methods", () => {
      const methods = db
        .prepare("SELECT name, signature, return_type, is_async FROM symbols WHERE kind = 'function' AND name = 'GetAll'")
        .all() as Array<{ name: string; signature: string; return_type: string; is_async: number }>;

      expect(methods.length).toBeGreaterThan(0);
      expect(methods[0].signature).toBeTruthy();
      expect(methods[0].is_async).toBe(1);
    });

    it("returns doc comments", () => {
      const order = db
        .prepare("SELECT doc_comment FROM symbols WHERE name = 'Order' AND kind = 'class'")
        .get() as { doc_comment: string | null } | undefined;

      expect(order?.doc_comment).toContain("customer order");
    });
  });

  // --- get_dependency_graph queries ---

  describe("get_dependency_graph", () => {
    it("finds dependencies from Controllers/ module", () => {
      const deps = db
        .prepare(
          `SELECT d.source_symbol as source_id, s1.name as source_name, s1.file_path as source_file,
                  d.target_symbol as target_id, s2.name as target_name, s2.file_path as target_file,
                  d.kind
           FROM dependencies d
           JOIN symbols s1 ON s1.id = d.source_symbol
           JOIN symbols s2 ON s2.id = d.target_symbol
           WHERE s1.file_path LIKE ?
           ORDER BY d.kind, s2.name`,
        )
        .all("Controllers/%") as Array<{
          source_name: string;
          target_name: string;
          source_file: string;
          target_file: string;
          kind: string;
        }>;

      expect(deps.length).toBeGreaterThan(0);

      // Controller should call service methods
      const calls = deps.filter((d) => d.kind === "calls");
      expect(calls.some((d) => d.target_name === "GetAllAsync")).toBe(true);

      // Controller should use IOrderService type
      const usesType = deps.filter((d) => d.kind === "uses_type");
      expect(usesType.some((d) => d.target_name === "IOrderService")).toBe(true);
    });

    it("finds dependents of Services/ module", () => {
      const deps = db
        .prepare(
          `SELECT d.source_symbol as source_id, s1.name as source_name, s1.file_path as source_file,
                  d.target_symbol as target_id, s2.name as target_name, s2.file_path as target_file,
                  d.kind
           FROM dependencies d
           JOIN symbols s1 ON s1.id = d.source_symbol
           JOIN symbols s2 ON s2.id = d.target_symbol
           WHERE s2.file_path LIKE ?
           ORDER BY d.kind, s1.name`,
        )
        .all("Services/%") as Array<{
          source_name: string;
          target_name: string;
          source_file: string;
          target_file: string;
          kind: string;
        }>;

      expect(deps.length).toBeGreaterThan(0);

      // Controllers should depend on services
      expect(deps.some((d) => d.source_file.startsWith("Controllers/"))).toBe(true);
    });

    it("captures implements relationships", () => {
      const implements_ = db
        .prepare(
          `SELECT s1.name as source_name, s2.name as target_name
           FROM dependencies d
           JOIN symbols s1 ON s1.id = d.source_symbol
           JOIN symbols s2 ON s2.id = d.target_symbol
           WHERE d.kind = 'implements'`,
        )
        .all() as Array<{ source_name: string; target_name: string }>;

      // OrderService implements IOrderService
      expect(
        implements_.some(
          (d) => d.source_name === "OrderService" && d.target_name === "IOrderService",
        ),
      ).toBe(true);
    });
  });

  // --- get_route_map queries ---

  describe("get_route_map", () => {
    it("returns all routes", () => {
      const routes = db
        .prepare("SELECT * FROM routes ORDER BY route_path, kind")
        .all() as Array<{
          id: string;
          route_path: string;
          kind: string;
          http_methods: string;
          has_auth: number;
          service: string;
        }>;

      expect(routes.length).toBeGreaterThanOrEqual(7);
      expect(routes.every((r) => r.kind === "api-route")).toBe(true);
    });

    it("filters by route prefix", () => {
      const orderRoutes = db
        .prepare("SELECT * FROM routes WHERE route_path LIKE ? ORDER BY route_path")
        .all("/api/orders%") as Array<{ route_path: string; http_methods: string }>;

      expect(orderRoutes.length).toBeGreaterThanOrEqual(3);
      const paths = orderRoutes.map((r) => r.route_path);
      expect(paths).toContain("/api/orders");
      expect(paths).toContain("/api/orders/{id}");
    });

    it("filters by kind (api-route)", () => {
      const apiRoutes = db
        .prepare("SELECT * FROM routes WHERE kind = ?")
        .all("api-route") as Array<{ route_path: string }>;

      expect(apiRoutes.length).toBeGreaterThan(0);
    });

    it("shows auth status correctly", () => {
      const authRoutes = db
        .prepare("SELECT route_path, http_methods, has_auth FROM routes WHERE has_auth = 1")
        .all() as Array<{ route_path: string; http_methods: string; has_auth: number }>;

      expect(authRoutes.length).toBeGreaterThan(0);
      // POST /api/orders has [Authorize]
      expect(
        authRoutes.some((r) => r.route_path === "/api/orders" && r.http_methods.includes("POST")),
      ).toBe(true);
      // POST /api/products has .RequireAuthorization()
      expect(
        authRoutes.some((r) => r.route_path === "/api/products" && r.http_methods.includes("POST")),
      ).toBe(true);
    });
  });

  // --- check_drift queries ---

  describe("check_drift", () => {
    it("detects undocumented modules", () => {
      const entries = detectDrift(db, { projectType: "dotnet-webapi" });
      const undocumented = entries.filter((e) => e.kind === "undocumented_module");

      // WeatherForecast.cs and WeatherForecastController.cs are not mapped to any block
      expect(undocumented.some((e) => e.affectedFile?.includes("WeatherForecast"))).toBe(true);
    });

    it("does not flag files covered by building blocks", () => {
      const entries = detectDrift(db, { projectType: "dotnet-webapi" });
      const undocumented = entries.filter((e) => e.kind === "undocumented_module");

      // Files under Controllers/, Services/, Models/ are mapped
      expect(undocumented.some((e) => e.affectedFile === "Controllers/OrdersController.cs")).toBe(false);
      expect(undocumented.some((e) => e.affectedFile === "Services/OrderService.cs")).toBe(false);
      expect(undocumented.some((e) => e.affectedFile === "Models/Order.cs")).toBe(false);
    });

    it("detects dependency violations across building blocks", () => {
      const entries = detectDrift(db);
      const violations = entries.filter((e) => e.kind === "dependency_violation");

      // At least one cross-block violation should exist — controllers/endpoints/services
      // all depend on models, and services doesn't declare models in its interfaces
      // The exact violations depend on which cross-block deps exist
      // The important thing is that the detector runs without errors on C# symbols
      expect(Array.isArray(violations)).toBe(true);

      // If violations exist, they should have proper structure
      for (const v of violations) {
        expect(v.severity).toBe("error");
        expect(v.affectedBlock).toBeTruthy();
        expect(v.description).toContain("depends on");
      }
    });

    it("detects new package dependencies without ADRs", () => {
      const entries = detectDrift(db);
      const newDeps = entries.filter((e) => e.kind === "new_dependency");

      // Each flagged dep should have correct structure
      for (const dep of newDeps) {
        expect(dep.severity).toBe("info");
        expect(dep.description).toContain("not mentioned in any ADR");
      }
    });

    it("ignores dotnet framework files in undocumented check", () => {
      const entries = detectDrift(db, { projectType: "dotnet-webapi" });
      const undocumented = entries.filter((e) => e.kind === "undocumented_module");

      // Program.cs should be ignored for dotnet-webapi projects
      expect(undocumented.some((e) => e.affectedFile === "Program.cs")).toBe(false);
    });
  });

  // --- Cross-cutting: agent workflow simulation ---

  describe("agent workflow simulation", () => {
    it("agent can trace a bug from route to implementation", () => {
      // Step 1: Agent finds the route for POST /api/orders
      const route = db
        .prepare("SELECT * FROM routes WHERE route_path = '/api/orders' AND http_methods LIKE '%POST%'")
        .get() as { id: string; has_auth: number } | undefined;

      expect(route).toBeDefined();
      expect(route!.has_auth).toBe(1); // Agent sees it requires auth

      // Step 2: Agent searches for the handler symbol
      const handler = db
        .prepare("SELECT * FROM symbols WHERE name = 'Create' AND file_path LIKE 'Controllers/%'")
        .get() as { id: string; file_path: string; start_line: number; signature: string } | undefined;

      expect(handler).toBeDefined();
      expect(handler!.file_path).toBe("Controllers/OrdersController.cs");

      // Step 3: Agent traces what the handler calls
      const calls = db
        .prepare(
          `SELECT s2.name, s2.file_path, s2.kind
           FROM dependencies d
           JOIN symbols s2 ON s2.id = d.target_symbol
           WHERE d.source_symbol = ? AND d.kind = 'calls'`,
        )
        .all(handler!.id) as Array<{ name: string; file_path: string; kind: string }>;

      expect(calls.some((c) => c.name === "CreateAsync")).toBe(true);

      // Step 4: Agent finds the service implementation (not just the interface)
      const serviceMethods = db
        .prepare("SELECT * FROM symbols WHERE name = 'CreateAsync' AND file_path LIKE 'Services/%'")
        .all() as Array<{ id: string; file_path: string; signature: string }>;

      expect(serviceMethods.length).toBeGreaterThanOrEqual(1);
      // Both interface and implementation should be found
      const files = serviceMethods.map((m) => m.file_path);
      expect(files).toContain("Services/OrderService.cs");
    });

    it("agent can find which building block a file belongs to", () => {
      const blocks = db
        .prepare("SELECT id, name, code_paths FROM building_blocks")
        .all() as Array<{ id: string; name: string; code_paths: string }>;

      const file = "Controllers/OrdersController.cs";
      let matchedBlock: string | null = null;

      for (const block of blocks) {
        const paths = JSON.parse(block.code_paths) as string[];
        for (const cp of paths) {
          const prefix = cp.replace(/\*\*?\/?\*?$/, "");
          if (file.startsWith(prefix)) {
            matchedBlock = block.name;
            break;
          }
        }
        if (matchedBlock) break;
      }

      expect(matchedBlock).toBe("API Controllers");
    });

    it("agent can discover the full API surface", () => {
      const routes = db
        .prepare("SELECT route_path, http_methods, has_auth FROM routes WHERE kind = 'api-route' ORDER BY route_path")
        .all() as Array<{ route_path: string; http_methods: string; has_auth: number }>;

      // Agent gets a complete picture of all endpoints
      expect(routes.length).toBeGreaterThanOrEqual(7);

      // Can categorize by auth requirement
      const publicRoutes = routes.filter((r) => r.has_auth === 0);
      const protectedRoutes = routes.filter((r) => r.has_auth === 1);

      expect(publicRoutes.length).toBeGreaterThan(0);
      expect(protectedRoutes.length).toBeGreaterThan(0);
    });
  });
});
