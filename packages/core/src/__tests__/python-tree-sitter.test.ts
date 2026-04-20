import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openMemoryDatabase } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import type { Database } from "../db/connection.js";
import { ensurePythonParser, parsePython } from "../indexer/python/parser.js";
import { extractPythonSymbols } from "../indexer/python/symbol-extractor.js";
import {
  extractPythonDependencies,
  buildPythonSymbolLookup,
} from "../indexer/python/dependency-extractor.js";
import { indexPythonTreeSitter } from "../indexer/python/indexer.js";

const FIXTURE_DIR = resolve(__dirname, "fixtures/python-project");

describe("Python tree-sitter indexer", () => {
  beforeAll(async () => {
    await ensurePythonParser();
  });

  describe("parser", () => {
    it("parses a simple Python file", () => {
      const tree = parsePython("def hello(): pass");
      expect(tree.rootNode.type).toBe("module");
    });

    it("parses a class definition", () => {
      const tree = parsePython("class Foo:\n    pass");
      expect(tree.rootNode.type).toBe("module");
      expect(tree.rootNode.namedChildren.length).toBeGreaterThan(0);
    });
  });

  describe("symbol extraction", () => {
    it("extracts classes from fixture", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "src/models/user.py"),
        "utf-8",
      );
      const tree = parsePython(content);
      const symbols = extractPythonSymbols(tree, "src/models/user.py", content);

      const classes = symbols.filter((s) => s.kind === "class");
      const names = classes.map((c) => c.name);
      expect(names).toContain("User");
      expect(names).toContain("UserRole");
    });

    it("extracts methods with class qualification", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "src/models/user.py"),
        "utf-8",
      );
      const tree = parsePython(content);
      const symbols = extractPythonSymbols(tree, "src/models/user.py", content);

      const functions = symbols.filter((s) => s.kind === "function");
      const qualifiedNames = functions.map((f) => f.qualifiedName);
      expect(qualifiedNames).toContain("User.display_name");
      expect(qualifiedNames).toContain("User.is_admin");
    });

    it("extracts module-level functions", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "src/utils.py"),
        "utf-8",
      );
      const tree = parsePython(content);
      const symbols = extractPythonSymbols(tree, "src/utils.py", content);

      const functions = symbols.filter((s) => s.kind === "function");
      const names = functions.map((f) => f.name);
      expect(names).toContain("format_name");
      expect(names).toContain("parse_int_safe");
      expect(names).toContain("async_helper");
    });

    it("detects async functions", () => {
      const utilsContent = readFileSync(
        join(FIXTURE_DIR, "src/utils.py"),
        "utf-8",
      );
      const utilsTree = parsePython(utilsContent);
      const utilsSymbols = extractPythonSymbols(utilsTree, "src/utils.py", utilsContent);

      const asyncHelper = utilsSymbols.find((s) => s.name === "async_helper");
      expect(asyncHelper).toBeDefined();
      expect(asyncHelper!.isAsync).toBe(true);

      const authContent = readFileSync(
        join(FIXTURE_DIR, "src/services/auth.py"),
        "utf-8",
      );
      const authTree = parsePython(authContent);
      const authSymbols = extractPythonSymbols(authTree, "src/services/auth.py", authContent);

      const authenticate = authSymbols.find((s) => s.name === "authenticate");
      expect(authenticate).toBeDefined();
      expect(authenticate!.isAsync).toBe(true);
    });

    it("extracts constants (ALL_CAPS)", () => {
      const utilsContent = readFileSync(
        join(FIXTURE_DIR, "src/utils.py"),
        "utf-8",
      );
      const utilsTree = parsePython(utilsContent);
      const utilsSymbols = extractPythonSymbols(utilsTree, "src/utils.py", utilsContent);

      const constants = utilsSymbols.filter((s) => s.kind === "constant");
      const names = constants.map((c) => c.name);
      expect(names).toContain("MAX_RETRIES");
      expect(names).toContain("DEFAULT_TIMEOUT");

      const userContent = readFileSync(
        join(FIXTURE_DIR, "src/models/user.py"),
        "utf-8",
      );
      const userTree = parsePython(userContent);
      const userSymbols = extractPythonSymbols(userTree, "src/models/user.py", userContent);

      const userConstants = userSymbols.filter((s) => s.kind === "constant");
      expect(userConstants.map((c) => c.name)).toContain("MAX_USERS");
    });

    it("treats underscore-prefixed symbols as non-exported", () => {
      const userContent = readFileSync(
        join(FIXTURE_DIR, "src/models/user.py"),
        "utf-8",
      );
      const userTree = parsePython(userContent);
      const userSymbols = extractPythonSymbols(userTree, "src/models/user.py", userContent);

      const internalCache = userSymbols.find((s) => s.name === "_internal_cache");
      expect(internalCache).toBeDefined();
      expect(internalCache!.isExported).toBe(false);

      const authContent = readFileSync(
        join(FIXTURE_DIR, "src/services/auth.py"),
        "utf-8",
      );
      const authTree = parsePython(authContent);
      const authSymbols = extractPythonSymbols(authTree, "src/services/auth.py", authContent);

      const hashPassword = authSymbols.find((s) => s.name === "_hash_password");
      expect(hashPassword).toBeDefined();
      expect(hashPassword!.isExported).toBe(false);
    });

    it("extracts docstrings", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "src/models/user.py"),
        "utf-8",
      );
      const tree = parsePython(content);
      const symbols = extractPythonSymbols(tree, "src/models/user.py", content);

      const user = symbols.find(
        (s) => s.name === "User" && s.kind === "class",
      );
      expect(user).toBeDefined();
      expect(user!.docComment).toContain("Represents a user");
    });

    it("generates stable symbol IDs", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "src/utils.py"),
        "utf-8",
      );
      const tree = parsePython(content);
      const symbols = extractPythonSymbols(tree, "src/utils.py", content);

      const formatName = symbols.find((s) => s.name === "format_name");
      expect(formatName).toBeDefined();
      expect(formatName!.id).toBe("src/utils.py::format_name#function");
    });
  });

  describe("dependency extraction", () => {
    it("detects class inheritance", () => {
      const content = readFileSync(
        join(FIXTURE_DIR, "src/services/auth.py"),
        "utf-8",
      );
      const tree = parsePython(content);
      const symbols = extractPythonSymbols(tree, "src/services/auth.py", content);

      // Add Exception as a known symbol so the extends dep can be resolved
      const allSymbols = [
        ...symbols,
        {
          id: "builtins::Exception#class",
          name: "Exception",
          filePath: "builtins",
          kind: "class",
          startLine: 1,
          endLine: 1,
        },
      ];

      const lookup = buildPythonSymbolLookup(allSymbols);
      const deps = extractPythonDependencies(tree, "src/services/auth.py", allSymbols, lookup);

      const extendsDep = deps.find(
        (d) =>
          d.kind === "extends" &&
          d.sourceSymbolId.includes("AuthError#class") &&
          d.targetSymbolId.includes("Exception#class"),
      );
      expect(extendsDep).toBeDefined();
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

    it("indexes the Python fixture project", async () => {
      const result = await indexPythonTreeSitter(db, {
        projectRoot: FIXTURE_DIR,
      });

      expect(result.filesProcessed).toBeGreaterThan(0);
      expect(result.symbolsIndexed).toBeGreaterThan(0);
    });

    it("is incremental — skips unchanged files on second run", async () => {
      await indexPythonTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const result = await indexPythonTreeSitter(db, {
        projectRoot: FIXTURE_DIR,
      });

      expect(result.filesSkipped).toBeGreaterThan(0);
      expect(result.symbolsIndexed).toBe(0);
    });

    it("stores symbols with correct language", async () => {
      await indexPythonTreeSitter(db, { projectRoot: FIXTURE_DIR });

      const row = db
        .prepare("SELECT language FROM symbols LIMIT 1")
        .get() as { language: string } | undefined;

      expect(row).toBeDefined();
      expect(row!.language).toBe("python");
    });
  });
});
