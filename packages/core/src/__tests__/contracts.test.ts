// Endpoint contracts (0.12.0 stage 1): fetch/axios call-site extraction, the
// contract_violation drift kind, and http-endpoint contract population.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { openMemoryDatabase, type Database } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { extractApiCalls } from "../indexer/api-call-analyzer.js";
import { indexConfiguredProject } from "../indexer/index.js";
import { detectDrift, routeMatchesUrl, writeDriftLog } from "../drift/detector.js";

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile("src/client.ts", code, ts.ScriptTarget.ES2022, true);
}

describe("extractApiCalls", () => {
  it("detects fetch with default GET and explicit method", () => {
    const calls = extractApiCalls(
      parse(`
        await fetch("/api/users");
        await fetch("/api/users", { method: "POST", body: "{}" });
      `),
      "src/client.ts",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ url: "/api/users", method: "GET" });
    expect(calls[1]).toMatchObject({ url: "/api/users", method: "POST" });
  });

  it("turns template substitutions into :param segments", () => {
    const calls = extractApiCalls(
      parse("const id = 1; await fetch(`/api/users/${id}/posts`);"),
      "src/client.ts",
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/users/:param/posts");
  });

  it("skips absolute URLs and non-literal URLs", () => {
    const calls = extractApiCalls(
      parse(`
        await fetch("https://external.example.com/api/users");
        const u = "/api/users"; await fetch(u);
      `),
      "src/client.ts",
    );
    expect(calls).toHaveLength(0);
  });

  it("ignores .fetch on non-global receivers", () => {
    const calls = extractApiCalls(
      parse(`
        window.fetch("/api/a");
        globalThis.fetch("/api/b");
        someClient.fetch("/api/c");
      `),
      "src/client.ts",
    );
    expect(calls.map((c) => c.url).sort()).toEqual(["/api/a", "/api/b"]);
  });

  it("detects axios verb methods and direct axios calls", () => {
    const calls = extractApiCalls(
      parse(`
        import axios from "axios";
        await axios.post("/api/users", {});
        await axios("/api/items", { method: "PUT" });
      `),
      "src/client.ts",
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ url: "/api/users", method: "POST" });
    expect(calls[1]).toMatchObject({ url: "/api/items", method: "PUT" });
  });

  it("records line numbers", () => {
    const calls = extractApiCalls(parse(`\n\nawait fetch("/api/x");`), "src/client.ts");
    expect(calls[0].line).toBe(3);
  });
});

describe("routeMatchesUrl", () => {
  it("matches concrete segments case-insensitively", () => {
    expect(routeMatchesUrl("/api/Users", "/api/users")).toBe(true);
    expect(routeMatchesUrl("/api/users", "/api/orders")).toBe(false);
  });

  it("matches parameter placeholders in any analyzer style", () => {
    for (const route of ["/api/users/:id", "/api/users/{id}", "/api/users/<id>", "/api/users/[id]"]) {
      expect(routeMatchesUrl(route, "/api/users/42")).toBe(true);
    }
  });

  it("matches a :param URL segment (from template substitution) against a concrete route", () => {
    expect(routeMatchesUrl("/api/users/{id}", "/api/users/:param")).toBe(true);
  });

  it("requires equal segment counts for non-catch-all routes", () => {
    expect(routeMatchesUrl("/api/users", "/api/users/42")).toBe(false);
    expect(routeMatchesUrl("/api/users/:id", "/api/users")).toBe(false);
  });

  it("catch-all segments swallow the remaining URL", () => {
    for (const route of ["/api/*path", "/api/[...slug]", "/api/{**slug}"]) {
      expect(routeMatchesUrl(route, "/api/a/b/c")).toBe(true);
      expect(routeMatchesUrl(route, "/api")).toBe(true); // optional catch-all bias
    }
    expect(routeMatchesUrl("/api/*path", "/other/a")).toBe(false);
  });
});

