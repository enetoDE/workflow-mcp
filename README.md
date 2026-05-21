# workflow-mcp

`workflow-mcp` is a local MCP server for Claude Desktop.

It lets Claude Desktop use company tools such as sevdesk and Pipedrive from one local Node.js server.

The server runs on the user's computer. API keys stay in the local Claude Desktop config and are not stored in this repository.

## What Is Included

### sevdesk

The sevdesk integration can:

- test the sevdesk connection
- list contacts
- get one contact
- create a contact
- list invoices
- get one invoice
- create an invoice draft
- list unpaid invoices
- list recent transactions

### Pipedrive CRM

The Pipedrive CRM integration can:

- test the Pipedrive connection
- list, get, create, and update deals
- list, get, and create persons
- list and create organizations
- list and create activities
- list and get leads
- search Pipedrive records
- list pipelines and stages

### Pipedrive Projects

The Pipedrive Projects integration can:

- list, get, create, and update projects
- list project phases
- list and get project templates
- list, get, create, and update project tasks
- search projects

## Requirements

Install these before using the project:

- Node.js 20 or newer
- npm
- Claude Desktop for macOS
- sevdesk API token, if using sevdesk
- Pipedrive API token and Pipedrive company domain, if using Pipedrive

## Install

Clone the repository:

```bash
git clone https://github.com/enetoDE/workflow-mcp.git
cd workflow-mcp
```

Install dependencies:

```bash
npm install
```

Build the project:

```bash
npm run build
```

After the build, this file should exist:

```text
dist/index.js
```

Claude Desktop will run that file.

## Local Test

To check that the server starts, run:

```bash
npm start
```

The server uses stdio, so it will wait for MCP messages. This is normal.

Stop it with `Ctrl+C`.

## Environment Variables

The API keys are passed through the Claude Desktop config.

You can also copy the example env file for reference:

```bash
cp .env.example .env
```

Important: Claude Desktop does not automatically read `.env`. The values must be added inside `claude_desktop_config.json`.

### sevdesk Variables

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

`SEVDESK_CONTACT_PERSON_ID` is only needed for creating invoice drafts when no `contactPersonId` is passed in the tool request.

### Pipedrive Variables

Required:

```text
PIPEDRIVE_API_TOKEN
PIPEDRIVE_DOMAIN
```

Example:

```text
PIPEDRIVE_DOMAIN=companyname.pipedrive.com
```

## Claude Desktop Config on macOS

Claude Desktop config file location:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Open it with:

```bash
open -e ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

The MCP server must be added inside the top-level `mcpServers` object.

Correct structure:

```json
{
  "mcpServers": {
    "workflow-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/workflow-mcp/dist/index.js"
      ],
      "env": {}
    }
  }
}
```

Do not create two separate top-level `mcpServers` blocks. That is invalid JSON.

Wrong:

```json
{
  "mcpServers": {},
  "mcpServers": {}
}
```

If the config already has other settings such as `preferences`, keep them. Only add or update the `workflow-mcp` entry inside `mcpServers`.

## Config Example: sevdesk Only

Use this if only sevdesk should be enabled.

Replace:

- `/absolute/path/to/workflow-mcp` with the local project path
- `replace-with-sevdesk-api-token` with the real sevdesk API token

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

## Config Example: sevdesk and Pipedrive

Use this if sevdesk and Pipedrive should both be enabled.

Both integrations go inside the same `workflow-mcp` entry. Do not create a second MCP server entry for Pipedrive if this project is handling Pipedrive.

Replace:

- `/absolute/path/to/workflow-mcp` with the local project path
- `replace-with-sevdesk-api-token` with the real sevdesk API token
- `replace-with-pipedrive-api-token` with the real Pipedrive API token
- `companyname.pipedrive.com` with the real Pipedrive company domain

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

## Config Example: Keep Existing Preferences

If the config file already has `preferences`, leave them in place.

Example:

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
  },
  "preferences": {
    "sidebarMode": "chat"
  }
}
```

## After Editing the Config

After saving `claude_desktop_config.json`:

1. Fully quit Claude Desktop.
2. Open Claude Desktop again.
3. Start a new chat.
4. Ask Claude to test the connection.

Example prompt:

```text
Use workflow-mcp to test the sevdesk and Pipedrive connections.
```

## Updating the Project Later

When the repository changes, update the local copy:

```bash
git pull
npm install
npm run build
```

Restart Claude Desktop after rebuilding.

## Known Requirements and Limits

- sevdesk tools need a sevdesk account with API access.
- Pipedrive tools need a Pipedrive account with API access.
- Pipedrive Projects tools need Projects to be enabled in the Pipedrive account.
- Some Pipedrive Projects endpoints are marked as beta in the official Pipedrive API docs.
- Pipedrive list tools return one page by default. Use the `limit` input to keep responses small.
- Pipedrive list tools support `fetchAll: true` when all pages are needed, but large accounts can return more data than Claude Desktop can display in one tool result.
- Pipedrive still applies its own request limits and rate limits.
- Build files are not committed to GitHub. Each machine must run `npm install` and `npm run build` after cloning.

## Project Structure

```text
src/
  index.ts
  config.ts
  integrations/
    sevdesk/
    pipedrive/
```

## Development Commands

```bash
npm run typecheck
npm run build
```
