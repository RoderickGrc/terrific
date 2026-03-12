/**
 * Session Tools for MCP Server
 *
 * Tools for creating, managing, and querying Terrific sessions
 */

import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { config, getSessionDirName } from '../../config.js';
import type { QAEvent } from '../../types/index.js';

const execAsync = promisify(exec);

// ============================================================================
// Helper: Open Main Browser
// ============================================================================

/**
 * Opens the user's main browser with the Terrific session URL
 * @param sessionId - The session ID to open
 * @param workspaceHash - Optional workspace hash for workspace-scoped sessions
 */
async function openSessionInBrowser(sessionId: string, workspaceHash?: string): Promise<void> {
  // Build URL with workspace hash if provided
  const workspacePath = workspaceHash ? `workspace/${workspaceHash}/` : '';
  const frontendUrl = `${FRONTEND_BASE}/#/${workspacePath}session/${sessionId}`;

  try {
    const platform = process.platform;
    let command: string;

    if (platform === 'win32') {
      // Windows: use 'start' with empty args for title
      command = `start "" "${frontendUrl}"`;
    } else if (platform === 'darwin') {
      // macOS: use 'open'
      command = `open "${frontendUrl}"`;
    } else {
      // Linux: use 'xdg-open'
      command = `xdg-open "${frontendUrl}"`;
    }

    await execAsync(command);
    logger.info('Main browser opened with session URL', { sessionId, frontendUrl, workspaceHash });
  } catch (error) {
    logger.error('Failed to open main browser', error);
    // Don't throw - session can continue even if browser fails to open
    // User can manually open the URL if needed
  }
}

// Backend/Frontend base URLs (avoid hardcodes)
const BACKEND_URL = `http://localhost:${config.port}`;
const FRONTEND_BASE = config.corsOrigin || 'http://localhost:4567';
const WORKSPACE_API = `${BACKEND_URL}/api/workspaces`;

// Client's working directory (from environment variable)
// Falls back to current process working directory if not provided
const CLIENT_CWD = process.env.CLIENT_CWD || process.cwd();

// Cache workspace to avoid repeated API calls
let cachedWorkspace: { id: string; sessionsDir: string } | null = null;

/**
 * Get or create workspace for the current CLIENT_CWD
 */
