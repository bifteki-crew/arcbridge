// A contract that exists but cannot be checked used to produce silence. That was
// backwards: the deviations which make a call unobservable — no type argument, or
// a `type` alias instead of an interface — are exactly what a convention-unaware
// author writes. So wholesale divergence was invisible while a single slip by a
// careful author was caught. These pin the reported-instead-of-silent behaviour.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openMemoryDatabase, type Database } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { detectDrift, writeDriftLog } from "../drift/detector.js";

let db: Database;

beforeEach(() => {
  db = openMemoryDatabase();
  initializeSchema(db);
});
afterEach(() => db.close());

function route(opts: { path: string; methods?: string[]; responseType?: string | null; service?: string; id?: string }): void {
  db.prepare(
    "INSERT INTO routes (id, route_path, kind, http_methods, has_auth, service, response_type) VALUES (?, ?, 'api-route', ?, 0, ?, ?)",
  ).run(
    opts.id ?? `${opts.service ?? "api"}::${opts.path}`,
    opts.path,
    JSON.stringify(opts.methods ?? ["GET"]),
    opts.service ?? "api",
    opts.responseType ?? null,
  );
}

function call(opts: { url: string; method?: string; expected?: string | null; file?: string; service?: string }): void {
  db.prepare(
    "INSERT INTO api_calls (id, url, method, file_path, line, service, expected_type) VALUES (?, ?, ?, ?, 1, ?, ?)",
  ).run(
    `${opts.file ?? "web/client.ts"}:${opts.url}:${opts.method ?? "GET"}`,
    opts.url,
    opts.method ?? "GET",
    opts.file ?? "web/client.ts",
    opts.service ?? "frontend",
    opts.expected ?? null,
  );
}

function field(type: string, name: string, service: string): void {
  db.prepare(
    "INSERT INTO symbols (id, name, qualified_name, kind, file_path, start_line, end_line, service, language, indexed_at) VALUES (?, ?, ?, 'variable', ?, 1, 2, ?, 'typescript', '2026-01-01T00:00:00Z')",
  ).run(`${service}/${type}.ts::${type}.${name}#variable`, name, `${type}.${name}`, `${service}/${type}.ts`, service);
}

const unverifiable = () => detectDrift(db).filter((e) => e.kind === "contract_unverifiable");

describe("contract_unverifiable", () => {
  it("reports a call that annotates no response type", () => {
    route({ path: "/api/rooms", responseType: "RoomDto" });
    call({ url: "/api/rooms", expected: null });

    const found = unverifiable();
    expect(found).toHaveLength(1);
    expect(found[0].description).toContain("without annotating the response type");
    // info, never warning: gates are commonly set at warning, and unverifiable
    // surface is a coverage report, not a defect.
    expect(found[0].severity).toBe("info");
  });

  it("reports an endpoint that declares no DTO", () => {
    route({ path: "/api/rooms", responseType: null });
    call({ url: "/api/rooms", expected: "RoomDto" });

    const found = unverifiable();
    expect(found).toHaveLength(1);
    expect(found[0].description).toContain("no matching endpoint declares the type it returns");
  });

  it("lists the possible causes when the expected type has no indexed members, without asserting one", () => {
    route({ path: "/api/rooms", responseType: "RoomDto" });
    call({ url: "/api/rooms", expected: "Room" });
    field("RoomDto", "Id", "api");

    const found = unverifiable();
    expect(found).toHaveLength(1);
    // A `type` alias is the common explanation but not the only one — the type may
    // be empty, unindexed, or declared under another service (field lookup is
    // service-scoped). Naming one cause as fact would misdirect the fix.
    expect(found[0].description).toContain("no fields are indexed for the expected type");
    expect(found[0].description).toContain("may be declared as a `type` alias");
    expect(found[0].description).toContain("not be indexed under this service");
  });

  it("reports ambiguous producers instead of silently skipping them", () => {
    route({ id: "a::r", path: "/api/rooms", responseType: "RoomDto", service: "a" });
    route({ id: "b::r", path: "/api/rooms", responseType: "OtherDto", service: "b" });
    call({ url: "/api/rooms", expected: "RoomDto" });

    const found = unverifiable();
    expect(found).toHaveLength(1);
    expect(found[0].description).toContain("more than one service serves it");
  });

  it("stays quiet when the contract IS verifiable", () => {
    route({ path: "/api/rooms", responseType: "RoomDto" });
    call({ url: "/api/rooms", expected: "RoomDto" });
    field("RoomDto", "Id", "api");
    field("RoomDto", "Id", "frontend");

    expect(unverifiable()).toHaveLength(0);
  });

  it("does not fire for a call to an endpoint no service serves", () => {
    // That is already a contract_violation; reporting it as unverifiable too
    // would double-count the same problem.
    route({ path: "/api/rooms", responseType: "RoomDto" });
    call({ url: "/api/typo", expected: "RoomDto" });

    const kinds = detectDrift(db).map((e) => e.kind);
    expect(kinds).toContain("contract_violation");
    expect(kinds).not.toContain("contract_unverifiable");
  });

  it("persists to drift_log — the schema accepts the new kind", () => {
    route({ path: "/api/rooms", responseType: "RoomDto" });
    call({ url: "/api/rooms", expected: null });

    writeDriftLog(db, detectDrift(db));
    const rows = db
      .prepare("SELECT kind, severity FROM drift_log WHERE kind = 'contract_unverifiable'")
      .all() as { kind: string; severity: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].severity).toBe("info");
  });
});
