import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { indexProject } from "../indexer/index.js";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import type Database from "better-sqlite3";

const FIXTURE_DIR = join(__dirname, "fixtures", "react-project");

let db: Database.Database;

beforeEach(async () => {
  db = openMemoryDatabase();
  initializeSchema(db);
});

afterEach(() => {
  db.close();
});

describe("React symbol classification", () => {
  it("classifies function components as 'component'", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const button = db
      .prepare("SELECT * FROM symbols WHERE name = 'Button' AND kind = 'component'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(button).toBeDefined();
    expect(button!.kind).toBe("component");
    expect(button!.is_exported).toBe(1);
  });

  it("classifies React.memo wrapped components as 'component'", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const memoized = db
      .prepare("SELECT * FROM symbols WHERE name = 'MemoizedList' AND kind = 'component'")
      .get() as { kind: string } | undefined;

    expect(memoized).toBeDefined();
    expect(memoized!.kind).toBe("component");
  });

  it("classifies React.forwardRef wrapped components as 'component'", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const forwarded = db
      .prepare("SELECT * FROM symbols WHERE name = 'ForwardedInput' AND kind = 'component'")
      .get() as { kind: string } | undefined;

    expect(forwarded).toBeDefined();
    expect(forwarded!.kind).toBe("component");
  });

  it("classifies custom hooks as 'hook'", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const useAuth = db
      .prepare("SELECT * FROM symbols WHERE name = 'useAuth' AND kind = 'hook'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(useAuth).toBeDefined();
    expect(useAuth!.kind).toBe("hook");

    const useDebounce = db
      .prepare("SELECT * FROM symbols WHERE name = 'useDebounce' AND kind = 'hook'")
      .get() as { kind: string } | undefined;

    expect(useDebounce).toBeDefined();
    expect(useDebounce!.kind).toBe("hook");
  });

  it("classifies useTheme as 'hook'", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const useTheme = db
      .prepare("SELECT * FROM symbols WHERE name = 'useTheme' AND kind = 'hook'")
      .get() as { kind: string } | undefined;

    expect(useTheme).toBeDefined();
  });

  it("classifies createContext as 'context'", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const ctx = db
      .prepare("SELECT * FROM symbols WHERE name = 'ThemeContext' AND kind = 'context'")
      .get() as { kind: string; is_exported: number } | undefined;

    expect(ctx).toBeDefined();
    expect(ctx!.kind).toBe("context");
    expect(ctx!.is_exported).toBe(1);
  });

  it("preserves interface/type symbols alongside components", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const buttonProps = db
      .prepare("SELECT * FROM symbols WHERE name = 'ButtonProps' AND kind = 'interface'")
      .get() as { kind: string } | undefined;

    expect(buttonProps).toBeDefined();
  });

  it("classifies App Router page components as 'component'", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const homePage = db
      .prepare("SELECT * FROM symbols WHERE name = 'HomePage' AND kind = 'component'")
      .get() as { kind: string } | undefined;

    expect(homePage).toBeDefined();
  });
});

describe("component analysis", () => {
  it("populates the components table", async () => {
    const result = await indexProject(db, { projectRoot: FIXTURE_DIR });

    expect(result.componentsAnalyzed).toBeGreaterThan(0);

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM components").get() as { count: number }
    ).count;
    expect(count).toBeGreaterThan(0);
  });

  it("detects 'use client' directive", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const clientComponent = db
      .prepare(
        `SELECT c.* FROM components c
         JOIN symbols s ON c.symbol_id = s.id
         WHERE s.name = 'ClientCounter'`,
      )
      .get() as { is_client: number; has_state: number } | undefined;

    expect(clientComponent).toBeDefined();
    expect(clientComponent!.is_client).toBe(1);
    expect(clientComponent!.has_state).toBe(1);
  });

  it("detects useState usage", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const userCard = db
      .prepare(
        `SELECT c.* FROM components c
         JOIN symbols s ON c.symbol_id = s.id
         WHERE s.name = 'UserCard'`,
      )
      .get() as { has_state: number } | undefined;

    expect(userCard).toBeDefined();
    expect(userCard!.has_state).toBe(1);
  });

  it("detects context providers", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const provider = db
      .prepare(
        `SELECT c.* FROM components c
         JOIN symbols s ON c.symbol_id = s.id
         WHERE s.name = 'ThemeProvider'`,
      )
      .get() as { context_providers: string } | undefined;

    expect(provider).toBeDefined();
    const providers = JSON.parse(provider!.context_providers);
    expect(providers).toContain("ThemeContext");
  });

  it("extracts props type", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const button = db
      .prepare(
        `SELECT c.* FROM components c
         JOIN symbols s ON c.symbol_id = s.id
         WHERE s.name = 'Button'`,
      )
      .get() as { props_type: string | null } | undefined;

    expect(button).toBeDefined();
    expect(button!.props_type).toBeTruthy();
  });
});

