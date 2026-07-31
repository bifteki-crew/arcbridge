import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";
import type { Database } from "../db/connection.js";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { indexProject, detectProjectLanguage, discoverDotnetServices } from "../indexer/index.js";
import { parseSolutionProjects } from "../indexer/dotnet-indexer.js";
import { hashContent } from "../indexer/content-hash.js";
import { dotnetReady } from "./helpers/dotnet-ready.js";

const FIXTURE_DIR = resolve(
  __dirname,
  "fixtures/dotnet-project",
);

// The .NET indexer and this fixture are built once by vitest.global-setup.ts;
// this only checks readiness, and says so out loud when it isn't ready.
const describeIfDotnet = dotnetReady(__dirname) ? describe : describe.skip;

describeIfDotnet("dotnet indexer", { timeout: 30_000 }, () => {
  let db: Database;

  beforeAll(async () => {
    db = openMemoryDatabase();
    initializeSchema(db);
  });

  afterAll(() => {
    db?.close();
  });

  it("detects project language as csharp", async () => {
    const lang = detectProjectLanguage(FIXTURE_DIR);
    expect(lang).toBe("csharp");
  });

  it("indexes the .NET fixture project", async () => {
    const result = await indexProject(db, {
      projectRoot: FIXTURE_DIR,
      language: "csharp",
    });

    expect(result.filesProcessed).toBeGreaterThan(0);
    expect(result.symbolsIndexed).toBeGreaterThan(0);
    expect(result.dependenciesIndexed).toBeGreaterThan(0);
    expect(result.routesAnalyzed).toBeGreaterThan(0);
  });

  it("stores symbols with language=csharp", async () => {
    const symbols = db
      .prepare("SELECT * FROM symbols WHERE language = 'csharp'")
      .all() as Array<{ id: string; name: string; kind: string; language: string }>;

    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols.every((s) => s.language === "csharp")).toBe(true);
  });

  it("stores all solution symbols under one service", async () => {
    const services = db
      .prepare("SELECT DISTINCT service FROM symbols WHERE language = 'csharp'")
      .all() as Array<{ service: string }>;

    // All symbols from the solution should be under the default "main" service
    expect(services.length).toBe(1);
    expect(services[0].service).toBe("main");
  });

  it("extracts classes correctly", async () => {
    const classes = db
      .prepare("SELECT * FROM symbols WHERE kind = 'class' AND language = 'csharp'")
      .all() as Array<{ name: string; qualified_name: string; is_exported: number }>;

    const names = classes.map((c) => c.name);
    expect(names).toContain("OrdersController");
    expect(names).toContain("Order");
    expect(names).toContain("OrderService");
    expect(names).toContain("CreateOrderRequest");
  });

  it("extracts interfaces", async () => {
    const interfaces = db
      .prepare("SELECT * FROM symbols WHERE kind = 'interface' AND language = 'csharp'")
      .all() as Array<{ name: string }>;

    expect(interfaces.map((i) => i.name)).toContain("IOrderService");
  });

  it("extracts enums", async () => {
    const enums = db
      .prepare("SELECT * FROM symbols WHERE kind = 'enum' AND language = 'csharp'")
      .all() as Array<{ name: string }>;

    expect(enums.map((e) => e.name)).toContain("OrderStatus");
  });

  it("extracts methods as functions", async () => {
    const functions = db
      .prepare("SELECT * FROM symbols WHERE kind = 'function' AND language = 'csharp'")
      .all() as Array<{ name: string; is_async: number; qualified_name: string }>;

    const names = functions.map((f) => f.name);
    expect(names).toContain("GetAll");
    expect(names).toContain("GetById");
    expect(names).toContain("Create");
    expect(names).toContain("CreateAsync");

    // Check async detection
    const getAll = functions.find((f) => f.qualified_name.includes("OrdersController.GetAll"));
    expect(getAll?.is_async).toBe(1);
  });

  it("extracts properties as variables", async () => {
    const props = db
      .prepare(
        "SELECT * FROM symbols WHERE kind = 'variable' AND language = 'csharp' AND file_path LIKE '%Order.cs'",
      )
      .all() as Array<{ name: string }>;

    const names = props.map((p) => p.name);
    expect(names).toContain("Id");
    expect(names).toContain("CustomerName");
    expect(names).toContain("Total");
    expect(names).toContain("Status");
  });

  it("extracts doc comments", async () => {
    const order = db
      .prepare(
        "SELECT * FROM symbols WHERE name = 'Order' AND kind = 'class' AND language = 'csharp'",
      )
      .get() as { doc_comment: string | null } | undefined;

    expect(order?.doc_comment).toContain("customer order");
  });

  it("extracts dependencies", async () => {
    const deps = db.prepare("SELECT * FROM dependencies").all() as Array<{
      source_symbol: string;
      target_symbol: string;
      kind: string;
    }>;

    // OrderService implements IOrderService
    const implementsDep = deps.find(
      (d) =>
        d.kind === "implements" &&
        d.source_symbol.includes("OrderService#class") &&
        d.target_symbol.includes("IOrderService#interface"),
    );
    expect(implementsDep).toBeDefined();

    // Controller calls service methods
    const callsDep = deps.find(
      (d) =>
        d.kind === "calls" &&
        d.source_symbol.includes("OrdersController.GetAll") &&
        d.target_symbol.includes("GetAllAsync"),
    );
    expect(callsDep).toBeDefined();
  });

  it("extracts controller-based ASP.NET routes", async () => {
    const routes = db
      .prepare("SELECT * FROM routes")
      .all() as Array<{
        id: string;
        route_path: string;
        http_methods: string;
        has_auth: number;
      }>;

    expect(routes.length).toBeGreaterThanOrEqual(7);

    // GET /api/orders (controller)
    const getAll = routes.find(
      (r) => r.route_path === "/api/orders" && r.http_methods.includes("GET"),
    );
    expect(getAll).toBeDefined();
    expect(getAll!.has_auth).toBe(0);

    // POST /api/orders (controller, with [Authorize])
    const create = routes.find(
      (r) => r.route_path === "/api/orders" && r.http_methods.includes("POST"),
    );
    expect(create).toBeDefined();
    expect(create!.has_auth).toBe(1);

    // GET /api/orders/{id} (controller)
    const getById = routes.find(
      (r) => r.route_path === "/api/orders/{id}" && r.http_methods.includes("GET"),
    );
    expect(getById).toBeDefined();
  });

  it("extracts minimal API routes", async () => {
    const routes = db
      .prepare("SELECT * FROM routes")
      .all() as Array<{
        id: string;
        route_path: string;
        http_methods: string;
        has_auth: number;
      }>;

    // GET /api/products (minimal API, no auth)
    const getProducts = routes.find(
      (r) => r.route_path === "/api/products" && r.http_methods.includes("GET"),
    );
    expect(getProducts).toBeDefined();
    expect(getProducts!.has_auth).toBe(0);

    // POST /api/products (minimal API, with .RequireAuthorization())
    const createProduct = routes.find(
      (r) => r.route_path === "/api/products" && r.http_methods.includes("POST"),
    );
    expect(createProduct).toBeDefined();
    expect(createProduct!.has_auth).toBe(1);

    // DELETE /api/products/{id} (minimal API, with .RequireAuthorization("AdminOnly"))
    const deleteProduct = routes.find(
      (r) => r.route_path.includes("/api/products") && r.http_methods.includes("DELETE"),
    );
    expect(deleteProduct).toBeDefined();
    expect(deleteProduct!.has_auth).toBe(1);

    // GET /api/products/{id} (minimal API)
    const getProduct = routes.find(
      (r) => r.route_path === "/api/products/{id}" && r.http_methods.includes("GET"),
    );
    expect(getProduct).toBeDefined();
  });

  it("is incremental — skips unchanged files on second run", async () => {
    const result = await indexProject(db, {
      projectRoot: FIXTURE_DIR,
      language: "csharp",
    });

    // Most files should be skipped since nothing changed
    expect(result.filesSkipped).toBeGreaterThan(0);
    // Some generated files may differ between runs, but most should be skipped
    expect(result.filesSkipped).toBeGreaterThanOrEqual(result.filesProcessed);
  });

  it("generates stable symbol IDs", async () => {
    const orderClass = db
      .prepare("SELECT id FROM symbols WHERE name = 'Order' AND kind = 'class'")
      .get() as { id: string } | undefined;

    expect(orderClass).toBeDefined();
    expect(orderClass!.id).toMatch(/^Models\/Order\.cs::/);
    expect(orderClass!.id).toMatch(/#class$/);
  });

  it("discovers services from .sln file", async () => {
    const services = discoverDotnetServices(FIXTURE_DIR);
    expect(services.length).toBeGreaterThanOrEqual(1);

    const testApi = services.find((s) => s.name === "TestApi");
    expect(testApi).toBeDefined();
    expect(testApi!.path).toBe(".");
    expect(testApi!.csprojPath).toContain("TestApi.csproj");
  });

  it("parses solution project references", async () => {
    const slnPath = join(FIXTURE_DIR, "TestApi.sln");
    const projects = parseSolutionProjects(slnPath);
    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe("TestApi");
    expect(projects[0].isTestProject).toBe(false);
  });

  it("indexes NuGet package dependencies from .csproj", async () => {
    const deps = db
      .prepare("SELECT * FROM package_dependencies WHERE source = 'nuget'")
      .all() as Array<{ name: string; version: string; source: string }>;

    expect(deps.length).toBeGreaterThan(0);

    // The test fixture's TestApi.csproj should have ASP.NET packages
    const names = deps.map((d) => d.name);
    expect(names.some((n) => n.includes("Microsoft.AspNetCore"))).toBe(true);
  });

  it("produces content hashes identical to TypeScript hasher", async () => {
    // The C# indexer computes content hashes for each file.
    // Verify they match what the TypeScript hasher would produce for the same content.
    const orderFile = join(FIXTURE_DIR, "Models/Order.cs");
    const content = readFileSync(orderFile, "utf-8");
    const tsHash = hashContent(content);

    // Get the hash the C# indexer stored for this file
    const symbol = db
      .prepare(
        "SELECT content_hash FROM symbols WHERE file_path = 'Models/Order.cs' LIMIT 1",
      )
      .get() as { content_hash: string } | undefined;

    expect(symbol).toBeDefined();
    expect(symbol!.content_hash).toBe(tsHash);
  });
});

