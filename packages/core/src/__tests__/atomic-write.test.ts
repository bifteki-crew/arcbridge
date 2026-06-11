import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync, statSync, symlinkSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { atomicWriteFileSync } from "../utils/fs.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "arcbridge-atomic-write-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("atomicWriteFileSync", () => {
  it("writes new file content", () => {
    const filePath = join(tempDir, "out.yaml");
    atomicWriteFileSync(filePath, "hello: world\n");
    expect(readFileSync(filePath, "utf-8")).toBe("hello: world\n");
  });

  it("replaces existing file content", () => {
    const filePath = join(tempDir, "out.yaml");
    writeFileSync(filePath, "old: content\n", "utf-8");
    atomicWriteFileSync(filePath, "new: content\n");
    expect(readFileSync(filePath, "utf-8")).toBe("new: content\n");
  });

  it("leaves no temp files behind after success", () => {
    atomicWriteFileSync(join(tempDir, "a.yaml"), "a: 1\n");
    atomicWriteFileSync(join(tempDir, "b.yaml"), "b: 2\n");
    expect(readdirSync(tempDir).sort()).toEqual(["a.yaml", "b.yaml"]);
  });

  it.skipIf(process.platform === "win32")(
    "preserves the existing file's permission bits",
    () => {
      const filePath = join(tempDir, "secret.yaml");
      writeFileSync(filePath, "token: old\n", { encoding: "utf-8", mode: 0o600 });
      chmodSync(filePath, 0o600);

      atomicWriteFileSync(filePath, "token: new\n");

      expect(readFileSync(filePath, "utf-8")).toBe("token: new\n");
      expect(statSync(filePath).mode & 0o777).toBe(0o600);
    },
  );

  it("throws and cleans up the temp file when rename fails", () => {
    // Renaming a file over an existing directory fails
    const dirPath = join(tempDir, "target");
    mkdirSync(dirPath);

    expect(() => atomicWriteFileSync(dirPath, "content")).toThrow();
    expect(readdirSync(tempDir)).toEqual(["target"]);
  });

  // Creating symlinks on Windows requires elevated privileges
  it.skipIf(process.platform === "win32")(
    "writes through a symlink instead of replacing it",
    () => {
      const realDir = join(tempDir, "real");
      mkdirSync(realDir);
      const realFile = join(realDir, "data.yaml");
      writeFileSync(realFile, "value: old\n", "utf-8");
      const linkPath = join(tempDir, "link.yaml");
      symlinkSync(realFile, linkPath);

      atomicWriteFileSync(linkPath, "value: new\n");

      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(readFileSync(realFile, "utf-8")).toBe("value: new\n");
    },
  );

  it.skipIf(process.platform === "win32")(
    "creates the target of a dangling symlink like writeFileSync would",
    () => {
      const targetPath = join(tempDir, "not-yet.yaml");
      const linkPath = join(tempDir, "dangling.yaml");
      symlinkSync(targetPath, linkPath);

      atomicWriteFileSync(linkPath, "created: true\n");

      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(readFileSync(targetPath, "utf-8")).toBe("created: true\n");
    },
  );

  // chmod can't make a directory read-only on Windows
  it.skipIf(process.platform === "win32")("leaves the original file untouched when the write fails", () => {
    const subDir = join(tempDir, "readonly");
    mkdirSync(subDir);
    const filePath = join(subDir, "data.yaml");
    writeFileSync(filePath, "original: true\n", "utf-8");

    // Read-only directory: the temp file cannot be created
    chmodSync(subDir, 0o555);
    try {
      expect(() => atomicWriteFileSync(filePath, "corrupted: true\n")).toThrow();
    } finally {
      chmodSync(subDir, 0o755);
    }

    expect(readFileSync(filePath, "utf-8")).toBe("original: true\n");
    expect(readdirSync(subDir)).toEqual(["data.yaml"]);
  });
});
