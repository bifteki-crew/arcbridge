import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectProjectLanguage } from "../indexer/index.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-lang-detect-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("detectProjectLanguage", () => {
  it("detects Go via go.mod", () => {
    writeFileSync(join(tempDir, "go.mod"), "module example\n\ngo 1.22\n");
    expect(detectProjectLanguage(tempDir)).toBe("go");
  });

  it("detects Python via pyproject.toml", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), '[project]\nname = "test"\n');
    expect(detectProjectLanguage(tempDir)).toBe("python");
  });

  it("detects Python via requirements.txt", () => {
    writeFileSync(join(tempDir, "requirements.txt"), "flask>=2.0\n");
    expect(detectProjectLanguage(tempDir)).toBe("python");
  });

  it("detects Python via setup.py", () => {
    writeFileSync(join(tempDir, "setup.py"), "from setuptools import setup\nsetup()\n");
    expect(detectProjectLanguage(tempDir)).toBe("python");
  });

  it("detects TypeScript via tsconfig.json", () => {
    writeFileSync(join(tempDir, "tsconfig.json"), "{}");
    expect(detectProjectLanguage(tempDir)).toBe("typescript");
  });

  it("detects TypeScript via package.json when no other signals exist", () => {
    writeFileSync(join(tempDir, "package.json"), "{}");
    expect(detectProjectLanguage(tempDir)).toBe("typescript");
  });

  it("prefers tsconfig.json over go.mod", () => {
    writeFileSync(join(tempDir, "tsconfig.json"), "{}");
    writeFileSync(join(tempDir, "go.mod"), "module example\n\ngo 1.22\n");
    expect(detectProjectLanguage(tempDir)).toBe("typescript");
  });

  it("prefers Go over package.json-only", () => {
    writeFileSync(join(tempDir, "go.mod"), "module example\n\ngo 1.22\n");
    writeFileSync(join(tempDir, "package.json"), "{}");
    expect(detectProjectLanguage(tempDir)).toBe("go");
  });

  it("prefers Python over package.json-only", () => {
    writeFileSync(join(tempDir, "pyproject.toml"), '[project]\nname = "test"\n');
    writeFileSync(join(tempDir, "package.json"), "{}");
    expect(detectProjectLanguage(tempDir)).toBe("python");
  });

  it("detects C# via Unity markers (ProjectSettings + Assets)", () => {
    mkdirSync(join(tempDir, "ProjectSettings"));
    mkdirSync(join(tempDir, "Assets"));
    expect(detectProjectLanguage(tempDir)).toBe("csharp");
  });

  it("defaults to TypeScript when no signals exist", () => {
    expect(detectProjectLanguage(tempDir)).toBe("typescript");
  });
});
