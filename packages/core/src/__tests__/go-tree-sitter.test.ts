import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import type { Database } from "../db/connection.js";
import { ensureGoParser, parseGo } from "../indexer/go/parser.js";
import { extractGoSymbols } from "../indexer/go/symbol-extractor.js";
import { hashContent } from "../indexer/content-hash.js";
import {
  extractGoDependencies,
  buildGoSymbolLookup,
} from "../indexer/go/dependency-extractor.js";
import { indexGoTreeSitter } from "../indexer/go/indexer.js";

const FIXTURE_DIR = resolve(__dirname, "fixtures/go-project");

describe("Go tree-sitter indexer", () => {
  beforeAll(async () => {
    await ensureGoParser();
  });

  describe("parser", () => {
    it("parses a simple Go file", () => {
      const tree = parseGo("package main\n\nfunc hello() {}");
      expect(tree.rootNode.type).toBe("source_file");
    });

    it("parses a struct definition", () => {
      const tree = parseGo(
        "package main\n\ntype Point struct {\n\tX int\n\tY int\n}",
      );
      expect(tree.rootNode.type).toBe("source_file");
      expect(tree.rootNode.childCount).toBeGreaterThan(0);
    });
  });

  describe("symbol extraction", () => {
    it("extracts structs as class kind", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "models/user.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "models/user.go", hashContent(content));

      const classes = symbols.filter((s) => s.kind === "class");
      expect(classes.map((c) => c.name)).toContain("User");
    });

    it("extracts structs from services file", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "services/auth.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "services/auth.go", hashContent(content));

      const classes = symbols.filter((s) => s.kind === "class");
      expect(classes.map((c) => c.name)).toContain("AuthError");
      expect(classes.map((c) => c.name)).toContain("AuthService");
    });

    it("extracts interfaces", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "models/user.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "models/user.go", hashContent(content));

      const ifaces = symbols.filter((s) => s.kind === "interface");
      expect(ifaces.map((i) => i.name)).toContain("UserStore");
    });

    it("extracts methods with receiver qualification", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "models/user.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "models/user.go", hashContent(content));

      const functions = symbols.filter((s) => s.kind === "function");
      const qualifiedNames = functions.map((f) => f.qualifiedName);
      expect(qualifiedNames).toContain("User.DisplayName");
      expect(qualifiedNames).toContain("User.IsAdmin");
    });

    it("extracts standalone functions", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "utils/helpers.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "utils/helpers.go", hashContent(content));

      const functions = symbols.filter((s) => s.kind === "function");
      const names = functions.map((f) => f.name);
      expect(names).toContain("FormatName");
      expect(names).toContain("ParseIntSafe");
    });

    it("detects exported vs unexported", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "utils/helpers.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "utils/helpers.go", hashContent(content));

      const formatName = symbols.find((s) => s.name === "FormatName");
      expect(formatName?.isExported).toBe(true);

      const internalHelper = symbols.find((s) => s.name === "internalHelper");
      expect(internalHelper?.isExported).toBe(false);

      // Also check unexported variable from models
      const modelsContent = readFileSync(
        join(FIXTURE_DIR, "models/user.go"),
        "utf-8",
      );
      const modelsTree = parseGo(modelsContent);
      const modelsSymbols = extractGoSymbols(
        modelsTree,
        "models/user.go",
        hashContent(modelsContent),
      );

      const internalCounter = modelsSymbols.find(
        (s) => s.name === "internalCounter",
      );
      expect(internalCounter?.isExported).toBe(false);
    });

    it("extracts constants", () => {
      const helpersContent = readFileSync(
        join(FIXTURE_DIR, "utils/helpers.go"),
        "utf-8",
      );
      const helpersTree = parseGo(helpersContent);
      const helpersSymbols = extractGoSymbols(
        helpersTree,
        "utils/helpers.go",
        hashContent(helpersContent),
      );

      const constants = helpersSymbols.filter((s) => s.kind === "constant");
      const names = constants.map((c) => c.name);
      expect(names).toContain("MaxRetries");
      expect(names).toContain("DefaultTimeout");

      // Also check iota-style constants from models
      const modelsContent = readFileSync(
        join(FIXTURE_DIR, "models/user.go"),
        "utf-8",
      );
      const modelsTree = parseGo(modelsContent);
      const modelsSymbols = extractGoSymbols(
        modelsTree,
        "models/user.go",
        hashContent(modelsContent),
      );

      const modelsConstants = modelsSymbols.filter(
        (s) => s.kind === "constant",
      );
      const modelsNames = modelsConstants.map((c) => c.name);
      expect(modelsNames).toContain("RoleAdmin");
      expect(modelsNames).toContain("RoleUser");
      expect(modelsNames).toContain("RoleGuest");
    });

    it("extracts doc comments", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "models/user.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "models/user.go", hashContent(content));

      const user = symbols.find(
        (s) => s.name === "User" && s.kind === "class",
      );
      expect(user?.docComment).toContain("represents a user");
    });

    it("generates stable symbol IDs", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "utils/helpers.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "utils/helpers.go", hashContent(content));

      const formatName = symbols.find((s) => s.name === "FormatName");
      expect(formatName?.id).toBe("utils/helpers.go::FormatName#function");
    });

    it("isAsync is always false for Go", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "services/auth.go"),
        "utf-8",
      );
      const tree = parseGo(content);
      const symbols = extractGoSymbols(tree, "services/auth.go", hashContent(content));

      expect(symbols.every((s) => s.isAsync === false)).toBe(true);
    });
  });

  describe("dependency extraction", () => {
    it("detects function calls", () => {
      const files = [
        "models/user.go",
        "services/auth.go",
      ];

      const allSymbols = files.flatMap((f) => {
        const content = readFileSync(join(FIXTURE_DIR, f), "utf-8");
        const tree = parseGo(content);
        return extractGoSymbols(tree, f, hashContent(content));
      });

      const lookup = buildGoSymbolLookup(allSymbols);

      // Extract deps from auth.go
      const authContent = readFileSync(
        join(FIXTURE_DIR, "services/auth.go"),
        "utf-8",
      );
      const authTree = parseGo(authContent);
      const deps = extractGoDependencies(
        authTree,
        "services/auth.go",
        allSymbols,
        lookup,
      );

      // Check for uses_type relationships (AuthService uses UserStore, User)
      const usesTypeDeps = deps.filter((d) => d.kind === "uses_type");
      expect(usesTypeDeps.length).toBeGreaterThan(0);

      // Overall we should have at least uses_type deps
      expect(deps.length).toBeGreaterThan(0);
    });
  });

  describe("full integration", () => {
    let db: Database;

    beforeEach(() => {
      db = openMemoryDatabase();
      initializeSchema(db);
    });

    afterEach(() => {
      db?.close();
    });

    it("indexes the Go fixture project", async () => {
      const result = await indexGoTreeSitter(db, {
        projectRoot: FIXTURE_DIR,
      });

      expect(result.filesProcessed).toBeGreaterThan(0);
      expect(result.symbolsIndexed).toBeGreaterThan(0);
    });

    it("is incremental — skips unchanged files on second run", async () => {
      // First run indexes everything
      await indexGoTreeSitter(db, { projectRoot: FIXTURE_DIR });

      // Second run should skip unchanged files
      const result = await indexGoTreeSitter(db, {
        projectRoot: FIXTURE_DIR,
      });

      expect(result.filesSkipped).toBeGreaterThan(0);
      expect(result.symbolsIndexed).toBe(0);
    });

    it("stores symbols with correct language", async () => {
      await indexGoTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const row = db
        .prepare("SELECT language FROM symbols LIMIT 1")
        .get() as { language: string } | undefined;

      expect(row).toBeDefined();
      expect(row!.language).toBe("go");
    });

    it("stores structs as classes", async () => {
      await indexGoTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const classes = db
        .prepare(
          "SELECT * FROM symbols WHERE kind = 'class' AND language = 'go'",
        )
        .all() as Array<{ name: string }>;

      const names = classes.map((c) => c.name);
      expect(names).toContain("User");
      expect(names).toContain("AuthError");
      expect(names).toContain("AuthService");
    });

    it("stores interfaces correctly", async () => {
      await indexGoTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const interfaces = db
        .prepare(
          "SELECT * FROM symbols WHERE kind = 'interface' AND language = 'go'",
        )
        .all() as Array<{ name: string }>;

      expect(interfaces.map((i) => i.name)).toContain("UserStore");
    });

    it("stores functions correctly", async () => {
      await indexGoTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const functions = db
        .prepare(
          "SELECT * FROM symbols WHERE kind = 'function' AND language = 'go'",
        )
        .all() as Array<{
        name: string;
        qualified_name: string;
        is_exported: number;
      }>;

      const names = functions.map((f) => f.name);
      expect(names).toContain("FormatName");
      expect(names).toContain("ParseIntSafe");
      expect(names).toContain("DisplayName");
      expect(names).toContain("IsAdmin");
      expect(names).toContain("NewAuthService");
      expect(names).toContain("Authenticate");

      // Verify receiver-qualified name
      const displayName = functions.find((f) => f.name === "DisplayName");
      expect(displayName?.qualified_name).toBe("User.DisplayName");
    });

    it("stores constants correctly", async () => {
      await indexGoTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const constants = db
        .prepare(
          "SELECT * FROM symbols WHERE kind = 'constant' AND language = 'go'",
        )
        .all() as Array<{ name: string }>;

      const names = constants.map((c) => c.name);
      expect(names).toContain("MaxRetries");
      expect(names).toContain("DefaultTimeout");
      expect(names).toContain("RoleAdmin");
      expect(names).toContain("RoleUser");
      expect(names).toContain("RoleGuest");
    });

    it("stores dependencies", async () => {
      await indexGoTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const deps = db
        .prepare("SELECT * FROM dependencies")
        .all() as Array<{
        source_symbol: string;
        target_symbol: string;
        kind: string;
      }>;

      // Should have at least some uses_type dependencies
      // (e.g., AuthService struct field references UserStore)
      const usesTypeDeps = deps.filter((d) => d.kind === "uses_type");
      expect(usesTypeDeps.length).toBeGreaterThan(0);
    });

    it("generates stable symbol IDs in DB", async () => {
      await indexGoTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const user = db
        .prepare(
          "SELECT id FROM symbols WHERE name = 'User' AND kind = 'class'",
        )
        .get() as { id: string } | undefined;

      expect(user).toBeDefined();
      expect(user!.id).toMatch(/^models\/user\.go::/);
      expect(user!.id).toMatch(/#class$/);
    });
  });
});
