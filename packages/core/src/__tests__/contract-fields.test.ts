// Contracts stage 2: field-level mismatch detection (casing / missing / type)
// between a frontend's annotated response type and a backend endpoint's DTO.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openMemoryDatabase, type Database } from "../db/connection.js";
import { initializeSchema } from "../db/schema.js";
import { extractApiCalls } from "../indexer/api-call-analyzer.js";
import { indexConfiguredProject } from "../indexer/index.js";
import { detectDrift } from "../drift/detector.js";
import ts from "typescript";

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile("src/client.ts", code, ts.ScriptTarget.ES2022, true);
}

describe("extractApiCalls — expected type capture", () => {
  it("captures a type argument on a typed client call, unwrapped", () => {
    const calls = extractApiCalls(
      parse(`
        const api = axios;
        api.get<UserDto>("/api/users");
        api.get<UserDto[]>("/api/all");
        api.get("/api/untyped");
      `),
      "src/client.ts",
    );
    expect(calls.find((c) => c.url === "/api/users")?.expectedType).toBe("UserDto");
    expect(calls.find((c) => c.url === "/api/all")?.expectedType).toBe("UserDto");
    expect(calls.find((c) => c.url === "/api/untyped")?.expectedType).toBeNull();
  });
});

describe("field-level contract violations (TS frontend + C# backend)", () => {
  let db: Database;
  let repoRoot: string;

  beforeEach(() => {
    db = openMemoryDatabase();
    initializeSchema(db);
    repoRoot = mkdtempSync(join(tmpdir(), "arcbridge-fields-"));

    // Frontend: a UserDto interface + a typed client call expecting it.
    mkdirSync(join(repoRoot, "web", "src"), { recursive: true });
    writeFileSync(
      join(repoRoot, "web", "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true },
        include: ["src/**/*"],
      }),
      "utf-8",
    );
    writeFileSync(join(repoRoot, "web", "package.json"), JSON.stringify({ name: "web" }), "utf-8");
    writeFileSync(
      join(repoRoot, "web", "src", "types.ts"),
      // Casing chosen to isolate each case against the PascalCase C# DTO:
      //  Id      — same casing, wrong type (number vs C# string) → TYPE mismatch
      //  userName— camelCase vs C# UserName                       → CASING mismatch
      //  nickname— absent on backend                              → MISSING field
      //  Email   — same casing + same type                        → no violation
      "export interface UserDto {\n  Id: number;\n  userName: string;\n  nickname: string;\n  Email: string;\n}\n",
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "web", "src", "client.ts"),
      [
        'import type { UserDto } from "./types.js";',
        "const apiClient = { get<T>(_u: string): Promise<T> { return null as unknown as Promise<T>; } };",
        "export function loadUsers() { return apiClient.get<UserDto>(\"/api/users\"); }",
      ].join("\n"),
      "utf-8",
    );

    // Backend: C# controller returning a UserDto with the divergent shape.
    mkdirSync(join(repoRoot, "api", "Controllers"), { recursive: true });
    mkdirSync(join(repoRoot, "api", "Models"), { recursive: true });
    writeFileSync(
      join(repoRoot, "api", "Models", "UserDto.cs"),
      `namespace Api.Models
{
    public class UserDto
    {
        public string Id { get; set; }
        public string UserName { get; set; }
        public string Email { get; set; }
    }
}
`,
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "api", "Controllers", "UsersController.cs"),
      `using Microsoft.AspNetCore.Mvc;
using Api.Models;

namespace Api.Controllers
{
    [ApiController]
    [Route("api/users")]
    public class UsersController : ControllerBase
    {
        [HttpGet]
        public ActionResult<UserDto> GetUser() => new UserDto();
    }
}
`,
      "utf-8",
    );

    mkdirSync(join(repoRoot, ".arcbridge"), { recursive: true });
    writeFileSync(
      join(repoRoot, ".arcbridge", "config.yaml"),
      "indexing:\n  csharp_indexer: tree-sitter\n",
      "utf-8",
    );
  });

  afterEach(() => {
    db.close();
    rmSync(repoRoot, { recursive: true, force: true });
  });

  async function indexBoth(): Promise<void> {
    await indexConfiguredProject(db, repoRoot, {
      services: [
        { name: "frontend", path: "web", type: "nextjs" },
        { name: "api", path: "api", type: "dotnet" },
      ],
    });
  }

  it("captures the route's response DTO and the interface field shapes", async () => {
    await indexBoth();
    const route = db
      .prepare("SELECT response_type FROM routes WHERE service = 'api' AND kind = 'api-route'")
      .get() as { response_type: string | null };
    expect(route.response_type).toBe("UserDto");

    const feFields = db
      .prepare("SELECT name FROM symbols WHERE service = 'frontend' AND qualified_name LIKE 'UserDto.%' ORDER BY name")
      .all() as { name: string }[];
    expect(feFields.map((f) => f.name)).toEqual(["Email", "Id", "nickname", "userName"]);
  });

  it("flags casing, missing-field, and type mismatches — not the matching field", async () => {
    await indexBoth();
    const v = detectDrift(db)
      .filter((e) => e.kind === "contract_violation")
      .map((e) => e.description);

    expect(v.some((d) => d.includes("`userName`") && d.includes("casing differs"))).toBe(true);
    expect(v.some((d) => d.includes("`nickname`") && d.includes("no such field"))).toBe(true);
    expect(v.some((d) => d.includes("`Id: number`") && d.includes("returns `string`"))).toBe(true);
    // Email matches exactly (name + type) → no violation mentioning it
    expect(v.some((d) => d.includes("`Email`"))).toBe(false);
    // exactly the three expected field violations (no endpoint/method noise)
    expect(v).toHaveLength(3);
  });

  it("stays silent for an untyped call (no expected_type)", async () => {
    // Replace the typed client call with a bare fetch (no type argument)
    writeFileSync(
      join(repoRoot, "web", "src", "client.ts"),
      'export function loadUsers() { return fetch("/api/users"); }\n',
      "utf-8",
    );
    await indexBoth();
    const v = detectDrift(db).filter((e) => e.kind === "contract_violation");
    expect(v).toHaveLength(0);
  });
});
