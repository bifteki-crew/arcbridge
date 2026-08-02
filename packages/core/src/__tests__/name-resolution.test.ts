// The tree-sitter indexers resolve calls and type references by bare name, and
// bare names collide constantly. Every extractor used to link to EVERY symbol
// sharing the name, so a method calling its own `GetById` linked to `GetById` on
// five unrelated controllers — surfacing as an error-severity
// dependency_violation between building blocks that never touch each other.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openMemoryDatabase, type Database } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { indexCSharpTreeSitter } from "../indexer/csharp/indexer.js";
import { resolveTargets } from "../indexer/name-resolution.js";

describe("resolveTargets", () => {
  const id = (file: string, qualified: string) => `${file}::${qualified}#function`;

  it("returns the single candidate unchanged", () => {
    const lookup = new Map([["Solo", [id("a.cs", "N.A.Solo")]]]);
    expect(resolveTargets("Solo", lookup, { id: id("b.cs", "N.B.Caller"), filePath: "b.cs" }))
      .toEqual([id("a.cs", "N.A.Solo")]);
  });

  it("prefers a candidate declared by the caller's own type", () => {
    const own = id("svc.cs", "N.EventService.GetById");
    const lookup = new Map([[
      "GetById",
      [id("c1.cs", "N.OneController.GetById"), own, id("c2.cs", "N.TwoController.GetById")],
    ]]);
    const from = { id: id("svc.cs", "N.EventService.GetStats"), filePath: "svc.cs" };
    expect(resolveTargets("GetById", lookup, from)).toEqual([own]);
  });

  it("falls back to same-file candidates when no same-type match exists", () => {
    const sameFile = id("svc.cs", "N.Helper.Run");
    const lookup = new Map([["Run", [id("other.cs", "N.Other.Run"), sameFile]]]);
    const from = { id: id("svc.cs", "N.EventService.GetStats"), filePath: "svc.cs" };
    expect(resolveTargets("Run", lookup, from)).toEqual([sameFile]);
  });

  it("keeps every candidate when there is no local evidence", () => {
    // A call to `_service.GetAllAsync()` legitimately matches the interface AND
    // its implementation; linking to both is informative, not wrong.
    const iface = id("IOrderService.cs", "N.IOrderService.GetAllAsync");
    const impl = id("OrderService.cs", "N.OrderService.GetAllAsync");
    const lookup = new Map([["GetAllAsync", [iface, impl]]]);
    const from = { id: id("OrdersController.cs", "N.OrdersController.GetAll"), filePath: "OrdersController.cs" };
    expect(resolveTargets("GetAllAsync", lookup, from)).toEqual([iface, impl]);
  });

  it("returns nothing for an unknown name", () => {
    expect(resolveTargets("Nope", new Map(), { id: id("a.cs", "N.A.B"), filePath: "a.cs" })).toEqual([]);
  });
});

describe("C# self-call resolution (regression)", () => {
  let db: Database;
  let root: string;

  beforeEach(() => {
    db = openMemoryDatabase();
    initializeSchema(db);
    root = mkdtempSync(join(tmpdir(), "arcbridge-selfcall-"));
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("links a self-call to the caller's own class, not to namesakes elsewhere", async () => {
    mkdirSync(join(root, "Services"), { recursive: true });
    mkdirSync(join(root, "Controllers"), { recursive: true });

    writeFileSync(
      join(root, "Services", "EventService.cs"),
      `namespace Api.Services
{
    public class EventService
    {
        public string GetById(int id) { return "e"; }

        public string GetStats(int eventId)
        {
            var found = GetById(eventId);
            return found;
        }
    }
}
`,
      "utf-8",
    );
    // Two unrelated controllers that also declare GetById.
    for (const name of ["OneController", "TwoController"]) {
      writeFileSync(
        join(root, "Controllers", `${name}.cs`),
        `namespace Api.Controllers
{
    public class ${name}
    {
        public string GetById(int id) { return "c"; }
    }
}
`,
        "utf-8",
      );
    }

    await indexCSharpTreeSitter(db, { projectRoot: root });

    const targets = db
      .prepare(
        `SELECT s2.file_path AS target
         FROM dependencies d
         JOIN symbols s1 ON s1.id = d.source_symbol
         JOIN symbols s2 ON s2.id = d.target_symbol
         WHERE d.kind = 'calls' AND s1.qualified_name LIKE '%EventService.GetStats'`,
      )
      .all() as { target: string }[];

    const files = targets.map((t) => t.target);
    expect(files).toEqual(["Services/EventService.cs"]);
    expect(files.some((f) => f.startsWith("Controllers/"))).toBe(false);
  });
});
