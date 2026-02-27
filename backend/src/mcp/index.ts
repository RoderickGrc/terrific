/**
 * Terrific MCP Server
 *
 * Model Context Protocol server for Terrific QA system
 * Allows AI systems to use Terrific functions automatically
 *
 * Usage:
 *   node dist/mcp/index.js
 *
 * Environment variables:
 *   MCP_LOG_LEVEL=debug|info|warn|error (default: info)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS, callTool } from './tools/index.js';
import { logger } from './utils/logger.js';

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
  {
    name: 'terrific-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Listing tools', { count: TOOLS.length });
  return { tools: TOOLS };
});

/**
 * Call a tool
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  try {
    logger.toolCall(name, args);

    const result = await callTool(name, args);

    const duration = Date.now() - startTime;
    logger.toolSuccess(name, duration);

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.toolError(name, error);

    const message = error instanceof Error ? error.message : String(error);

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('Terrific MCP Server started successfully', {
      version: '1.0.0',
      toolsCount: TOOLS.length,
    });

    // Log to stderr (MCP standard) for visibility
    console.error('[MCP] Terrific MCP Server started successfully');
    console.error(`[MCP] Available tools: ${TOOLS.map((t) => t.name).join(', ')}`);
    console.error('[MCP] Ready to accept requests');
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

main();
