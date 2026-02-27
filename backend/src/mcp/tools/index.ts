/**
 * MCP Tools Index
 *
 * Exports all tool definitions and handlers
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  liveDebugGatewayHealthTool,
  handleLiveDebugGatewayHealth,
} from './health.js';
import {
  startFullstackDebugSessionTool,
  startDebugSessionTool,
  stopSessionTool,
  getSessionMetadataTool,
  getSessionLogsTool,
  handleStartFullstackDebugSession,
  handleStartDebugSession,
  handleStopSession,
  handleGetSessionMetadata,
  handleGetSessionLogs,
} from './session.js';

// ============================================================================
// Tool Definitions (for ListToolsRequestSchema)
// ============================================================================

export const TOOLS: Tool[] = [
  liveDebugGatewayHealthTool,
  startFullstackDebugSessionTool,
  startDebugSessionTool,
  stopSessionTool,
  getSessionMetadataTool,
  getSessionLogsTool,
] as unknown as Tool[];

// ============================================================================
// Tool Handlers Map
// ============================================================================

export const TOOL_HANDLERS: Record<string, (args: unknown) => Promise<string>> = {
  live_debug_gateway_health: handleLiveDebugGatewayHealth,
  start_fullstack_debug_session: handleStartFullstackDebugSession,
  start_debug_session: handleStartDebugSession,
  stop_session: handleStopSession,
  get_session_metadata: handleGetSessionMetadata,
  get_session_logs: handleGetSessionLogs,
};

// ============================================================================
// Tool Handler Dispatcher
// ============================================================================

/**
 * Call a tool by name
 * @throws Error if tool not found
 */
export async function callTool(name: string, args: unknown): Promise<string> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler(args);
}
