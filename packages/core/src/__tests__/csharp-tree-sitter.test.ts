import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, join } from "node:path";
import { readFileSync } from "node:fs";
import type { Database } from "../db/connection.js";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { ensureCSharpParser, parseCSharp } from "../indexer/csharp/parser.js";
import { extractCSharpSymbols } from "../indexer/csharp/symbol-extractor.js";
import {
  extractCSharpDependencies,
  buildCSharpSymbolLookup,
} from "../indexer/csharp/dependency-extractor.js";
import { extractCSharpRoutes } from "../indexer/csharp/route-analyzer.js";
import { indexCSharpTreeSitter } from "../indexer/csharp/indexer.js";
import { hashContent } from "../indexer/content-hash.js";

const FIXTURE_DIR = resolve(__dirname, "fixtures/dotnet-project");

describe("C# tree-sitter indexer", () => {
  beforeAll(async () => {
    await ensureCSharpParser();
  });

  describe("parser", () => {
    it("parses a simple C# file", async () => {
      const tree = parseCSharp("namespace Foo { public class Bar { } }");
      expect(tree.rootNode.type).toBe("compilation_unit");
    });

    it("parses file-scoped namespaces", async () => {
      const tree = parseCSharp("namespace Foo;\npublic class Bar { }");
      expect(tree.rootNode.type).toBe("compilation_unit");
    });
  });

  describe("symbol extraction", () => {
    it("extracts classes from fixture", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Models/Order.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "Models/Order.cs", content);

      const classes = symbols.filter((s) => s.kind === "class");
      expect(classes.map((c) => c.name)).toContain("Order");
      expect(
        classes.find((c) => c.name === "Order")?.qualifiedName,
      ).toBe("TestApi.Models.Order");
    });

    it("extracts enums", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Models/Order.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "Models/Order.cs", content);

      const enums = symbols.filter((s) => s.kind === "enum");
      expect(enums.map((e) => e.name)).toContain("OrderStatus");
    });

    it("extracts interfaces", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Services/IOrderService.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(
        tree,
        "Services/IOrderService.cs",
        content,
      );

      const ifaces = symbols.filter((s) => s.kind === "interface");
      expect(ifaces.map((i) => i.name)).toContain("IOrderService");
    });

    it("extracts methods as functions", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Controllers/OrdersController.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(
        tree,
        "Controllers/OrdersController.cs",
        content,
      );

      const functions = symbols.filter((s) => s.kind === "function");
      const names = functions.map((f) => f.name);
      expect(names).toContain("GetAll");
      expect(names).toContain("GetById");
      expect(names).toContain("Create");
    });

    it("detects async methods", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Controllers/OrdersController.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(
        tree,
        "Controllers/OrdersController.cs",
        content,
      );

      const getAll = symbols.find(
        (s) => s.name === "GetAll" && s.kind === "function",
      );
      expect(getAll?.isAsync).toBe(true);
    });

    it("extracts properties as variables", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Models/Order.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "Models/Order.cs", content);

      const props = symbols.filter((s) => s.kind === "variable");
      const names = props.map((p) => p.name);
      expect(names).toContain("Id");
      expect(names).toContain("CustomerName");
      expect(names).toContain("Total");
      expect(names).toContain("Status");
    });

    it("extracts constructors", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Controllers/OrdersController.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(
        tree,
        "Controllers/OrdersController.cs",
        content,
      );

      const ctors = symbols.filter((s) => s.name === ".ctor");
      expect(ctors.length).toBeGreaterThan(0);
      expect(ctors[0].kind).toBe("function");
    });

    it("extracts record declarations as classes", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Controllers/OrdersController.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(
        tree,
        "Controllers/OrdersController.cs",
        content,
      );

      const record = symbols.find((s) => s.name === "CreateOrderRequest");
      expect(record).toBeDefined();
      expect(record!.kind).toBe("class");
    });

    it("extracts doc comments", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Models/Order.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "Models/Order.cs", content);

      const order = symbols.find(
        (s) => s.name === "Order" && s.kind === "class",
      );
      expect(order?.docComment).toContain("customer order");
    });

    it("marks public types as exported", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Models/Order.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "Models/Order.cs", content);

      const order = symbols.find(
        (s) => s.name === "Order" && s.kind === "class",
      );
      expect(order?.isExported).toBe(true);
    });

    it("generates correct symbol ID format", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Models/Order.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "Models/Order.cs", content);

      const order = symbols.find(
        (s) => s.name === "Order" && s.kind === "class",
      );
      expect(order!.id).toBe(
        "Models/Order.cs::TestApi.Models.Order#class",
      );
    });

    it("extracts method signatures", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Services/IOrderService.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(
        tree,
        "Services/IOrderService.cs",
        content,
      );

      const getById = symbols.find((s) => s.name === "GetByIdAsync");
      expect(getById?.signature).toContain("int id");
    });

    it("uses 1-indexed line numbers", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Models/Order.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "Models/Order.cs", content);

      const order = symbols.find(
        (s) => s.name === "Order" && s.kind === "class",
      );
      expect(order!.startLine).toBeGreaterThanOrEqual(1);
    });
  });

  describe("dependency extraction", () => {
    it("detects implements relationship", async () => {
      // Index all files to build full symbol table
      const files = [
        "Services/IOrderService.cs",
        "Services/OrderService.cs",
        "Models/Order.cs",
        "Controllers/OrdersController.cs",
      ];

      const allSymbols = files.flatMap((f) => {
        const content = readFileSync(join(FIXTURE_DIR, f), "utf-8");
        const tree = parseCSharp(content);
        return extractCSharpSymbols(tree, f, content);
      });

      const lookup = buildCSharpSymbolLookup(allSymbols);

      // Extract deps from OrderService.cs
      const osContent = readFileSync(
        join(FIXTURE_DIR, "Services/OrderService.cs"),
        "utf-8",
      );
      const osTree = parseCSharp(osContent);
      const deps = extractCSharpDependencies(
        osTree,
        "Services/OrderService.cs",
        allSymbols,
        lookup,
      );

      const implementsDep = deps.find(
        (d) =>
          d.kind === "implements" &&
          d.sourceSymbolId.includes("OrderService#class") &&
          d.targetSymbolId.includes("IOrderService#interface"),
      );
      expect(implementsDep).toBeDefined();
    });

    it("detects extends relationship", async () => {
      // We need a "ControllerBase" in our index for extends to work
      // Since it's a framework type, it won't be found. Let's test with known types.
      const content = `
namespace Test;
public class Animal { }
public class Dog : Animal { }
`;
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "test.cs", content);
      const lookup = buildCSharpSymbolLookup(symbols);
      const deps = extractCSharpDependencies(tree, "test.cs", symbols, lookup);

      const extendsDep = deps.find(
        (d) =>
          d.kind === "extends" &&
          d.sourceSymbolId.includes("Dog#class") &&
          d.targetSymbolId.includes("Animal#class"),
      );
      expect(extendsDep).toBeDefined();
    });

    it("detects calls relationship", async () => {
      const files = [
        "Services/IOrderService.cs",
        "Services/OrderService.cs",
        "Models/Order.cs",
        "Controllers/OrdersController.cs",
      ];

      const allSymbols = files.flatMap((f) => {
        const content = readFileSync(join(FIXTURE_DIR, f), "utf-8");
        const tree = parseCSharp(content);
        return extractCSharpSymbols(tree, f, content);
      });

      const lookup = buildCSharpSymbolLookup(allSymbols);

      const ctrlContent = readFileSync(
        join(FIXTURE_DIR, "Controllers/OrdersController.cs"),
        "utf-8",
      );
      const ctrlTree = parseCSharp(ctrlContent);
      const deps = extractCSharpDependencies(
        ctrlTree,
        "Controllers/OrdersController.cs",
        allSymbols,
        lookup,
      );

      // Controller.GetAll should call GetAllAsync
      const callsDep = deps.find(
        (d) =>
          d.kind === "calls" &&
          d.sourceSymbolId.includes("GetAll#function") &&
          d.targetSymbolId.includes("GetAllAsync"),
      );
      expect(callsDep).toBeDefined();
    });
  });

  describe("route analysis", () => {
    it("extracts controller-based routes", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Controllers/OrdersController.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const routes = extractCSharpRoutes(
        tree,
        "Controllers/OrdersController.cs",
      );

      expect(routes.length).toBeGreaterThanOrEqual(3);

      // GET /api/orders
      const getAll = routes.find(
        (r) =>
          r.routePath === "/api/orders" && r.httpMethods.includes("GET"),
      );
      expect(getAll).toBeDefined();
      expect(getAll!.hasAuth).toBe(false);

      // POST /api/orders (with [Authorize])
      const create = routes.find(
        (r) =>
          r.routePath === "/api/orders" && r.httpMethods.includes("POST"),
      );
      expect(create).toBeDefined();
      expect(create!.hasAuth).toBe(true);

      // GET /api/orders/{id}
      const getById = routes.find(
        (r) =>
          r.routePath === "/api/orders/{id}" &&
          r.httpMethods.includes("GET"),
      );
      expect(getById).toBeDefined();
    });

    it("extracts minimal API routes", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Endpoints/ProductEndpoints.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const routes = extractCSharpRoutes(
        tree,
        "Endpoints/ProductEndpoints.cs",
      );

      expect(routes.length).toBeGreaterThanOrEqual(4);

      // GET /api/products
      const getAll = routes.find(
        (r) =>
          r.routePath === "/api/products" && r.httpMethods.includes("GET"),
      );
      expect(getAll).toBeDefined();
      expect(getAll!.hasAuth).toBe(false);

      // POST /api/products (with RequireAuthorization)
      const create = routes.find(
        (r) =>
          r.routePath === "/api/products" &&
          r.httpMethods.includes("POST"),
      );
      expect(create).toBeDefined();
      expect(create!.hasAuth).toBe(true);

      // DELETE /api/products/{id} (with RequireAuthorization("AdminOnly"))
      const del = routes.find(
        (r) =>
          r.routePath.includes("/api/products") &&
          r.httpMethods.includes("DELETE"),
      );
      expect(del).toBeDefined();
      expect(del!.hasAuth).toBe(true);
    });
  });

  describe("content hash compatibility", () => {
    it("produces hashes identical to TypeScript hasher", async () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "Models/Order.cs"),
        "utf-8",
      );
      const tree = parseCSharp(content);
      const symbols = extractCSharpSymbols(tree, "Models/Order.cs", content);

      const tsHash = hashContent(content);
      expect(symbols[0].contentHash).toBe(tsHash);
    });
  });

  describe("full integration", () => {
    let db: Database;

    beforeAll(async () => {
      db = openMemoryDatabase();
      initializeSchema(db);
    });

    afterAll(() => {
      db?.close();
    });

    it("indexes the .NET fixture project via tree-sitter", async () => {
      const result = await indexCSharpTreeSitter(db, {
        projectRoot: FIXTURE_DIR,
      });

      expect(result.filesProcessed).toBeGreaterThan(0);
      expect(result.symbolsIndexed).toBeGreaterThan(0);
      expect(result.dependenciesIndexed).toBeGreaterThan(0);
      expect(result.routesAnalyzed).toBeGreaterThan(0);
    });

    it("stores symbols with language=csharp", async () => {
      const symbols = db
        .prepare("SELECT * FROM symbols WHERE language = 'csharp'")
        .all() as Array<{
        id: string;
        name: string;
        kind: string;
        language: string;
      }>;

      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols.every((s) => s.language === "csharp")).toBe(true);
    });

    it("stores classes correctly", async () => {
      const classes = db
        .prepare(
          "SELECT * FROM symbols WHERE kind = 'class' AND language = 'csharp'",
        )
        .all() as Array<{ name: string }>;

      const names = classes.map((c) => c.name);
      expect(names).toContain("OrdersController");
      expect(names).toContain("Order");
      expect(names).toContain("OrderService");
      expect(names).toContain("CreateOrderRequest");
    });

    it("stores interfaces correctly", async () => {
      const interfaces = db
        .prepare(
          "SELECT * FROM symbols WHERE kind = 'interface' AND language = 'csharp'",
        )
        .all() as Array<{ name: string }>;

      expect(interfaces.map((i) => i.name)).toContain("IOrderService");
    });

    it("stores enums correctly", async () => {
      const enums = db
        .prepare(
          "SELECT * FROM symbols WHERE kind = 'enum' AND language = 'csharp'",
        )
        .all() as Array<{ name: string }>;

      expect(enums.map((e) => e.name)).toContain("OrderStatus");
    });

    it("stores methods correctly", async () => {
      const functions = db
        .prepare(
          "SELECT * FROM symbols WHERE kind = 'function' AND language = 'csharp'",
        )
        .all() as Array<{
        name: string;
        is_async: number;
        qualified_name: string;
      }>;

      const names = functions.map((f) => f.name);
      expect(names).toContain("GetAll");
      expect(names).toContain("GetById");
      expect(names).toContain("Create");

      const getAll = functions.find((f) =>
        f.qualified_name.includes("OrdersController.GetAll"),
      );
      expect(getAll?.is_async).toBe(1);
    });

    it("stores properties correctly", async () => {
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

    it("stores dependencies", async () => {
      const deps = db
        .prepare("SELECT * FROM dependencies")
        .all() as Array<{
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
    });

    it("stores controller routes", async () => {
      const routes = db
        .prepare("SELECT * FROM routes")
        .all() as Array<{
        id: string;
        route_path: string;
        http_methods: string;
        has_auth: number;
      }>;

      // GET /api/orders
      const getAll = routes.find(
        (r) =>
          r.route_path === "/api/orders" &&
          r.http_methods.includes("GET"),
      );
      expect(getAll).toBeDefined();

      // POST /api/orders (with [Authorize])
      const create = routes.find(
        (r) =>
          r.route_path === "/api/orders" &&
          r.http_methods.includes("POST"),
      );
      expect(create).toBeDefined();
      expect(create!.has_auth).toBe(1);
    });

    it("stores minimal API routes", async () => {
      const routes = db
        .prepare("SELECT * FROM routes")
        .all() as Array<{
        id: string;
        route_path: string;
        http_methods: string;
        has_auth: number;
      }>;

      // GET /api/products
      const getProducts = routes.find(
        (r) =>
          r.route_path === "/api/products" &&
          r.http_methods.includes("GET"),
      );
      expect(getProducts).toBeDefined();

      // POST /api/products (with RequireAuthorization)
      const createProduct = routes.find(
        (r) =>
          r.route_path === "/api/products" &&
          r.http_methods.includes("POST"),
      );
      expect(createProduct).toBeDefined();
      expect(createProduct!.has_auth).toBe(1);
    });

    it("is incremental — skips unchanged files on second run", async () => {
      const result = await indexCSharpTreeSitter(db, {
        projectRoot: FIXTURE_DIR,
      });

      expect(result.filesSkipped).toBeGreaterThan(0);
      // Files with no symbols (e.g., Program.cs with top-level statements)
      // will be re-processed since hashes are stored per-symbol
      expect(result.filesSkipped).toBeGreaterThanOrEqual(result.filesProcessed);
    });

    it("generates stable symbol IDs", async () => {
      const orderClass = db
        .prepare(
          "SELECT id FROM symbols WHERE name = 'Order' AND kind = 'class'",
        )
        .get() as { id: string } | undefined;

      expect(orderClass).toBeDefined();
      expect(orderClass!.id).toMatch(/^Models\/Order\.cs::/);
      expect(orderClass!.id).toMatch(/#class$/);
    });
  });
});
