# workflow-mcp

`workflow-mcp` provides MCP tools for sevDesk.

The repository supports two deployments:

- Local MCP server for Claude Desktop over stdio
- Remote MCP server on Cloudflare Workers over Streamable HTTP

This repository is sevDesk only. Pipedrive is handled by the separate `pipedrive-mcp-server` project.

## Included sevDesk Tools

- `test_sevdesk_connection`
- `list_contacts`
- `get_contact`
- `create_contact`
- `list_invoices`
- `get_invoice`
- `create_invoice_draft`
- `list_unpaid_invoices`
- `list_recent_transactions`

Invoice creation only creates a sevDesk draft. It does not send, finalize, book, or email the invoice.

## Requirements

- Node.js 20 or newer
- npm
- sevDesk API token
- Claude Desktop for local use
- Cloudflare account and Wrangler login for remote Worker deployment

## Local Claude Desktop Setup

Install and build:

```bash
npm install
npm run build
```

The local MCP entrypoint is:

```text
dist/index.js
```

Claude Desktop config path on macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Open it:

```bash
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

Add the server under the existing top-level `mcpServers` object. Do not create duplicate top-level `mcpServers` keys.

```json
{
  "mcpServers": {
    "workflow-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/workflow-mcp/dist/index.js"
      ],
      "env": {
        "SEVDESK_API_TOKEN": "replace-with-sevdesk-api-token",
        "SEVDESK_BASE_URL": "https://my.sevdesk.de/api/v1",
        "SEVDESK_USER_AGENT": "workflow-mcp",
        "SEVDESK_DEFAULT_CONTACT_CATEGORY_ID": "3",
        "SEVDESK_DEFAULT_COUNTRY_ID": "1",
        "SEVDESK_DEFAULT_UNITY_ID": "1"
      }
    }
  }
}
```

After editing the config, fully quit and reopen Claude Desktop.

## Environment Variables

Required:

```text
SEVDESK_API_TOKEN
```

Optional:

```text
SEVDESK_BASE_URL=https://my.sevdesk.de/api/v1
SEVDESK_USER_AGENT=workflow-mcp
SEVDESK_DEFAULT_CONTACT_CATEGORY_ID=3
SEVDESK_DEFAULT_COUNTRY_ID=1
SEVDESK_DEFAULT_UNITY_ID=1
SEVDESK_CONTACT_PERSON_ID=
```

`SEVDESK_API_BASE_URL` is still accepted for older local configs, but new setup should use `SEVDESK_BASE_URL`.

`SEVDESK_CONTACT_PERSON_ID` is only needed for invoice drafts when the tool request does not pass `contactPersonId`.

## Cloudflare Worker Setup

The remote MCP Worker lives in:

```text
worker/
```

It exposes:

- `GET /health` for liveness
- `/mcp` for MCP Streamable HTTP

Install Worker dependencies:

```bash
npm run worker:install
```

Check types:

```bash
npm run worker:typecheck
```

Run locally:

```bash
npm run worker:dev
```

Local URLs:

```text
http://localhost:8787/health
http://localhost:8787/mcp
```

Set the sevDesk API token as a Cloudflare Worker secret:

```bash
cd worker
npx wrangler secret put SEVDESK_API_TOKEN
```

Do not commit `.env`, `.dev.vars`, API tokens, logs, or Wrangler local state.

Deploy:

```bash
npm run worker:deploy
```

After deployment, Wrangler prints the Worker URL. The remote endpoints will be:

```text
https://<worker-subdomain>/health
https://<worker-subdomain>/mcp
```

## Testing Remote MCP

Use MCP Inspector or another remote MCP client against:

```text
https://<worker-subdomain>/mcp
```

For Claude Desktop clients that still need a local stdio command, use `mcp-remote`:

```json
{
  "mcpServers": {
    "workflow-mcp-remote": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<worker-subdomain>/mcp"
      ]
    }
  }
}
```

## Development Commands

Local server:

```bash
npm run typecheck
npm run build
npm start
```

Cloudflare Worker:

```bash
npm run worker:install
npm run worker:typecheck
npm run worker:dev
npm run worker:deploy
```

## Security Notes

- sevDesk API tokens must be passed through Claude Desktop config for local use or Wrangler secrets for Cloudflare use.
- Do not place real tokens in `wrangler.jsonc`, README examples, `.env.example`, or committed files.
- The Worker setup is unauthenticated by default. If the remote URL will be shared outside a trusted environment, protect it with Cloudflare Access or another approved access-control layer.

## Project Structure

```text
src/
  index.ts
  config.ts
  integrations/
    sevdesk/

worker/
  src/index.ts
  wrangler.jsonc
  package.json
  tsconfig.json
```
