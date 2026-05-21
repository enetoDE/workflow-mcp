# workflow-mcp

`workflow-mcp` is a local MCP server for Claude Desktop.

This repository contains the sevdesk integration only. Pipedrive is handled by the separate `pipedrive-mcp-server` project.

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

## Requirements

Install these before using the project:

- Node.js 20 or newer
- npm
- Claude Desktop for macOS
- sevdesk API token

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

The API key is passed through the Claude Desktop config.

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

If the config already has other settings such as `preferences`, keep them. Only add or update entries inside `mcpServers`.

## Config Example: sevdesk Only

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

## Config Example: sevdesk and Separate Pipedrive Server

Use this if you want sevdesk from this project and Pipedrive from the separate `pipedrive-mcp-server` project.

Both servers must be inside the same top-level `mcpServers` object:

- `workflow-mcp` runs sevdesk from this repository.
- `pipedrive` runs Pipedrive from the separate `pipedrive-mcp-server` folder.

Do not put Pipedrive environment variables inside `workflow-mcp`. Pipedrive has its own server entry.

Replace:

- `/absolute/path/to/workflow-mcp` with the local path to this project
- `/absolute/path/to/pipedrive-mcp-server` with the local path to the Pipedrive project
- both API token values with real tokens

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
    },
    "pipedrive": {
      "command": "node",
      "args": [
        "/absolute/path/to/pipedrive-mcp-server/build/index.js"
      ],
      "env": {
        "PIPEDRIVE_API_TOKEN": "replace-with-pipedrive-api-token",
        "PIPEDRIVE_DOMAIN": "companyname.pipedrive.com",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

For example, on a local machine the two paths may look like:

```text
/Users/<your-username>/Desktop/workflow-mcp/dist/index.js
/Users/<your-username>/Desktop/pipedrive-mcp-server/build/index.js
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
        "SEVDESK_DEFAULT_UNITY_ID": "1"
      }
    },
    "pipedrive": {
      "command": "node",
      "args": [
        "/absolute/path/to/pipedrive-mcp-server/build/index.js"
      ],
      "env": {
        "PIPEDRIVE_API_TOKEN": "replace-with-pipedrive-api-token",
        "PIPEDRIVE_DOMAIN": "companyname.pipedrive.com",
        "MCP_TRANSPORT": "stdio"
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
Use workflow-mcp to test the sevdesk connection.
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
- sevdesk invoice draft creation needs a valid sevdesk contact person user ID, either through `SEVDESK_CONTACT_PERSON_ID` or the `contactPersonId` tool input.
- Build files are not committed to GitHub. Each machine must run `npm install` and `npm run build` after cloning.

## Project Structure

```text
src/
  index.ts
  config.ts
  integrations/
    sevdesk/
```

## Development Commands

```bash
npm run typecheck
npm run build
```
