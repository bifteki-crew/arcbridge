import { describe, it, expect, afterEach } from "vitest";
import { resolve } from "node:path";
import {
  REQUIRE_DOTNET_ENV,
  dotnetReady,
  dotnetRequired,
} from "./helpers/dotnet-ready.js";

/**
 * The guard that decides whether an unavailable .NET toolchain skips or fails.
 *
 * Worth testing despite being test-only plumbing: its entire job is to stop a
 * run going green with coverage switched off, and a guard that quietly stops
 * guarding is the exact failure it exists to catch.
 *
 * These cases never depend on whether .NET is installed. They point the check at
 * a directory that cannot contain the indexer, so a reason is always produced —
 * either the missing SDK or the missing project — and what is asserted is how
 * that reason is *reported*.
 */
describe("the ARCBRIDGE_REQUIRE_DOTNET guard", () => {
  const original = process.env.ARCBRIDGE_REQUIRE_DOTNET;
  const nowhere = resolve("/nonexistent-arcbridge-guard-fixture/src/__tests__");

  afterEach(() => {
    if (original === undefined) delete process.env.ARCBRIDGE_REQUIRE_DOTNET;
    else process.env.ARCBRIDGE_REQUIRE_DOTNET = original;
  });

  it("is the variable the CI workflow sets", () => {
    // Static access below keeps eslint happy; this keeps the two in step, so
    // renaming the constant cannot leave the workflow setting a dead variable.
    expect(REQUIRE_DOTNET_ENV).toBe("ARCBRIDGE_REQUIRE_DOTNET");
  });

  it("skips quietly when unset, so a machine without the SDK stays usable", () => {
    delete process.env.ARCBRIDGE_REQUIRE_DOTNET;
    expect(dotnetRequired()).toBe(false);
    expect(dotnetReady(nowhere)).toBe(false);
  });

  it("throws when set, so CI cannot report a skip as a pass", () => {
    process.env.ARCBRIDGE_REQUIRE_DOTNET = "1";
    expect(dotnetRequired()).toBe(true);
    expect(() => dotnetReady(nowhere)).toThrow(/is a failure rather than a skip/);
  });

  it("names the reason in the failure, since a bare refusal is undiagnosable in CI", () => {
    process.env.ARCBRIDGE_REQUIRE_DOTNET = "1";
    // Either reason is legitimate depending on the host; both must be reported.
    expect(() => dotnetReady(nowhere)).toThrow(/\.NET SDK is not installed|does not exist/);
  });

  it("treats the values that mean 'off' as off, not as mere presence", () => {
    for (const off of ["", "0", "false"]) {
      process.env.ARCBRIDGE_REQUIRE_DOTNET = off;
      expect(dotnetRequired(), `${JSON.stringify(off)} should not require dotnet`).toBe(false);
    }
    for (const on of ["1", "true", "yes"]) {
      process.env.ARCBRIDGE_REQUIRE_DOTNET = on;
      expect(dotnetRequired(), `${JSON.stringify(on)} should require dotnet`).toBe(true);
    }
  });
});
