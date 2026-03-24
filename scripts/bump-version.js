#!/usr/bin/env node

/**
 * Bump version across all packages (npm + .NET).
 * Usage: node scripts/bump-version.js 0.2.0
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("Usage: node scripts/bump-version.js <version>");
  console.error("Example: node scripts/bump-version.js 0.2.0");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");

// npm packages
const packages = ["core", "adapters", "cli", "mcp-server"];
for (const pkg of packages) {
  const path = resolve(root, `packages/${pkg}/package.json`);
  const json = JSON.parse(readFileSync(path, "utf-8"));
  const old = json.version;
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`packages/${pkg}/package.json: ${old} → ${version}`);
}

// .NET tool
const csproj = resolve(root, "packages/dotnet-indexer/ArcBridge.DotnetIndexer.csproj");
const xml = readFileSync(csproj, "utf-8");
const updated = xml.replace(
  /<VersionPrefix>.*<\/VersionPrefix>/,
  `<VersionPrefix>${version}</VersionPrefix>`,
);
writeFileSync(csproj, updated);
const oldMatch = xml.match(/<VersionPrefix>(.*)<\/VersionPrefix>/);
console.log(`packages/dotnet-indexer/.csproj: ${oldMatch?.[1]} → ${version}`);

console.log(`\nDone. Don't forget to update CHANGELOG.md and commit.`);