async function getOrCreateWorkspace(): Promise<{ id: string; sessionsDir: string }> {
  // Return cached workspace if available
  if (cachedWorkspace) {
    return cachedWorkspace;
  }

  const response = await fetch(WORKSPACE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: CLIENT_CWD }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get workspace: ${response.status}`);
  }

  const workspace = await response.json() as { id: string; path: string; sessionsDir: string };

  cachedWorkspace = { id: workspace.id, sessionsDir: workspace.sessionsDir };

  return cachedWorkspace;
}

// Helper to get headers with X-Workspace-Hash for passing workspace context to backend
function getHeaders(workspaceHash?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (workspaceHash) {
    headers['X-Workspace-Hash'] = workspaceHash;
  }

  return headers;
}

// Type for session response from API
interface SessionResponse {
  id: string;
  name: string;
  status: string;
  startTime: number;
  createdAt: string;
  config?: {
    initialUrl?: string;
    sessionType?: string;
    [key: string]: any;
  };
  description?: string;
  videoFilename?: string;
  events?: QAEvent[];
  sessionDirName?: string;
  message?: string; // Added for stopSession response
  contextFilePath?: string;
  contextFilename?: string;
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * start_fullstack_debug_session
 *
 * Starts a full debug session with browser.
 * MCP-specific config:
 * - recordVideo: false (NO video recording from MCP)
 * - recordActions: true (ALWAYS true)
 * - snapshotOnScreenshot: false (DISABLED from MCP)
 * - snapshotOnReload: false (DISABLED from MCP)
 */
export const startFullstackDebugSessionTool = {
  name: 'start_fullstack_debug_session',
  description: `Start a full debug session with browser and instrumentation.

**CRITICAL - READ THIS BEFORE CALLING:**
1. **BEFORE starting the session, add instrumentation that sends logs to /api/sessions/ingest**
2. Call live_debug_gateway_health() FIRST to get the instrumentation details
3. Verify the telemetry sink is receiving logs and ready to attach them to the new session
4. ONLY THEN call this tool to start the session
5. The session should start when the telemetry sink is already receiving logs

**What happens when you call this tool:**
- A Playwright browser instance is launched (for automation)
- The main browser opens with http://localhost:4567/#/session/{id} (for user viewing)
- Actions are always recorded (recordActions: true)
- Video recording is DISABLED (recordVideo: false)
- Logs sent to /api/sessions/ingest are automatically tied to this session

**Parameters:**
- name: Session name (ASCII only, will be normalized)
- initialUrl: The URL where Playwright will navigate
- browserProfile: (OPTIONAL but RECOMMENDED) Browser profile/credential ID to use
- recordNetwork: (OPTIONAL, default: true) Record network requests
- recordConsole: (OPTIONAL, default: true) Record console logs

**After the session starts:**
- The user can interact with the application in the main browser
- Events are recorded automatically
- Send additional logs to: /api/sessions/ingest
- When done, call stop_session() to save and get statistics`,
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Session name (ASCII only, will be normalized)',
      },
      initialUrl: {
        type: 'string',
        description: 'Initial URL to open in the browser',
      },
      browserProfile: {
        type: 'string',
        description: 'Browser profile/credential ID to use (optional but RECOMMENDED)',
      },
      recordNetwork: {
        type: 'boolean',
        description: 'Record network requests (default: false)',
      },
      recordConsole: {
        type: 'boolean',
        description: 'Record console logs (default: false)',
      },
    },
    required: ['name', 'initialUrl'],
  } as const,
};

/**
 * start_debug_session
 *
 * Starts a simple debug session for manual instrumentation.
 */
export const startDebugSessionTool = {
  name: 'start_debug_session',
  description: `Start a simple debug session for manual instrumentation (no Playwright browser).

**CRITICAL - READ THIS BEFORE CALLING:**
1. **BEFORE starting the session, add instrumentation that sends logs to /api/sessions/ingest**
2. Call live_debug_gateway_health() FIRST to get the instrumentation details
3. Verify the telemetry sink is receiving logs and ready to attach them to the session
4. ONLY THEN call this tool to start the session
5. The session should start when the telemetry sink is already receiving logs

**What happens when you call this tool:**
- A debug_gateway session is created for receiving server logs
- NO Playwright browser is launched
- The main browser opens with http://localhost:4567/#/session/{id} for viewing
- Logs sent to /api/sessions/ingest are automatically associated with this session

**Use this when:**
- You only need to ingest server-side logs without browser automation
- You want to debug backend services, scripts, or testing suites

**After the session starts:**
- The user can interact with the application in the main browser
- Events are recorded automatically
- Send additional logs to: /api/sessions/ingest
- When done, call stop_session() to save the session.`,
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Session name (ASCII only, will be normalized)',
      },
    },
    required: ['name'],
  } as const,
};

/**
 * stop_session
 *
 * Stops a session and saves it.
 */
export const stopSessionTool = {
  name: 'stop_session',
  description: `Stop a session and save it.

Stops the recording, closes the browser (if applicable), and saves all events to disk.
Returns statistics about the session (event counts by type).`,
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID to stop',
      },
    },
    required: ['sessionId'],
  } as const,
};

/**
 * get_session_metadata
 *
 * Gets metadata for a session.
 */
export const getSessionMetadataTool = {
  name: 'get_session_metadata',
  description: `Get metadata for a session.

Returns session information including:
- Session ID, name, status
- Start time, creation time
- Configuration
- Event counts`,
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID to query',
      },
    },
    required: ['sessionId'],
  } as const,
};

/**
 * get_session_logs
 *
 * Generates canonical context file from session events.
 * Uses backend export-context endpoint for exact parity with UI export.
 */
export const getSessionLogsTool = {
  name: 'get_session_logs',
  description: `Generate an optimized plain-text context file for a session.

User impact: generates a new optimized .txt context file for analysis; it does not display the events directly.

Important:
- Do NOT read events.json (too noisy). Always use the generated context file.
- filter/includeTypes means: include ONLY those event types.
- If the user requests "without NETWORK": do NOT set filter=NETWORK. Instead include CONSOLE, ACTION, SERVER_LOG, NOTE.

Return:
- contextFilePath and filteredEventCount
- short instructions: "read this file"`,
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Session ID to generate context from',
      },
      eventIds: {
        type: 'string',
        description: 'Comma-separated list of specific event IDs to include (optional, takes priority over filter/search)',
      },
      includeTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of event types to include (preferred).',
      },
      filter: {
        type: 'string',
        description: 'Legacy single event type filter: ACTION, CONSOLE, NETWORK, NOTE, SCREENSHOT, SNAPSHOT, FLAG, BUG, SERVER_LOG (optional)',
      },
      search: {
        type: 'string',
        description: 'Text search in event messages (optional)',
      },
    },
    required: ['sessionId'],
  } as const,
};

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Handler for start_fullstack_debug_session
 */
export async function handleStartFullstackDebugSession(args: unknown): Promise<string> {
  const schema = z.object({
    name: z.string().min(1),
    initialUrl: z.string().url(),
    browserProfile: z.string().optional(),
    recordNetwork: z.boolean().optional(),
    recordConsole: z.boolean().optional(),
  });

  const { name, initialUrl, browserProfile, recordNetwork = false, recordConsole = false } = schema.parse(args);

  logger.toolCall('start_fullstack_debug_session', { name, initialUrl, browserProfile, recordNetwork, recordConsole });

  try {
    // Get or create workspace for CLIENT_CWD
    const { id: workspaceHash } = await getOrCreateWorkspace();

    // Create session with workspace hash in header
    const response = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: 'POST',
      headers: getHeaders(workspaceHash),
      body: JSON.stringify({
        sessionType: 'browser',
        initialUrl,
        name,
        credentialId: browserProfile, // Support both credentialId and profileId
        recordVideo: false, // NO video from MCP
        recordActions: true, // ALWAYS true
        recordConsole,
        recordNetwork,
        snapshotOnScreenshot: false, // DISABLED from MCP
        snapshotOnReload: false, // DISABLED from MCP
        recordingMode: 'browser',
        resolution: 'Dynamic', // No forced viewport dimensions
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${response.status} ${errorText}`);
    }

    const session = await response.json() as SessionResponse;

    // Open main browser with workspace-aware URL
    await openSessionInBrowser(session.id, workspaceHash);

    logger.toolSuccess('start_fullstack_debug_session');
    logger.info('Session created', { sessionId: session.id, name, workspaceHash });

    return JSON.stringify({
      message: 'Fullstack debug session started successfully',
      sessionId: session.id,
      name: session.name,
      status: session.status,
      initialUrl,
      workspaceHash,
      frontendUrl: `http://localhost:4567/#/workspace/${workspaceHash}/session/${session.id}`,
      telemetryEndpoint: `${BACKEND_URL}/api/sessions/ingest`,
      config: {
        recordVideo: false,
        recordActions: true,
        recordConsole,
        recordNetwork,
        snapshotOnScreenshot: false,
        snapshotOnReload: false,
      },
      instructions: [
        '✓ Main browser opened with Terrific session',
        '✓ Playwright browser instance launched',
        '✓ Telemetry endpoint /api/sessions/ingest is ready to receive logs for this session',
        'You can interact with the application.',
        'Events will be recorded automatically.',
        `Send additional logs to: ${BACKEND_URL}/api/sessions/ingest`,
        'When done, call stop_session() to save the session.',
      ],
    }, null, 2);
  } catch (error) {
    logger.toolError('start_fullstack_debug_session', error);
    throw error;
  }
}

