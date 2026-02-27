---
title: "Terrific MCP setup for Cursor"
updated: "2026-02-27T00:00:00Z"
commit: "b3fb40c"
---

## Overview

This guide shows how to connect the Terrific backend as a Model Context Protocol (MCP) server to any project you open in Cursor. It assumes you already have:

- The Terrific backend cloned on your machine.
- Node.js and npm installed.

We will:

1. Build (or run) the Terrific MCP server.
2. Point Cursor to that server using `.cursor/mcp.json` in your target project.

## 1. Prepare the Terrific MCP backend

1. Open a terminal in the Terrific backend folder:

```powershell
cd <ABSOLUTE_PATH_TO_TERRIFIC_BACKEND>
npm install
npm run build
```

2. After the build, you should have:

```text
<ABSOLUTE_PATH_TO_TERRIFIC_BACKEND>\dist\mcp\index.js
```

> During development, you can also run the MCP directly from TypeScript using `tsx` instead of the compiled `dist` file. See the optional section below.

## 2. Configure Cursor in your target project

1. Open the project where you want to use Terrific (for example, a frontend app) in Cursor.  
   We will call its absolute path `<ABSOLUTE_PATH_TO_CLIENT_PROJECT>`.

2. In that project, create (or edit) `.cursor/mcp.json`:

```text
<ABSOLUTE_PATH_TO_CLIENT_PROJECT>\.cursor\mcp.json
```

3. Add this configuration, adjusting the two paths:

```json
{
  "mcpServers": {
    "terrific": {
      "type": "local",
      "enabled": true,
      "command": "node",
      "args": [
        "<ABSOLUTE_PATH_TO_TERRIFIC_BACKEND>\\dist\\mcp\\index.js"
      ],
      "env": {
        "CLIENT_CWD": "<ABSOLUTE_PATH_TO_CLIENT_PROJECT>"
      }
    }
  }
}
```

- `args[0]` must point to the `index.js` of the Terrific MCP server.  
- `CLIENT_CWD` must be the root folder of the project whose code you want the MCP to inspect.

## 3. Restart Cursor and verify

1. Close and reopen Cursor (or reload the workspace).  
2. In your target project, the assistant should now list Terrific MCP tools (such as starting debug sessions) and operate on the code under `CLIENT_CWD`.

## Optional: use TypeScript directly with tsx

If you prefer not to build `dist` during development, and `tsx` is available, you can configure Cursor like this instead:

```json
{
  "mcpServers": {
    "terrific": {
      "type": "local",
      "enabled": true,
      "command": "npx",
      "args": [
        "tsx",
        "<ABSOLUTE_PATH_TO_TERRIFIC_BACKEND>\\src\\mcp\\index.ts"
      ],
      "env": {
        "CLIENT_CWD": "<ABSOLUTE_PATH_TO_CLIENT_PROJECT>"
      }
    }
  }
}
```

Use this variant only for local development; for stable environments, prefer the compiled `dist` version.

