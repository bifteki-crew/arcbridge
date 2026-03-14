import { refreshFromDocs } from "@arcbridge/core";
import { openProjectDb } from "../project.js";

export async function refresh(dir: string, json: boolean): Promise<void> {
  const db = openProjectDb(dir);

  try {
    const warnings = refreshFromDocs(db, dir);

    if (json) {
      console.log(JSON.stringify({ refreshed: true, warnings }));
    } else {
      console.log("Database refreshed from YAML/markdown sources.");
      if (warnings.length > 0) {
        console.log(`\n${warnings.length} warning(s):`);
        for (const w of warnings) {
          console.log(`  - ${w}`);
        }
      }
    }
  } finally {
    db.close();
  }
}
