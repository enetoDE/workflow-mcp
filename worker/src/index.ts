import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { loadSevdeskConfig, type SevdeskConfigEnv } from "../../src/integrations/sevdesk/config.js";
import { registerSevdeskTools } from "../../src/integrations/sevdesk/tools.js";

type Env = SevdeskConfigEnv;

const SERVER_INFO = {
  name: "workflow-mcp-sevdesk",
  version: "1.0.0",
} as const;

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function buildServer(env: Env): McpServer {
  const server = new McpServer(SERVER_INFO);
  const config = loadSevdeskConfig(env);

  registerSevdeskTools(server, config);
  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        status: "ok",
        service: "eneto-sevdesk-mcp",
        transport: "streamable-http",
        endpoint: "/mcp",
      });
    }

    if (url.pathname === "/mcp") {
      // Stateless Streamable HTTP servers must create a fresh McpServer per request.
      const handler = createMcpHandler(buildServer(env), { route: "/mcp" });
      return handler(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
