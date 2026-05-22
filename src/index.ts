#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerSevdeskTools } from "./integrations/sevdesk/tools.js";

async function main() {
  const config = loadConfig();
  const server = new McpServer({
    name: "workflow-mcp",
    version: "1.0.0",
  });

  registerSevdeskTools(server, config.integrations.sevdesk);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Server startup failed.");
  process.exit(1);
});