/**
 * Handler for start_debug_session
 */
export async function handleStartDebugSession(args: unknown): Promise<string> {
  const schema = z.object({
    name: z.string().min(1),
  });

  const { name } = schema.parse(args);

  logger.toolCall('start_debug_session', { name });

  try {
    // Get or create workspace for CLIENT_CWD
    const { id: workspaceHash } = await getOrCreateWorkspace();

    // Create simple debug session with workspace hash in header
    const response = await fetch(`${BACKEND_URL}/api/sessions`, {
      method: 'POST',
      headers: getHeaders(workspaceHash),
      body: JSON.stringify({
        sessionType: 'debug_gateway',
        initialUrl: 'http://placeholder',
        name,
        recordActions: false,
        recordConsole: false,
        recordNetwork: false,
        recordVideo: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${response.status} ${errorText}`);
    }

    const session = await response.json() as SessionResponse;

    // Open main browser with workspace-aware URL
    await openSessionInBrowser(session.id, workspaceHash);

    logger.toolSuccess('start_debug_session');
    logger.info('Debug session created', { sessionId: session.id, name, workspaceHash });

    return JSON.stringify({
      message: 'Debug session started successfully',
      sessionId: session.id,
      name: session.name,
      status: session.status,
      workspaceHash,
      frontendUrl: `http://localhost:4567/#/workspace/${workspaceHash}/session/${session.id}`,
      telemetryEndpoint: `${BACKEND_URL}/api/sessions/ingest`,
      instructions: [
        '✓ Main browser opened with Terrific session',
        '✓ Telemetry endpoint /api/sessions/ingest is ready to receive logs',
        'Session created for manual instrumentation.',
        'No Playwright browser was launched.',
        `Send logs to: ${BACKEND_URL}/api/sessions/ingest`,
        'When done, call stop_session() to save the session.',
      ],
    }, null, 2);
  } catch (error) {
    logger.toolError('start_debug_session', error);
    throw error;
  }
}

/**
 * Handler for stop_session
 */
export async function handleStopSession(args: unknown): Promise<string> {
  const schema = z.object({
    sessionId: z.string().min(1),
  });

  const { sessionId } = schema.parse(args);

  logger.toolCall('stop_session', { sessionId });

  try {
    // Try to get workspace from CLIENT_CWD (may fail if not using MCP)
    let workspaceHash: string | undefined;
    let sessionsDir: string | undefined;
    try {
      const workspace = await getOrCreateWorkspace();
      workspaceHash = workspace.id;
      sessionsDir = workspace.sessionsDir;
    } catch {
      // Ignore if workspace lookup fails (might not be using MCP)
    }

    const headers = getHeaders(workspaceHash);

    const response = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to stop session: ${response.status} ${errorText}`);
    }

    const result = await response.json() as SessionResponse;

    logger.toolSuccess('stop_session');
    logger.info('Session stopped', { sessionId, workspaceHash });

    // Get session metadata to return statistics
    const metadataResponse = await fetch(`${BACKEND_URL}/api/sessions/${sessionId}`, {
      headers,
    });
    const session = await metadataResponse.json() as SessionResponse;

    // Count events by type
    const eventCounts: Record<string, number> = {};
    for (const event of session.events || []) {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    }

    // Construct full session path
    const baseDir = sessionsDir || config.sessionsDir;
    const dirName = result.sessionDirName || sessionId;
    const sessionPath = join(baseDir, dirName);

    return JSON.stringify({
      message: result.message || 'Session stopped and saved',
      sessionId,
      sessionDirName: result.sessionDirName,
      sessionPath,
      contextPath: result.contextFilePath,
      workspaceHash,
      replayUrl: workspaceHash
        ? `http://localhost:4567/#/workspace/${workspaceHash}/replay/${sessionId}`
        : `http://localhost:4567/#/replay/${sessionId}`,
      statistics: {
        totalEvents: session.events?.length || 0,
        eventsByType: eventCounts,
      },
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        startTime: session.startTime,
        createdAt: session.createdAt,
      },
      note: result.contextFilePath
        ? `Context file generated automatically at ${result.contextFilePath}. Read this file instead of events.json.`
        : 'Note: Context file generation failed automatically. Use get_session_logs to generate it.',
    }, null, 2);
  } catch (error) {
    logger.toolError('stop_session', error);
    throw error;
  }
}

