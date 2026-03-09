import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createArchLensServer } from "./server.js";

async function main() {
  const server = createArchLensServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
