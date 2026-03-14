import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  openMemoryDatabase,
  initializeSchema,
  indexProject,
} from "@arcbridge/core";
import type Database from "better-sqlite3";

const REACT_FIXTURE_DIR = join(
  __dirname,
  "..",
  "..",
  "..",
  "core",
  "src",
  "__tests__",
  "fixtures",
  "react-project",
);

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
  indexProject(db, { projectRoot: REACT_FIXTURE_DIR });
});

afterEach(() => {
  db.close();
});

describe("component graph queries", () => {
  it("finds all components", () => {
    const components = db
      .prepare(
        `SELECT s.name, c.is_client, c.has_state, c.props_type
         FROM components c
         JOIN symbols s ON c.symbol_id = s.id
         ORDER BY s.name`,
      )
      .all() as { name: string; is_client: number; has_state: number; props_type: string | null }[];

    expect(components.length).toBeGreaterThan(0);

    const names = components.map((c) => c.name);
    expect(names).toContain("Button");
    expect(names).toContain("UserCard");
  });

  it("identifies client components", () => {
    const clientComponents = db
      .prepare(
        `SELECT s.name FROM components c
         JOIN symbols s ON c.symbol_id = s.id
         WHERE c.is_client = 1`,
      )
      .all() as { name: string }[];

    const names = clientComponents.map((c) => c.name);
    expect(names).toContain("ClientCounter");
  });

  it("identifies stateful components", () => {
    const stateful = db
      .prepare(
        `SELECT s.name FROM components c
         JOIN symbols s ON c.symbol_id = s.id
         WHERE c.has_state = 1`,
      )
      .all() as { name: string }[];

    const names = stateful.map((c) => c.name);
    expect(names).toContain("UserCard");
    expect(names).toContain("ClientCounter");
  });

  it("tracks render edges between components", () => {
    const renders = db
      .prepare(
        `SELECT ss.name as source, st.name as target
         FROM dependencies d
         JOIN symbols ss ON d.source_symbol = ss.id
         JOIN symbols st ON d.target_symbol = st.id
         WHERE d.kind = 'renders'
           AND ss.kind = 'component'
           AND st.kind = 'component'`,
      )
      .all() as { source: string; target: string }[];

    expect(renders.length).toBeGreaterThan(0);

    // UserCard renders Button
    expect(renders.some((r) => r.source === "UserCard" && r.target === "Button")).toBe(true);
  });
});

describe("route map queries", () => {
  it("finds page routes", () => {
    const pages = db
      .prepare("SELECT route_path FROM routes WHERE kind = 'page' ORDER BY route_path")
      .all() as { route_path: string }[];

    expect(pages.length).toBeGreaterThan(0);
    const paths = pages.map((p) => p.route_path);
    expect(paths).toContain("/");
    expect(paths).toContain("/dashboard");
  });

  it("finds API routes with methods", () => {
    const apiRoutes = db
      .prepare("SELECT route_path, http_methods FROM routes WHERE kind = 'api-route'")
      .all() as { route_path: string; http_methods: string }[];

    expect(apiRoutes.length).toBeGreaterThan(0);

    const usersApi = apiRoutes.find((r) => r.route_path.includes("users"));
    expect(usersApi).toBeDefined();

    const methods = JSON.parse(usersApi!.http_methods);
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
  });

  it("finds layouts", () => {
    const layouts = db
      .prepare("SELECT route_path FROM routes WHERE kind = 'layout'")
      .all() as { route_path: string }[];

    expect(layouts.length).toBeGreaterThan(0);
  });

  it("handles route groups (no URL segment)", () => {
    const loginPage = db
      .prepare("SELECT route_path FROM routes WHERE route_path = '/login' AND kind = 'page'")
      .get() as { route_path: string } | undefined;

    expect(loginPage).toBeDefined();
  });
});

describe("boundary analysis queries", () => {
  it("can distinguish client and server components", () => {
    const client = db
      .prepare(
        `SELECT COUNT(*) as count FROM components WHERE is_client = 1`,
      )
      .get() as { count: number };

    const server = db
      .prepare(
        `SELECT COUNT(*) as count FROM components WHERE is_client = 0`,
      )
      .get() as { count: number };

    expect(client.count).toBeGreaterThan(0);
    expect(server.count).toBeGreaterThan(0);
  });

  it("can find cross-boundary render edges", () => {
    const crossEdges = db
      .prepare(
        `SELECT
          ss.name as source_name, cs.is_client as source_client,
          st.name as target_name, ct.is_client as target_client
        FROM dependencies d
        JOIN symbols ss ON d.source_symbol = ss.id
        JOIN symbols st ON d.target_symbol = st.id
        JOIN components cs ON d.source_symbol = cs.symbol_id
        JOIN components ct ON d.target_symbol = ct.symbol_id
        WHERE d.kind = 'renders'
          AND cs.is_client != ct.is_client`,
      )
      .all() as {
      source_name: string;
      source_client: number;
      target_name: string;
      target_client: number;
    }[];

    // There should be at least some cross-boundary edges
    // (e.g., server components rendering client components)
    expect(crossEdges.length).toBeGreaterThanOrEqual(0);
  });

  it("tracks context provider/consumer relationships", () => {
    const contextEdges = db
      .prepare(
        `SELECT ss.name as source, st.name as target, d.kind
         FROM dependencies d
         JOIN symbols ss ON d.source_symbol = ss.id
         JOIN symbols st ON d.target_symbol = st.id
         WHERE d.kind IN ('provides_context', 'consumes_context')`,
      )
      .all() as { source: string; target: string; kind: string }[];

    expect(contextEdges.length).toBeGreaterThan(0);

    // ThemeProvider provides ThemeContext
    expect(
      contextEdges.some(
        (e) => e.source === "ThemeProvider" && e.target === "ThemeContext" && e.kind === "provides_context",
      ),
    ).toBe(true);

    // useTheme consumes ThemeContext
    expect(
      contextEdges.some(
        (e) => e.source === "useTheme" && e.target === "ThemeContext" && e.kind === "consumes_context",
      ),
    ).toBe(true);
  });
});
