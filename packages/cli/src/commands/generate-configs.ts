import { resolve } from "node:path";
import { loadConfig, loadRoles, generateAgentRoles } from "@archlens/core";
import { getAdapter } from "@archlens/adapters";

interface GenerateResult {
  platforms: string[];
  roles: string[];
  rolesSource: "custom" | "built-in";
  errors: string[];
}

export async function generateConfigs(
  dir: string,
  json: boolean,
): Promise<void> {
  const projectRoot = resolve(dir);
  const errors: string[] = [];

  // Load config
  const { config, error: configError } = loadConfig(projectRoot);
  if (configError || !config) {
    const msg = configError ?? "No .archlens/config.yaml found";
    if (json) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exitCode = 1;
    return;
  }

  // Load roles from files, fall back to generating built-in roles
  let { roles, errors: roleErrors } = loadRoles(projectRoot);
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
  const platforms = config.platforms ?? ["claude", "copilot"];
  const generatedPlatforms: string[] = [];

  for (const platform of platforms) {
    try {
      const adapter = getAdapter(platform);
      adapter.generateProjectConfig(projectRoot, config);
      if (roles.length > 0) {
        adapter.generateAgentConfigs(projectRoot, roles);
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
