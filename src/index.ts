#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { registerPipedriveProjectTools } from "./integrations/pipedrive/projects.js";
import { registerPipedriveTools } from "./integrations/pipedrive/tools.js";
import { registerSevdeskTools } from "./integrations/sevdesk/tools.js";

const config = loadConfig();

const server = new McpServer({
  name: "workflow-mcp",
  version: "1.0.0",
});

registerPipedriveTools(server, config.integrations.pipedrive);
registerPipedriveProjectTools(server, config.integrations.pipedrive);
registerSevdeskTools(server, config.integrations.sevdesk);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
