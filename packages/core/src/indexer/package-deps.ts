import { join } from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { Database } from "../db/connection.js";
import { transaction } from "../db/connection.js";

export interface PackageDependency {
  name: string;
  version: string | null;
  source: "npm" | "npm-dev" | "nuget";
}

/**
 * Scan the project root for package dependency manifests (package.json, .csproj)
 * and write discovered dependencies to the package_dependencies table.
 */
export function indexPackageDependencies(
  db: Database,
  projectRoot: string,
  service: string = "main",
): number {
  const deps: PackageDependency[] = [];

  // Parse package.json (npm)
  const pkgJsonPath = join(projectRoot, "package.json");
  if (existsSync(pkgJsonPath)) {
    deps.push(...parsePackageJson(pkgJsonPath));
  }

  // Parse all .csproj files (NuGet)
  const csprojFiles = findCsprojFiles(projectRoot);
  for (const csproj of csprojFiles) {
    deps.push(...parseCsproj(csproj));
  }

  if (deps.length === 0) return 0;

  // Clear existing deps for this service and re-insert
  db.prepare("DELETE FROM package_dependencies WHERE service = ?").run(service);

  const insert = db.prepare(
    "INSERT OR IGNORE INTO package_dependencies (name, version, source, service) VALUES (?, ?, ?, ?)",
  );

  transaction(db, () => {
    for (const dep of deps) {
      insert.run(dep.name, dep.version, dep.source, service);
    }
  });

  return deps.length;
}

/**
 * Parse package.json for npm dependencies.
 */
function parsePackageJson(filePath: string): PackageDependency[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const deps: PackageDependency[] = [];

    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        deps.push({ name, version, source: "npm" });
      }
    }

    if (pkg.devDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        deps.push({ name, version, source: "npm-dev" });
      }
    }

    return deps;
  } catch {
    return [];
  }
}

/**
 * Parse a .csproj file for NuGet PackageReference entries.
 * Handles the standard MSBuild XML format:
 *   <PackageReference Include="PackageName" Version="1.2.3" />
 *   <PackageReference Include="PackageName" Version="1.2.3"></PackageReference>
 */
function parseCsproj(filePath: string): PackageDependency[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const deps: PackageDependency[] = [];

    // Match <PackageReference Include="Name" Version="Ver" />
    // Version can be an attribute or a child element, or omitted (centrally managed)
    const pattern = /<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?[^>]*\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      deps.push({
        name: match[1],
        version: match[2] ?? null,
        source: "nuget",
      });
    }

    return deps;
  } catch {
    return [];
  }
}

/**
 * Find all .csproj files in the project root (recursive, skips bin/obj/node_modules).
 */
function findCsprojFiles(dir: string, maxDepth: number = 4): string[] {
  const results: string[] = [];

  function walk(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "bin" || entry.name === "obj" || entry.name === "node_modules" || entry.name === ".git") continue;

        const fullPath = join(currentDir, entry.name);
        if (entry.isFile() && entry.name.endsWith(".csproj")) {
          results.push(fullPath);
        } else if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        }
      }
    } catch {
      // Permission errors, etc.
    }
  }

  walk(dir, 0);
  return results;
}
