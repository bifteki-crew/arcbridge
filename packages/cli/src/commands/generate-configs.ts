import { resolve } from "node:path";
import { loadConfig, loadRoles, generateAgentRoles } from "@arcbridge/core";
import { getAdapter } from "@arcbridge/adapters";

interface GenerateResult {
  platforms: string[];
  roles: string[];
  rolesSource: "custom" | "built-in";
  errors: string[];
}

export async function generateConfigs(
  dir: string,
  json: boolean,
  force = false,
): Promise<void> {
  const projectRoot = resolve(dir);
  const errors: string[] = [];

  // Load config
  const { config, error: configError } = loadConfig(projectRoot);
  if (configError || !config) {
    const msg = configError ?? "No .arcbridge/config.yaml found";
    if (json) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exitCode = 1;
    return;
  }

  // Load roles from files, fall back to generating built-in roles
  const loaded = loadRoles(projectRoot);
  let roles = loaded.roles;
  const roleErrors = loaded.errors;
  let rolesSource: "custom" | "built-in" = "custom";
  if (roleErrors.length > 0) {
    errors.push(...roleErrors);
  }
  if (roles.length === 0) {
    // No custom roles found — generate built-in role files and use them
    if (!json) console.log("No custom roles found, generating built-in roles...");
    roles = generateAgentRoles(projectRoot);
    rolesSource = "built-in";
  }

  // Determine platforms from config
  const platforms = config.platforms ?? ["claude"];
  const generatedPlatforms: string[] = [];

  for (const platform of platforms) {
    try {
      const adapter = getAdapter(platform);
      const options = force ? { force } : undefined;
      adapter.generateProjectConfig(projectRoot, config, options);
      if (roles.length > 0) {
        adapter.generateAgentConfigs(projectRoot, roles, options);
      }
      generatedPlatforms.push(platform);
    } catch (err) {
      errors.push(
        `${platform}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const result: GenerateResult = {
    platforms: generatedPlatforms,
    roles: roles.map((r) => r.role_id),
    rolesSource,
    errors,
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (generatedPlatforms.length > 0) {
      console.log(
        `Generated configs for: ${generatedPlatforms.join(", ")}`,
      );
    }
    if (roles.length > 0) {
      const source = rolesSource === "built-in" ? " (built-in)" : "";
      console.log(
        `Roles${source}: ${roles.map((r) => r.role_id).join(", ")}`,
      );
    }
    for (const err of errors) {
      console.error(`Warning: ${err}`);
    }
  }
}