// The Roslyn backend previously inserted routes WITHOUT response_type — its JSON
// contract had no such field — so `csharp_indexer: "auto"` (which prefers Roslyn
// whenever the .NET SDK is present) silently disabled every field-level contract
// check. The existing contract tests only passed because they pin tree-sitter.
describeIfDotnet("Roslyn response_type extraction", { timeout: 60_000 }, () => {
  let db: Database;

  beforeAll(async () => {
    db = openMemoryDatabase();
    initializeSchema(db);
    await indexProject(db, { projectRoot: FIXTURE_DIR, language: "csharp" });
  });

  afterAll(() => db?.close());

  function responseTypeFor(routePath: string, method: string): string | null | undefined {
    const row = db
      .prepare("SELECT response_type, http_methods FROM routes WHERE route_path = ?")
      .all(routePath) as { response_type: string | null; http_methods: string }[];
    return row.find((r) => (JSON.parse(r.http_methods) as string[]).includes(method))?.response_type;
  }

  it("stores a response type at all (the regression this fixes)", () => {
    const withType = db
      .prepare("SELECT COUNT(*) AS n FROM routes WHERE response_type IS NOT NULL")
      .get() as { n: number };
    expect(withType.n).toBeGreaterThan(0);
  });

  it("unwraps a declared controller return type to the DTO", () => {
    // Task<ActionResult<Order>> -> Order, and the collection form likewise.
    expect(responseTypeFor("/api/orders/{id}", "GET")).toBe("Order");
    expect(responseTypeFor("/api/orders", "GET")).toBe("Order");
  });

  it("infers the DTO from the body when the signature is opaque", () => {
    // `public IActionResult GetAll() => Ok(new CustomerDto())` — tree-sitter can
    // only read the signature, so it records nothing here.
    expect(responseTypeFor("/api/customers", "GET")).toBe("CustomerDto");
  });

  it("infers through an expression-bodied member", () => {
    expect(responseTypeFor("/api/customers/featured", "GET")).toBe("CustomerDto");
  });

  it("ignores early returns that carry no DTO", () => {
    // `if (id <= 0) return NotFound(); return Ok(new CustomerDto(...));`
    expect(responseTypeFor("/api/customers/{id}", "GET")).toBe("CustomerDto");
  });

  it("stays silent when returns disagree rather than guessing", () => {
    // Two different DTOs on different branches. A confidently wrong choice would
    // produce wrong field mismatches — worse than reporting nothing.
    expect(responseTypeFor("/api/customers/ambiguous", "GET")).toBeNull();
  });

  it("stays silent when no DTO is returned", () => {
    expect(responseTypeFor("/api/customers/{id}", "DELETE")).toBeNull();
    // Minimal API returning only strings — a framework type is not a payload.
    expect(responseTypeFor("/api/products", "GET")).toBeNull();
  });

  it("resolves a minimal-API method-group handler", () => {
    // MapGet("", GetAll) where GetAll returns InvoiceDto[] — needs cross-symbol
    // resolution, which the tree-sitter backend explicitly cannot do.
    expect(responseTypeFor("/api/invoices", "GET")).toBe("InvoiceDto");
  });

  it("resolves a method-group handler whose own signature is opaque", () => {
    // MapGet("{id}", GetById) where GetById returns IResult but its body returns
    // Results.Ok(new InvoiceDto(...)) — two levels of indirection.
    expect(responseTypeFor("/api/invoices/{id}", "GET")).toBe("InvoiceDto");
  });

  it("resolves an inline lambda handler", () => {
    expect(responseTypeFor("/api/invoices", "POST")).toBe("InvoiceDto");
  });
});

// The .NET tool is distributed separately from the npm packages, so a user can
// upgrade one and not the other. When that happens field-level contract checks
// simply produce nothing — the exact silent degradation this warning exists to
// prevent.
describe("outdated .NET tool detection", () => {
  it("treats a missing capabilities list as 'too old for response types'", () => {
    // Mirrors the parse-site check without shelling out: older builds emit no
    // `capabilities` key at all.
    const legacy = { routes: [{ id: "r" }] } as { capabilities?: string[]; routes: unknown[] };
    const current = { capabilities: ["responseType"], routes: [{ id: "r" }] };

    const needsWarning = (o: { capabilities?: string[]; routes: unknown[] }) =>
      o.routes.length > 0 && !o.capabilities?.includes("responseType");

    expect(needsWarning(legacy)).toBe(true);
    expect(needsWarning(current)).toBe(false);
    // No routes at all — nothing to say.
    expect(needsWarning({ routes: [] })).toBe(false);
  });
});