describe("contract_violation drift + contracts population (end to end)", () => {
  let db: Database;
  let repoRoot: string;

  beforeEach(() => {
    db = openMemoryDatabase();
    initializeSchema(db);
    repoRoot = mkdtempSync(join(tmpdir(), "arcbridge-contracts-"));

    // Frontend: fetch calls — one good, one wrong URL, one wrong method
    mkdirSync(join(repoRoot, "web", "src"), { recursive: true });
    writeFileSync(
      join(repoRoot, "web", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true },
        include: ["src/**/*"],
      }),
      "utf-8",
    );
    writeFileSync(join(repoRoot, "web", "package.json"), JSON.stringify({ name: "web" }), "utf-8");
    writeFileSync(
      join(repoRoot, "web", "src", "client.ts"),
      [
        'export async function load() { return fetch("/api/users"); }',
        'export async function broken() { return fetch("/api/userz"); }',
        'export async function wrongMethod() { return fetch("/api/users", { method: "DELETE" }); }',
      ].join("\n"),
      "utf-8",
    );

    // Backend: a C# controller exposing GET+POST /api/users
    mkdirSync(join(repoRoot, "api", "Controllers"), { recursive: true });
    writeFileSync(
      join(repoRoot, "api", "Controllers", "UsersController.cs"),
      `using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers
{
    [ApiController]
    [Route("api/users")]
    public class UsersController : ControllerBase
    {
        [HttpGet]
        public string GetUsers() => "[]";

        [HttpPost]
        public string CreateUser() => "{}";
    }
}
`,
      "utf-8",
    );

    // Force the tree-sitter backend so the test doesn't depend on a dotnet SDK
    mkdirSync(join(repoRoot, ".arcbridge"), { recursive: true });
    writeFileSync(
      join(repoRoot, ".arcbridge", "config.yaml"),
      "indexing:\n  csharp_indexer: tree-sitter\n",
      "utf-8",
    );
  });

  afterEach(() => {
    db.close();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  async function indexBoth(): Promise<void> {
    await indexConfiguredProject(db, repoRoot, {
      services: [
        { name: "frontend", path: "web", type: "nextjs" },
        { name: "api", path: "api", type: "dotnet" },
      ],
    });
  }

  it("flags unknown endpoints and disallowed methods, not valid calls", async () => {
    await indexBoth();

    const violations = detectDrift(db).filter((e) => e.kind === "contract_violation");
    expect(violations).toHaveLength(2);

    const unknown = violations.find((v) => v.description.includes("/api/userz"));
    expect(unknown).toBeDefined();
    expect(unknown!.description).toContain("no indexed service exposes");
    expect(unknown!.affectedFile).toBe("web/src/client.ts");

    const method = violations.find((v) => v.description.includes("DELETE"));
    expect(method).toBeDefined();
    expect(method!.description).toContain("only allows GET, POST");

    // The valid GET /api/users call produced no violation
    expect(violations.some((v) => v.description.includes("GET /api/users"))).toBe(false);
  });

  it("writes contract_violation entries to the drift_log (CHECK allows the kind)", async () => {
    await indexBoth();
    const entries = detectDrift(db);
    writeDriftLog(db, entries);
    const logged = db
      .prepare("SELECT COUNT(*) as count FROM drift_log WHERE kind = 'contract_violation'")
      .get() as { count: number };
    expect(logged.count).toBe(2);
  });

  it("populates http-endpoint contracts with consumers", async () => {
    await indexBoth();

    const rows = db
      .prepare("SELECT id, source_path, producer, consumers FROM contracts WHERE kind = 'http-endpoint' ORDER BY id")
      .all() as { id: string; source_path: string; producer: string; consumers: string }[];

    // GET and POST /api/users are separate routes, both produced by `api`
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row.producer).toBe("api");
      expect(row.source_path).toBe("/api/users");
    }

    // Consumers are method-aware: the frontend GETs /api/users (and attempts a
    // DELETE, which matches nothing) but never POSTs — so it consumes the GET
    // route only, not the POST route.
    const getRoute = rows.find((r) => r.id.includes("GET"));
    const postRoute = rows.find((r) => r.id.includes("POST"));
    expect(getRoute).toBeDefined();
    expect(postRoute).toBeDefined();
    expect(JSON.parse(getRoute!.consumers)).toEqual(["frontend"]);
    expect(JSON.parse(postRoute!.consumers)).toEqual([]);
  });

  it("treats a matching route with empty http_methods as allowing any method", async () => {
    await indexBoth();
    // Simulate a Go-style ANY route on the same path with no declared methods
    db.prepare(
      "INSERT INTO routes (id, route_path, kind, http_methods, has_auth, service) VALUES ('api::any', '/api/users', 'api-route', '[]', 0, 'api')",
    ).run();

    const violations = detectDrift(db).filter((e) => e.kind === "contract_violation");
    // The DELETE call now matches an any-method route → no method violation.
    // Only the unknown /api/userz endpoint remains.
    expect(violations).toHaveLength(1);
    expect(violations[0].description).toContain("/api/userz");
  });

  it("prunes rows for services removed from config", async () => {
    await indexBoth();
    expect(
      (db.prepare("SELECT COUNT(*) c FROM api_calls WHERE service = 'frontend'").get() as { c: number }).c,
    ).toBeGreaterThan(0);

    // Re-index with the frontend service removed
    await indexConfiguredProject(db, repoRoot, {
      services: [{ name: "api", path: "api", type: "dotnet" }],
    });

    for (const table of ["symbols", "routes", "api_calls"]) {
      const row = db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE service = 'frontend'`).get() as { c: number };
      expect(row.c).toBe(0);
    }
    // API service rows survive
    expect(
      (db.prepare("SELECT COUNT(*) c FROM routes WHERE service = 'api'").get() as { c: number }).c,
    ).toBeGreaterThan(0);
  });

  it("prunes without FK errors when a kept dependency/component references a pruned symbol", async () => {
    await indexBoth();

    // Fabricate a kept-service symbol depending on a pruned-service symbol,
    // plus a component row on a pruned symbol — both reference symbols(id)
    // under PRAGMA foreign_keys = ON.
    const frontendSym = db
      .prepare("SELECT id FROM symbols WHERE service = 'frontend' LIMIT 1")
      .get() as { id: string } | undefined;
    const apiSym = db
      .prepare("SELECT id FROM symbols WHERE service = 'api' LIMIT 1")
      .get() as { id: string } | undefined;
    expect(frontendSym && apiSym).toBeTruthy();

    // api (kept) → frontend (pruned): a target_symbol edge into the pruned set
    db.prepare(
      "INSERT INTO dependencies (source_symbol, target_symbol, kind) VALUES (?, ?, 'calls')",
    ).run(apiSym!.id, frontendSym!.id);
    db.prepare(
      "INSERT OR REPLACE INTO components (symbol_id, is_client) VALUES (?, 1)",
    ).run(frontendSym!.id);

    // Removing the frontend service must not throw an FK constraint error
    await expect(
      indexConfiguredProject(db, repoRoot, {
        services: [{ name: "api", path: "api", type: "dotnet" }],
      }),
    ).resolves.toBeDefined();

    expect(
      (db.prepare("SELECT COUNT(*) c FROM symbols WHERE service = 'frontend'").get() as { c: number }).c,
    ).toBe(0);
    expect(
      (db.prepare("SELECT COUNT(*) c FROM components WHERE symbol_id = ?").get(frontendSym!.id) as { c: number }).c,
    ).toBe(0);
  });

  it("prunes stale rows for a service still in config but skipped this run", async () => {
    await indexBoth();
    expect(
      (db.prepare("SELECT COUNT(*) c FROM symbols WHERE service = 'frontend'").get() as { c: number }).c,
    ).toBeGreaterThan(0);

    // Break the frontend service (remove its tsconfig) so it's skipped, but
    // keep it in config. Its previously-indexed rows must not linger.
    rmSync(join(repoRoot, "web", "tsconfig.json"), { force: true });
    const { services } = await indexConfiguredProject(db, repoRoot, {
      services: [
        { name: "frontend", path: "web", type: "nextjs" },
        { name: "api", path: "api", type: "dotnet" },
      ],
    });

    expect(services.find((s) => s.service === "frontend")?.skippedReason).toBeDefined();
    expect(
      (db.prepare("SELECT COUNT(*) c FROM symbols WHERE service = 'frontend'").get() as { c: number }).c,
    ).toBe(0);
    // api (successfully indexed) survives
    expect(
      (db.prepare("SELECT COUNT(*) c FROM routes WHERE service = 'api'").get() as { c: number }).c,
    ).toBeGreaterThan(0);
  });

  it("is silent for projects with no api-routes (frontend-only)", async () => {
    // Remove the backend service — calls now target an externally-deployed API
    rmSync(join(repoRoot, "api"), { recursive: true, force: true });
    await indexConfiguredProject(db, repoRoot, {
      services: [{ name: "frontend", path: "web", type: "nextjs" }],
    });

    const violations = detectDrift(db).filter((e) => e.kind === "contract_violation");
    expect(violations).toHaveLength(0);
  });
});