/**
 * Handler for get_session_metadata
 */
export async function handleGetSessionMetadata(args: unknown): Promise<string> {
  const schema = z.object({
    sessionId: z.string().min(1),
  });

  const { sessionId } = schema.parse(args);

  logger.toolCall('get_session_metadata', { sessionId });

  try {
    // Get workspace context to search in the correct sessions directory
    const workspaceResult = await getOrCreateWorkspace();
    const { id: workspaceHash } = workspaceResult;

    const url = `${BACKEND_URL}/api/sessions/${sessionId}`;

    const response = await fetch(url, {
      headers: getHeaders(workspaceHash),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get session: ${response.status} ${errorText}`);
    }

    const session = await response.json() as SessionResponse;

    logger.toolSuccess('get_session_metadata');

    // Count events by type
    const eventCounts: Record<string, number> = {};
    for (const event of session.events || []) {
      eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
    }

    return JSON.stringify({
      id: session.id,
      name: session.name,
      description: session.description,
      status: session.status,
      startTime: session.startTime,
      createdAt: session.createdAt,
      initialUrl: session.config?.initialUrl,
      config: session.config,
      eventCounts,
      totalEvents: session.events?.length || 0,
      hasVideo: !!session.videoFilename,
      hasScreenshots: (session.events || []).some((e: QAEvent) => e.type === 'SCREENSHOT'),
    }, null, 2);
  } catch (error) {
    logger.toolError('get_session_metadata', error);
    throw error;
  }
}

/**
 * Handler for get_session_logs
 * Uses export-context endpoint to guarantee canonical output
 */
export async function handleGetSessionLogs(args: unknown): Promise<string> {
  const schema = z.object({
    sessionId: z.string().min(1),
    eventIds: z.string().optional(),
    includeTypes: z.array(z.string()).optional(),
    filter: z.string().optional(),
    search: z.string().optional(),
  });

  const { sessionId, eventIds, includeTypes, filter, search } = schema.parse(args);

  logger.toolCall('get_session_logs', { sessionId, eventIds, filter, search });

  try {
    // Get workspace context for correct session resolution
    const workspaceResult = await getOrCreateWorkspace();
    const { id: workspaceHash, sessionsDir } = workspaceResult;

    const sessionUrl = `${BACKEND_URL}/api/sessions/${sessionId}`;

    const sessionResponse = await fetch(sessionUrl, {
      headers: getHeaders(workspaceHash),
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`Failed to get session: ${sessionResponse.status} ${errorText}`);
    }

    const session = await sessionResponse.json() as SessionResponse;

    // Build filter set. Default behavior is no filters (all events).
    let filteredEvents = session.events || [];

    if (eventIds) {
      const eventIdSet = new Set(eventIds.split(',').map(id => id.trim()));
      filteredEvents = filteredEvents.filter((e: QAEvent) => eventIdSet.has(e.id));
    } else if (includeTypes && includeTypes.length > 0) {
      // Priority 2: Include types (preferred)
      const typeSet = new Set(includeTypes);
      filteredEvents = filteredEvents.filter((e: QAEvent) => typeSet.has(e.type));
    } else {
      // Priority 3: Legacy single filter
      if (filter) {
        filteredEvents = filteredEvents.filter((e: QAEvent) => e.type === filter);
      }
    }

    // Priority 4: Search in messages (after type filtering)
    if (search) {
      const searchLower = search.toLowerCase();
      filteredEvents = filteredEvents.filter((e: QAEvent) =>
        (e.message || '').toLowerCase().includes(searchLower)
      );
    }

    const query = new URLSearchParams();
    if (filteredEvents.length !== (session.events || []).length) {
      query.set('eventIds', filteredEvents.map((event) => event.id).join(','));
    }

    const exportUrl = `${BACKEND_URL}/api/sessions/${sessionId}/export-context${query.size > 0 ? `?${query.toString()}` : ''}`;
    const exportResponse = await fetch(exportUrl, {
      headers: getHeaders(workspaceHash),
    });

    if (!exportResponse.ok) {
      const errorText = await exportResponse.text();
      throw new Error(`Failed to export context: ${exportResponse.status} ${errorText}`);
    }

    const contentDisposition = exportResponse.headers.get('content-disposition') || '';
    const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
    const contextFilename = filenameMatch?.[1] || 'context.txt';
    const sessionDirName = session.sessionDirName || getSessionDirName(sessionId, session.createdAt);
    const baseDir = sessionsDir || config.sessionsDir;
    const contextPath = join(baseDir, sessionDirName, contextFilename);

    await exportResponse.text();

    logger.toolSuccess('get_session_logs');

    return JSON.stringify({
      message: 'Context generated successfully',
      sessionId,
      name: session.name,
      eventIds: eventIds || 'none',
      includeTypes: includeTypes || [],
      filter: filter || 'none',
      search: search || 'none',
      totalEvents: session.events?.length || 0,
      filteredEventCount: filteredEvents.length,
      contextFilePath: contextPath,
      modelInstructions: [
        `Read the context file at ${contextPath}. Do not read events.json.`,
        'Default behavior uses all events and relies on optimizer.',
      ],
      instructions: [
        `Context saved to: ${contextPath}`,
        'Use your file reading tool to retrieve the content.',
      ],
    }, null, 2);
  } catch (error) {
    logger.toolError('get_session_logs', error);
    throw error;
  }
}