describe("React dependency extraction", () => {
  it("detects renders dependencies", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const renders = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol
         FROM dependencies d
         WHERE d.kind = 'renders'`,
      )
      .all() as { source_symbol: string; target_symbol: string }[];

    expect(renders.length).toBeGreaterThan(0);

    // UserCard renders Button
    const userCardRendersButton = renders.find(
      (r) => r.source_symbol.includes("UserCard") && r.target_symbol.includes("Button"),
    );
    expect(userCardRendersButton).toBeDefined();
  });

  it("detects provides_context dependencies", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const provides = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol
         FROM dependencies d
         WHERE d.kind = 'provides_context'`,
      )
      .all() as { source_symbol: string; target_symbol: string }[];

    expect(provides.length).toBeGreaterThan(0);

    // ThemeProvider provides ThemeContext
    const providerEdge = provides.find(
      (p) =>
        p.source_symbol.includes("ThemeProvider") &&
        p.target_symbol.includes("ThemeContext"),
    );
    expect(providerEdge).toBeDefined();
  });

  it("detects consumes_context dependencies", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const consumes = db
      .prepare(
        `SELECT d.source_symbol, d.target_symbol
         FROM dependencies d
         WHERE d.kind = 'consumes_context'`,
      )
      .all() as { source_symbol: string; target_symbol: string }[];

    expect(consumes.length).toBeGreaterThan(0);

    // useTheme consumes ThemeContext
    const consumerEdge = consumes.find(
      (c) =>
        c.source_symbol.includes("useTheme") &&
        c.target_symbol.includes("ThemeContext"),
    );
    expect(consumerEdge).toBeDefined();
  });
});

describe("route analysis", () => {
  it("populates the routes table", async () => {
    const result = await indexProject(db, { projectRoot: FIXTURE_DIR });

    expect(result.routesAnalyzed).toBeGreaterThan(0);

    const count = (
      db.prepare("SELECT COUNT(*) as count FROM routes").get() as { count: number }
    ).count;
    expect(count).toBeGreaterThan(0);
  });

  it("detects page routes", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const pages = db
      .prepare("SELECT * FROM routes WHERE kind = 'page'")
      .all() as { route_path: string; kind: string }[];

    expect(pages.length).toBeGreaterThan(0);

    // Root page
    const rootPage = pages.find((p) => p.route_path === "/");
    expect(rootPage).toBeDefined();

    // Dashboard page
    const dashPage = pages.find((p) => p.route_path === "/dashboard");
    expect(dashPage).toBeDefined();
  });

  it("detects layout routes", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const layouts = db
      .prepare("SELECT * FROM routes WHERE kind = 'layout'")
      .all() as { route_path: string }[];

    expect(layouts.length).toBeGreaterThan(0);
  });

  it("detects loading routes", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const loading = db
      .prepare("SELECT * FROM routes WHERE kind = 'loading'")
      .all() as { route_path: string }[];

    expect(loading.length).toBeGreaterThan(0);
  });

  it("detects API routes with HTTP methods", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const apiRoutes = db
      .prepare("SELECT * FROM routes WHERE kind = 'api-route'")
      .all() as { route_path: string; http_methods: string }[];

    expect(apiRoutes.length).toBeGreaterThan(0);

    const usersRoute = apiRoutes.find((r) => r.route_path.includes("users"));
    expect(usersRoute).toBeDefined();

    const methods = JSON.parse(usersRoute!.http_methods);
    expect(methods).toContain("GET");
    expect(methods).toContain("POST");
  });

  it("handles route groups (no URL segment)", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const loginPage = db
      .prepare("SELECT * FROM routes WHERE route_path = '/login'")
      .get() as { route_path: string; kind: string } | undefined;

    expect(loginPage).toBeDefined();
    expect(loginPage!.kind).toBe("page");
  });

  it("tracks parent layouts", async () => {
    await indexProject(db, { projectRoot: FIXTURE_DIR });

    const dashPage = db
      .prepare("SELECT * FROM routes WHERE route_path = '/dashboard' AND kind = 'page'")
      .get() as { parent_layout: string | null } | undefined;

    expect(dashPage).toBeDefined();
    // Should have root layout as parent
    expect(dashPage!.parent_layout).toBeTruthy();
  });
});
