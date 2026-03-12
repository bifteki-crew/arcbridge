import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { AgentRoleSchema, type AgentRole } from "../schemas/agent-roles.js";

export interface LoadRolesResult {
  roles: AgentRole[];
  errors: string[];
}

/**
 * Load agent role definitions from `.archlens/agents/*.md` files.
 * Each file is parsed as YAML frontmatter + markdown body (system_prompt).
 * Returns validated roles and any parse/validation errors.
 */
export function loadRoles(projectRoot: string): LoadRolesResult {
  const agentsDir = join(projectRoot, ".archlens", "agents");
  const roles: AgentRole[] = [];
  const errors: string[] = [];

  let files: string[];
  try {
    files = readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return { roles: [], errors: [`Agent directory not found: ${agentsDir}`] };
  }

  for (const file of files) {
    const filePath = join(agentsDir, file);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = matter(raw);

      // Combine frontmatter data with markdown body as system_prompt
      const input = {
        ...parsed.data,
        system_prompt: parsed.content.trim(),
      };

      const result = AgentRoleSchema.safeParse(input);
      if (result.success) {
        roles.push(result.data);
      } else {
        const issues = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        errors.push(`${file}: validation failed — ${issues}`);
      }
    } catch (err) {
      errors.push(
        `${file}: parse error — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { roles, errors };
}

/**
 * Load a single role by ID from `.archlens/agents/{roleId}.md`.
 * Returns null if the file doesn't exist or fails validation.
 * Rejects roleId values that don't match kebab-case to prevent path traversal.
 */
export function loadRole(
  projectRoot: string,
  roleId: string,
): { role: AgentRole | null; error: string | null } {
  // Validate roleId to prevent path traversal
  if (!/^[a-z0-9-]+$/.test(roleId)) {
    return { role: null, error: `Invalid role ID: "${roleId}" (must be kebab-case)` };
  }

  const filePath = join(projectRoot, ".archlens", "agents", `${roleId}.md`);

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = matter(raw);

    const input = {
      ...parsed.data,
      system_prompt: parsed.content.trim(),
    };

    const result = AgentRoleSchema.safeParse(input);
    if (result.success) {
      return { role: result.data, error: null };
    }
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { role: null, error: `Validation failed: ${issues}` };
  } catch (err) {
    // Distinguish file-not-found (expected) from other errors
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { role: null, error: null };
    }
    return { role: null, error: `Parse error: ${err instanceof Error ? err.message : String(err)}` };
  }
}
