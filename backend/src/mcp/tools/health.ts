/**
 * Live Debug Gateway Health Tool
 *
 * Checks if the backend is functioning.
 * Returns information on how to instrument telemetry.
 *
 * IMPORTANT: Does NOT create a session. Only provides instrumentation endpoint and instructions.
 */

import { z } from 'zod';
import { config } from '../../config.js';
import { logger } from '../utils/logger.js';

// Backend URL (single source of truth)
const BACKEND_URL = `http://localhost:${config.port}`;

/**
 * Tool definition for live_debug_gateway_health
 */
export const liveDebugGatewayHealthTool = {
  name: 'live_debug_gateway_health',
  description: `Check that the Terrific backend is reachable and return the ONLY correct instrumentation endpoint.

User impact: no browser windows are opened; this only returns backend status and the correct telemetry endpoint.

Model rules:
- Do not guess ports/URLs. Always use the returned instrumentationEndpoint.
- You may install instrumentation now. It is OK if some logs are sent before a session starts; they may be ignored or not attached, and that is acceptable.
- After instrumentation is ready, start a session with start_fullstack_debug_session (web UI) or start_debug_session (telemetry only).

Return:
- backendUrl
- instrumentationEndpoint (/api/sessions/ingest)
- payload contract
- short next steps (3-5 bullets)`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  } as const,
};

/**
 * Handler for live_debug_gateway_health tool
 */
export async function handleLiveDebugGatewayHealth(): Promise<string> {
  logger.toolCall('live_debug_gateway_health');

  try {
    // 1. Check if backend is running
    const healthResponse = await fetch(`${BACKEND_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Backend health check failed: ${healthResponse.status}`);
    }
    logger.debug('Backend health check passed');

    // 2. Return status and instrumentation instructions (NO session creation)
    const result = {
      status: 'healthy',
      backendUrl: BACKEND_URL,
      instrumentationEndpoint: `${BACKEND_URL}/api/sessions/ingest`,
      payloadContract: {
        message: 'string (required)',
        src: 'string (optional, default: external)',
        lvl: 'log|warn|error (optional, default: log)',
        data: 'object (optional)',
      },
      modelInstructions: [
        'Install temporary fire-and-forget instrumentation using instrumentationEndpoint.',
        'Start a session next (fullstack for web UI, debug for telemetry-only).',
        'Do not change code while a session is recording unless asked explicitly.',
      ],
    };

    logger.toolSuccess('live_debug_gateway_health');
    return JSON.stringify(result, null, 2);
  } catch (error) {
    logger.toolError('live_debug_gateway_health', error);
    throw error;
  }
}

// Zod schema for validation (optional, for type safety)
export const LiveDebugGatewayHealthSchema = z.object({});
