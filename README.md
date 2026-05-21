# workflow-mcp

`workflow-mcp` is a local Model Context Protocol server for company workflow integrations. It runs over stdio and is intended for local use with Claude Desktop.

The project is a Node.js and TypeScript application. Integrations are isolated under `src/integrations` so additional services can be added without changing the server structure.

## Supported Integrations

### sevdesk

Tools:

- `test_sevdesk_connection`
- `list_contacts`
- `get_contact`
- `create_contact`
- `list_invoices`
- `get_invoice`
- `create_invoice_draft`
- `list_unpaid_invoices`
- `list_recent_transactions`

### Pipedrive CRM

Tools:

- `test_pipedrive_crm_connection`
- `list_deals`
- `get_deal`
- `create_deal`
- `update_deal`
- `list_persons`
- `get_person`
- `create_person`
- `list_organizations`
- `create_organization`
- `list_activities`
- `create_activity`
- `list_leads`
- `get_lead`
- `search_entities`
- `list_pipelines`
- `list_stages`

### Pipedrive Projects

Tools:

- `test_pipedrive_connection`
- `list_projects`
- `get_project`
- `create_project`
- `update_project`
- `list_project_phases`
- `list_project_templates`
- `get_project_template`
- `list_project_tasks`
- `get_project_task`
- `create_project_task`
- `update_project_task`
- `search_projects`

## Prerequisites

- Node.js 20 or newer
- npm
- Claude Desktop for macOS
- sevdesk API token for sevdesk tools
- Pipedrive API token and company domain for Pipedrive tools

## Install

```bash
git clone https://github.com/enetoDE/workflow-mcp.git
cd workflow-mcp
npm install
```

## Build

```bash
npm run build
```

The compiled server entrypoint is:

```text
dist/index.js
```

## Run Locally

The server uses stdio and is normally launched by Claude Desktop. For a local startup check, run:

```bash
npm start
```

Stop the process with `Ctrl+C`.

## Environment Variables

Copy `.env.example` if you want a local reference file:

```bash
cp .env.example .env
```

Claude Desktop does not automatically read `.env`. Add the required variables to the Claude Desktop MCP config as shown below.

### sevdesk

Required:

```text
SEVDESK_API_TOKEN
```

Optional:

```text
SEVDESK_API_BASE_URL=https://my.sevdesk.de/api/v1
SEVDESK_USER_AGENT=workflow-mcp
SEVDESK_DEFAULT_CONTACT_CATEGORY_ID=3
SEVDESK_DEFAULT_COUNTRY_ID=1
SEVDESK_DEFAULT_UNITY_ID=1
SEVDESK_CONTACT_PERSON_ID=
```

`SEVDESK_CONTACT_PERSON_ID` is only required when creating invoice drafts without passing `contactPersonId` in the tool input.

### Pipedrive

Required:

```text
PIPEDRIVE_API_TOKEN
PIPEDRIVE_DOMAIN
```

Example:

```text
PIPEDRIVE_DOMAIN=companyname.pipedrive.com
```

## Claude Desktop Setup for macOS

Claude Desktop reads local MCP server configuration from:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add `workflow-mcp` under the top-level `mcpServers` object. If the file already contains other MCP servers, add `workflow-mcp` as another entry inside the same existing `mcpServers` object.

Do not create duplicate top-level `mcpServers` keys. Duplicate top-level keys are invalid JSON and can cause Claude Desktop to ignore part of the configuration.

Replace `/absolute/path/to/workflow-mcp` with the actual local project path on the machine where the server is installed.

### sevdesk Only

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
        "SEVDESK_API_BASE_URL": "https://my.sevdesk.de/api/v1",
        "SEVDESK_USER_AGENT": "workflow-mcp",
        "SEVDESK_DEFAULT_CONTACT_CATEGORY_ID": "3",
        "SEVDESK_DEFAULT_COUNTRY_ID": "1",
        "SEVDESK_DEFAULT_UNITY_ID": "1"
      }
    }
  }
}
```

### sevdesk and Pipedrive Together

All integration environment variables go inside the same `workflow-mcp` server entry:

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
        "SEVDESK_API_BASE_URL": "https://my.sevdesk.de/api/v1",
        "SEVDESK_USER_AGENT": "workflow-mcp",
        "SEVDESK_DEFAULT_CONTACT_CATEGORY_ID": "3",
        "SEVDESK_DEFAULT_COUNTRY_ID": "1",
        "SEVDESK_DEFAULT_UNITY_ID": "1",
        "PIPEDRIVE_API_TOKEN": "replace-with-pipedrive-api-token",
        "PIPEDRIVE_DOMAIN": "companyname.pipedrive.com"
      }
    }
  }
}
```

If another MCP server is already configured, keep both entries under the same `mcpServers` object:

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "node",
      "args": [
        "/absolute/path/to/existing-server/dist/index.js"
      ],
      "env": {}
    },
    "workflow-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/workflow-mcp/dist/index.js"
      ],
      "env": {
        "SEVDESK_API_TOKEN": "replace-with-sevdesk-api-token",
        "SEVDESK_API_BASE_URL": "https://my.sevdesk.de/api/v1",
        "SEVDESK_USER_AGENT": "workflow-mcp",
        "SEVDESK_DEFAULT_CONTACT_CATEGORY_ID": "3",
        "SEVDESK_DEFAULT_COUNTRY_ID": "1",
        "SEVDESK_DEFAULT_UNITY_ID": "1",
        "PIPEDRIVE_API_TOKEN": "replace-with-pipedrive-api-token",
        "PIPEDRIVE_DOMAIN": "companyname.pipedrive.com"
      }
    }
  }
}
```

After editing the config file, fully quit and restart Claude Desktop.

## Known Limitations and Requirements

- sevdesk tools require an active sevdesk account with API access enabled.
- sevdesk invoice draft creation requires a valid sevdesk contact person user ID, either through `SEVDESK_CONTACT_PERSON_ID` or the `contactPersonId` tool input.
- Pipedrive tools require API access for the configured Pipedrive user.
- Pipedrive Projects tools require the Projects feature to be available in the connected Pipedrive account.
- Some Pipedrive Projects-related endpoints, including project phases, tasks, and project search, are marked as beta in the official Pipedrive API documentation.
- Pipedrive list endpoints are paginated. This server automatically follows pagination, but each Pipedrive request is still subject to the official per-page and rate-limit rules.
- Build output is not committed. Run `npm install` and `npm run build` after cloning.

## Development

```bash
npm run typecheck
npm run build
```

Project layout:

```text
src/
  index.ts
  config.ts
  integrations/
    sevdesk/
    pipedrive/
```
