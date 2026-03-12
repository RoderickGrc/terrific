import { Request, Response } from 'express';
import { networkInterfaces } from 'os';
import { SessionConfig, Session, BrowserSession, QAEvent, EventType, SessionContext } from '../types/index.js';
import { config, getSessionDirName } from '../config.js';
import { generateShortId, generateEventId } from '../utils/id.js';
import { PlaywrightService } from '../services/playwright.js';
import { EventRecorder } from '../services/recorder.js';
import { ScreenRecorder } from '../services/screenRecorder.js';
import { StorageService } from '../services/storage.js';
import { WorkspaceRegistry } from '../services/workspaceRegistry.js';
import { generateQaReport } from '../services/qaReport.js';
import { ContextService } from '../services/contextService.js';
import { applyFilterPolicyToEvents, resolveFilterPolicy } from '../services/filtersPolicy.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import multer from 'multer';

// Configure multer for memory storage (we'll save manually to session dir)
const upload = multer({ storage: multer.memoryStorage() });

class WorkspaceNotFoundError extends Error {
  workspaceHash: string;

  constructor(workspaceHash: string) {
    super(`workspace not found: ${workspaceHash}`);
    this.name = 'WorkspaceNotFoundError';
    this.workspaceHash = workspaceHash;
  }
}

export class SessionController {
  private sessions: Map<string, BrowserSession> = new Map();
  private recorders: Map<string, EventRecorder> = new Map();
  private playwrightServices: Map<string, PlaywrightService> = new Map();
  private screenRecorders: Map<string, ScreenRecorder> = new Map();
  private storageService: StorageService;
  private workspaceRegistry: WorkspaceRegistry;
  private contextService: ContextService;
  private eventEmitter: ((sessionId: string, event: any) => void) | null = null;
  constructor() {
    this.storageService = new StorageService();
    this.workspaceRegistry = WorkspaceRegistry.getInstance();
    this.contextService = new ContextService();
  }

  /**
   * Get workspace from request (from X-Workspace-Hash header or query param).
   * Returns null if no workspace is specified (uses default backend directory).
   */
  private getWorkspaceHashFromRequest(req: Request): string | null {
    const headerHash = req.headers['x-workspace-hash'] as string | undefined;
    const queryHash = req.query.workspace as string | undefined;
    return headerHash || queryHash || null;
  }

  private getWorkspaceFromRequest(req: Request): { id: string; path: string } | null {
    const hash = this.getWorkspaceHashFromRequest(req);

    if (!hash) {
      return null;
    }

    const workspace = this.workspaceRegistry.getWorkspace(hash);
    if (!workspace) {
      return null;
    }

    return { id: workspace.id, path: workspace.path };
  }

  private assertWorkspaceExistsForRequest(req: Request): void {
    const hash = this.getWorkspaceHashFromRequest(req);
    if (!hash) {
      return;
    }

    const workspace = this.workspaceRegistry.getWorkspace(hash);
    if (!workspace) {
      throw new WorkspaceNotFoundError(hash);
    }
  }

  /**
   * Get the sessions directory for a specific request based on workspace.
   */
  private getSessionsDir(req: Request): string {
    const workspace = this.getWorkspaceFromRequest(req);

    if (workspace) {
      const sessionsDir = join(workspace.path, 'sessions');
      return sessionsDir;
    }

    // Fallback to default config sessionsDir
    return config.sessionsDir;
  }

  /**
   * Configure storage service to use the correct sessions directory for this request.
   * Must be called before any storage operations.
   */
  private configureStorageForRequest(req: Request): void {
    this.assertWorkspaceExistsForRequest(req);
    const sessionsDir = this.getSessionsDir(req);
    this.storageService.setSessionsDir(sessionsDir);
  }

  private ensureStorageForRequest(req: Request, res: Response): boolean {
    try {
      this.configureStorageForRequest(req);
      return true;
    } catch (error) {
      if (error instanceof WorkspaceNotFoundError) {
        res.status(404).json({ error: 'workspace not found', workspaceHash: error.workspaceHash });
        return false;
      }
      throw error;
    }
  }

  /**
   * Create a SessionContext for a new session.
   * This encapsulates all session-scoped information including workspace-specific paths.
   */
  private createSessionContext(
    sessionId: string,
    createdAt: string,
    req: Request
  ): SessionContext {
    const workspace = this.getWorkspaceFromRequest(req);
    const sessionsDir = workspace
      ? join(workspace.path, 'sessions')
      : config.sessionsDir;
    
    const sessionDirName = getSessionDirName(sessionId, createdAt);
    const sessionDir = join(sessionsDir, sessionDirName);

    return {
      sessionId,
      sessionsDir,
      sessionDirName,
      sessionDir,
      createdAt,
      workspaceHash: workspace?.id,
    };
  }

  setEventEmitter(emitter: (sessionId: string, event: any) => void) {
    this.eventEmitter = emitter;
  }

  async createSession(req: Request, res: Response): Promise<void> {
    try {
      // Configure storage directory based on workspace before creating session
      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // Get workspace from request to store in session
      const workspace = this.getWorkspaceFromRequest(req);
      const workspaceHash = workspace?.id;

      const config: SessionConfig = req.body;
      const sessionType = config.sessionType || 'browser';

      // Validate required fields (except for debug_gateway which doesn't need real URL)
      if (!config.initialUrl || !config.initialUrl.trim()) {
        res.status(400).json({ error: 'initialUrl is required and cannot be empty' });
        return;
      }

      // Validate URL format (skip for debug_gateway)
      if (sessionType !== 'debug_gateway') {
        const url = config.initialUrl.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          res.status(400).json({ error: 'initialUrl must start with http:// or https://' });
          return;
        }
      }

      const sessionId = generateShortId(10);
      const startTime = Date.now();
      const createdAt = new Date().toISOString();

      // Create session context with workspace-specific paths
      const sessionContext = this.createSessionContext(sessionId, createdAt, req);

      // Ensure session directory exists immediately
      await fs.mkdir(sessionContext.sessionDir, { recursive: true });

      // #region agent log
      const logOrchestration = async (event: string, data: any) => {
        const logData = JSON.stringify({
          location: 'session.ts:createSession',
          message: `[ORCHESTRATION] ${event}`,
          data: { sessionId, timestamp: Date.now(), ...data },
          timestamp: Date.now(),
          sessionId: sessionId,
          runId: 'orchestration',
          hypothesisId: 'ORCH'
        });
        const logPath = join(process.cwd(), '.cursor', 'debug.log');
        try {
          await fs.appendFile(logPath, logData + '\n', 'utf8');
        } catch (e) {
          // Ignore file write errors
        }
      };
      await logOrchestration('SESSION_CREATE_START', { recordingMode: config.recordingMode, recordVideo: config.recordVideo });
      // #endregion

      const session: Session = {
        id: sessionId,
        name: config.name,
        status: 'recording',
        startTime,
        createdAt,
        config,
        events: [],
      };

      // Handle debug_gateway sessions (no browser)
      if (sessionType === 'debug_gateway') {
        console.log(`[Session] Creating debug gateway session: ${sessionId}`);

        // Create minimal session without browser
        const debugSession: BrowserSession = {
          sessionId,
          name: config.name,
          browser: null,
          context: null,
          page: null,
          config,
          startTime,
          createdAt,
          events: [],
          isPaused: false,
          sessionContext,
        };

        this.sessions.set(sessionId, debugSession);
        // Persist immediately so storage-backed routes (notes, etc.) work during the session
        await this.storageService.saveSession(session, sessionContext.sessionsDir);
        res.json(session);
        return;
      }

      // Handle browser sessions
      // For screen recording mode, delay browser launch until recording starts
      // For browser recording mode, launch immediately
      const shouldDelayBrowserLaunch = config.recordingMode === 'screen' && config.recordVideo;

      if (shouldDelayBrowserLaunch) {
        // Create session without browser - browser will be launched after recording starts
        const browserSession: BrowserSession = {
          sessionId,
          name: config.name,
          browser: null,
          context: null,
          page: null,
          config,
          startTime,
          createdAt,
          events: [],
          isPaused: false,
          sessionContext,
        };
        this.sessions.set(sessionId, browserSession);

        // #region agent log
        await logOrchestration('SESSION_CREATED_WAITING_FOR_RECORDING', { message: 'Browser launch delayed until recording starts' });
        // #endregion
      } else {
        // Launch browser immediately for browser recording mode
        // Support both credentialId (legacy) and profileId (new) 
        const credentialId = (config as any).profileId || config.credentialId;

        const playwrightService = new PlaywrightService();
        let browser, context, page;

        try {
          let storageState: any = undefined;
          if (credentialId) {
            const { CredentialsService } = await import('../services/credentials.js');
            const credentialsService = CredentialsService.getInstance();
            const credential = await credentialsService.getById(credentialId);
            if (credential?.storageState) {
              storageState = JSON.parse(credential.storageState);
              console.log(`[Session] Applying storage state from credential: ${credential.alias}`);
            }
          }

          // #region agent log
          await logOrchestration('PLAYWRIGHT_BROWSER_LAUNCH_START', {});
          // #endregion

          const result = await playwrightService.launchBrowser(config, sessionContext, storageState);
          browser = result.browser;
          context = result.context;
          page = result.page;
          this.playwrightServices.set(sessionId, playwrightService);

          // #region agent log
          await logOrchestration('PLAYWRIGHT_BROWSER_OPENED', { url: config.initialUrl });
          // #endregion
        } catch (error) {
          console.error('Error launching browser:', error);
          res.status(500).json({
            error: 'Failed to launch browser',
            details: error instanceof Error ? error.message : String(error)
          });
          return;
        }

        // Create event recorder
        let recorder;
        try {
          // #region agent log
          await logOrchestration('EVENT_RECORDER_CREATE_START', {});
          // #endregion

          recorder = new EventRecorder(page, {
            recordActions: config.recordActions,
            recordConsole: config.recordConsole,
            recordNetwork: config.recordNetwork,
            snapshotOnReload: config.snapshotOnReload,
            snapshotOnScreenshot: config.snapshotOnScreenshot,
          }, sessionContext);
          this.recorders.set(sessionId, recorder);

          // #region agent log
          await logOrchestration('EVENT_RECORDER_CREATED', {});
          // #endregion
        } catch (error) {
          console.error('Error setting up event recorder:', error);
          // Continue even if recorder setup fails - browser is still open
          // User can still interact with browser manually
        }

        // Setup event forwarding
        const browserSession: BrowserSession = {
          sessionId,
          name: config.name,
          browser,
          context,
          page,
          config,
          startTime,
          createdAt,
          events: [],
          isPaused: false,
          sessionContext,
        };

        this.sessions.set(sessionId, browserSession);

        // Listen to recorder events and store them + emit via WebSocket
        if (recorder) {
          // Remove any existing listeners to prevent duplicates
          recorder.removeAllListeners('event');
          let firstEventEmitted = false;
          recorder.on('event', async (event) => {
            const bs = this.sessions.get(sessionId);
            if (bs) {
              bs.events.push(event);
            }

            // #region agent log
            if (!firstEventEmitted) {
              firstEventEmitted = true;
              const logData = JSON.stringify({
                location: 'session.ts:recorder.on',
                message: '[ORCHESTRATION] FIRST_PLAYWRIGHT_EVENT_RECEIVED',
                data: { sessionId, eventType: event.type, eventId: event.id, timestamp: Date.now() },
                timestamp: Date.now(),
                sessionId: sessionId,
                runId: 'orchestration',
                hypothesisId: 'ORCH'
              });
              const logPath = join(process.cwd(), '.cursor', 'debug.log');
              try {
                await fs.appendFile(logPath, logData + '\n', 'utf8');
              } catch (e) {
                // Ignore file write errors
              }
            }
            // #endregion

            // Emit to WebSocket if emitter is set
            if (this.eventEmitter) {
              this.eventEmitter(sessionId, event);
            }
          });
        }
      }

      // NOTE: When recordingMode === 'screen', the frontend uses getDisplayMedia() API
      // FFmpeg should NOT be started here - it's handled by the browser API on the frontend
      // FFmpeg is only used for server-side recording scenarios (not implemented in this flow)
      // The frontend will upload the recorded video via POST /api/sessions/:id/screen-recording

      res.json(session);
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({
        error: 'Failed to create session',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Start browser for a session (called after recording starts for screen mode)
   */
  async startBrowser(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { recordingStartTime } = req.body;

      // Get session
      const browserSession = this.sessions.get(id);
      if (!browserSession) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Session context is already stored in browserSession.sessionContext
      // No need to restore or reconfigure storage

      // Check if browser is already started (with more detailed logging)
      if (browserSession.browser) {
        console.log(`[Session] Browser already started for session ${id}, ignoring duplicate start request`);
        // #region agent log
        const logData = JSON.stringify({
          location: 'session.ts:startBrowser',
          message: '[ORCHESTRATION] START_BROWSER_DUPLICATE_IGNORED',
          data: { sessionId: id, timestamp: Date.now() },
          timestamp: Date.now(),
          sessionId: id,
          runId: 'orchestration',
          hypothesisId: 'ORCH'
        });
        const logPath = join(process.cwd(), '.cursor', 'debug.log');
        try {
          await fs.appendFile(logPath, logData + '\n', 'utf8');
        } catch (e) {
          // Ignore file write errors
        }
        // #endregion
        res.status(200).json({ message: 'Browser already started' });
        return;
      }

      // Update session startTime to match recording start time for synchronization
      if (recordingStartTime && typeof recordingStartTime === 'number') {
        const oldStartTime = browserSession.startTime;
        const timeDiff = recordingStartTime - oldStartTime;

        // Update startTime
        browserSession.startTime = recordingStartTime;

        // Adjust all existing event timestamps to be relative to the new startTime
        // Events are stored with absolute timestamps, so we need to adjust them
        // by subtracting the time difference
        browserSession.events.forEach(event => {
          const eventTime = new Date(event.timestamp).getTime();
          const adjustedTime = eventTime - timeDiff;
          event.timestamp = new Date(adjustedTime).toISOString();
        });

        console.log(`[Session] Updated session startTime from ${oldStartTime} to ${recordingStartTime} (diff: ${timeDiff}ms)`);

        // #region agent log
        const logData = JSON.stringify({
          location: 'session.ts:startBrowser',
          message: '[ORCHESTRATION] SESSION_STARTTIME_UPDATED',
          data: { sessionId: id, oldStartTime, newStartTime: recordingStartTime, timeDiff, adjustedEvents: browserSession.events.length },
          timestamp: Date.now(),
          sessionId: id,
          runId: 'orchestration',
          hypothesisId: 'ORCH'
        });
        const logPath = join(process.cwd(), '.cursor', 'debug.log');
        try {
          await fs.appendFile(logPath, logData + '\n', 'utf8');
        } catch (e) {
          // Ignore file write errors
        }
        // #endregion
      }

      const config = browserSession.config;
      const sessionId = browserSession.sessionId;
      const createdAt = browserSession.createdAt || new Date(browserSession.startTime).toISOString();

      // #region agent log
      const logOrchestration = async (event: string, data: any) => {
        const logData = JSON.stringify({
          location: 'session.ts:startBrowser',
          message: `[ORCHESTRATION] ${event}`,
          data: { sessionId, timestamp: Date.now(), ...data },
          timestamp: Date.now(),
          sessionId: sessionId,
          runId: 'orchestration',
          hypothesisId: 'ORCH'
        });
        const logPath = join(process.cwd(), '.cursor', 'debug.log');
        try {
          await fs.appendFile(logPath, logData + '\n', 'utf8');
        } catch (e) {
          // Ignore file write errors
        }
      };
      await logOrchestration('START_BROWSER_CALLED', {});
      // #endregion

      // Support both credentialId (legacy) and profileId (new)
      const credentialId = (config as any).profileId || config.credentialId;
      const playwrightService = new PlaywrightService();
      let browser, context, page;

      try {
        let storageState: any = undefined;
        if (credentialId) {
          const { CredentialsService } = await import('../services/credentials.js');
          const credentialsService = CredentialsService.getInstance();
          const credential = await credentialsService.getById(credentialId);
          if (credential?.storageState) {
            storageState = JSON.parse(credential.storageState);
            console.log(`[Session] Applying storage state from credential: ${credential.alias}`);
          }
        }

        // #region agent log
        await logOrchestration('PLAYWRIGHT_BROWSER_LAUNCH_START', {});
        // #endregion

        const result = await playwrightService.launchBrowser(config, browserSession.sessionContext, storageState);
        browser = result.browser;
        context = result.context;
        page = result.page;
        this.playwrightServices.set(sessionId, playwrightService);

        // #region agent log
        await logOrchestration('PLAYWRIGHT_BROWSER_OPENED', { url: config.initialUrl });
        // #endregion
      } catch (error) {
        console.error('Error launching browser:', error);
        res.status(500).json({
          error: 'Failed to launch browser',
          details: error instanceof Error ? error.message : String(error)
        });
        return;
      }

      // Create event recorder
      let recorder;
      try {
        // #region agent log
        await logOrchestration('EVENT_RECORDER_CREATE_START', {});
        // #endregion

        recorder = new EventRecorder(page, {
          recordActions: config.recordActions,
          recordConsole: config.recordConsole,
          recordNetwork: config.recordNetwork,
          snapshotOnReload: config.snapshotOnReload,
          snapshotOnScreenshot: config.snapshotOnScreenshot,
        }, browserSession.sessionContext);
        this.recorders.set(sessionId, recorder);

        // #region agent log
        await logOrchestration('EVENT_RECORDER_CREATED', {});
        // #endregion
      } catch (error) {
        console.error('Error setting up event recorder:', error);
        // Continue even if recorder setup fails - browser is still open
      }

      // Update browser session with browser instance
      browserSession.browser = browser;
      browserSession.context = context;
      browserSession.page = page;

      // Listen to recorder events and store them + emit via WebSocket
      if (recorder) {
        recorder.removeAllListeners('event');
        let firstEventEmitted = false;
        recorder.on('event', async (event) => {
          const bs = this.sessions.get(sessionId);
          if (bs) {
            bs.events.push(event);
          }

          // #region agent log
          if (!firstEventEmitted) {
            firstEventEmitted = true;
            const logData = JSON.stringify({
              location: 'session.ts:startBrowser.recorder.on',
              message: '[ORCHESTRATION] FIRST_PLAYWRIGHT_EVENT_RECEIVED',
              data: { sessionId, eventType: event.type, eventId: event.id, timestamp: Date.now() },
              timestamp: Date.now(),
              sessionId: sessionId,
              runId: 'orchestration',
              hypothesisId: 'ORCH'
            });
            const logPath = join(process.cwd(), '.cursor', 'debug.log');
            try {
              await fs.appendFile(logPath, logData + '\n', 'utf8');
            } catch (e) {
              // Ignore file write errors
            }
          }
          // #endregion

          // Emit to WebSocket if emitter is set
          if (this.eventEmitter) {
            this.eventEmitter(sessionId, event);
          }
        });
      }

      res.json({ message: 'Browser started successfully' });
    } catch (error) {
      console.error('Error starting browser:', error);
      res.status(500).json({
        error: 'Failed to start browser',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Configure storage directory based on workspace before accessing storage
      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // First, check if session is active in memory
      const browserSession = this.sessions.get(id);
      if (browserSession) {
        // Convert BrowserSession to Session format
        const session: Session = {
          id: browserSession.sessionId,
          name: browserSession.name,
          description: browserSession.description,
          status: browserSession.isPaused ? 'paused' : 'recording',
          startTime: browserSession.startTime,
          createdAt: browserSession.createdAt,
          config: browserSession.config,
          events: browserSession.events,
        };
        res.json(session);
        return;
      }

      // If not found in memory, try storage (saved sessions)
      const session = await this.storageService.getSession(id);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json(session);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get session', details: error instanceof Error ? error.message : String(error) });
    }
  }

  async listSessions(req: Request, res: Response): Promise<void> {
    try {
      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }
      const sessions = await this.storageService.listSessions();
      res.json(sessions);
    } catch (error) {
      console.error('Error listing sessions:', error);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  }

  /**
   * Get paginated events for a session
   * Query params: offset (default 0), limit (default 500)
   */
  async getSessionEventsPaginated(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 500;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // First check active session in memory
      const browserSession = this.sessions.get(id);
      if (browserSession) {
        const totalEvents = browserSession.events.length;
        const paginatedEvents = browserSession.events.slice(offset, offset + limit);

        res.json({
          events: paginatedEvents,
          pagination: {
            offset,
            limit,
            total: totalEvents,
            hasMore: offset + limit < totalEvents
          }
        });
        return;
      }

      // Otherwise get from storage
      const session = await this.storageService.getSession(id, true);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const totalEvents = session.events.length;
      const paginatedEvents = session.events.slice(offset, offset + limit);

      res.json({
        events: paginatedEvents,
        pagination: {
          offset,
          limit,
          total: totalEvents,
          hasMore: offset + limit < totalEvents
        }
      });
    } catch (error) {
      console.error('Error getting paginated events:', error);
      res.status(500).json({
        error: 'Failed to get paginated events',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get the latest N events from a session
   * Query param: count (default 100)
   */
  async getLatestEvents(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const count = parseInt(req.query.count as string) || 100;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // First check active session in memory
      const browserSession = this.sessions.get(id);
      if (browserSession) {
        const latestEvents = browserSession.events.slice(-count);

        res.json({
          events: latestEvents,
          total: browserSession.events.length
        });
        return;
      }

      // Otherwise get from storage
      const session = await this.storageService.getSession(id, true);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const latestEvents = session.events.slice(-count);

      res.json({
        events: latestEvents,
        total: session.events.length
      });
    } catch (error) {
      console.error('Error getting latest events:', error);
      res.status(500).json({
        error: 'Failed to get latest events',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async stopSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const browserSession = this.sessions.get(id);

      if (!browserSession) {
        res.status(404).json({ error: 'Session not found or already stopped' });
        return;
      }

      // Get session context
      const ctx = browserSession.sessionContext;

      // Close browser
      const playwrightService = this.playwrightServices.get(id);
      if (playwrightService) {
        try {
          await playwrightService.close();
          this.playwrightServices.delete(id);
        } catch (closeError) {
          console.error('Error closing browser:', closeError);
          // Continue even if browser close fails
        }
      }

      // Stop screen recording if active
      const screenRecorder = this.screenRecorders.get(id);
      if (screenRecorder && screenRecorder.isActivelyRecording()) {
        try {
          console.log(`[Session] Stopping screen recording for session ${id}`);
          const videoPath = await screenRecorder.stopRecording();
          console.log(`[Session] Screen recording saved to: ${videoPath}`);
          this.screenRecorders.delete(id);
        } catch (screenRecError) {
          console.error('[Session] Error stopping screen recording:', screenRecError);
          // Continue even if screen recording stop fails
        }
      }

      // Save session
      const session: Session = {
        id: browserSession.sessionId,
        name: browserSession.name,
        description: browserSession.description,
        status: 'completed',
        startTime: browserSession.startTime,
        createdAt: browserSession.createdAt || new Date(browserSession.startTime).toISOString(),
        config: browserSession.config,
        events: browserSession.events,
      };

      const resolvedFilters = resolveFilterPolicy(ctx.sessionsDir);
      const postProcessResult = applyFilterPolicyToEvents(session.events, resolvedFilters.policy);
      session.events = postProcessResult.events;

      // Save session using context's sessionsDir
      const sessionDirName = await this.storageService.saveSession(session, ctx.sessionsDir);

      let contextFilePath: string | undefined;
      let contextFilename: string | undefined;
      try {
        const savedContext = await this.contextService.saveContextFile(session, {
          sessionsDir: ctx.sessionsDir,
          sessionDirName,
        });
        contextFilePath = savedContext.contextFilePath;
        contextFilename = savedContext.filename;
      } catch (contextError) {
        console.error('[Stop Session] Failed to generate canonical context file:', contextError);
      }

      // Build redirect URL with workspace context if available
      // Use session.id (UUID) for cleaner URLs instead of sessionDirName
      const redirectTo = ctx.workspaceHash
        ? `/workspace/${ctx.workspaceHash}/replay/${id}`
        : `/replay/${id}`;

      // Emit SESSION_STOPPED event via WebSocket to trigger frontend redirect
      const stoppedEvent: QAEvent = {
        id: generateEventId('stop'),
        type: EventType.SESSION_STOPPED,
        message: 'Session stopped',
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          sessionId: id,
          sessionDirName: sessionDirName,
          workspaceHash: ctx.workspaceHash,
          redirectTo,
        }),
      };

      if (this.eventEmitter) {
        this.eventEmitter(id, stoppedEvent);
      }

      // Remove from active sessions
      this.sessions.delete(id);
      this.recorders.delete(id);

      res.json({ message: 'Session stopped and saved', sessionId: id, sessionDirName, contextFilePath, contextFilename });
    } catch (error) {
      console.error('Error stopping session:', error);
      res.status(500).json({ error: 'Failed to stop session', details: String(error) });
    }
  }

  async pauseSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const browserSession = this.sessions.get(id);

      if (!browserSession) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      browserSession.isPaused = true;
      res.json({ message: 'Session paused', sessionId: id });
    } catch (error) {
      console.error('Error pausing session:', error);
      res.status(500).json({ error: 'Failed to pause session' });
    }
  }

  async resumeSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const browserSession = this.sessions.get(id);

      if (!browserSession) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      browserSession.isPaused = false;
      res.json({ message: 'Session resumed', sessionId: id });
    } catch (error) {
      console.error('Error resuming session:', error);
      res.status(500).json({ error: 'Failed to resume session' });
    }
  }

  async addNote(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { message, type, timestamp } = req.body;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      const browserSession = this.sessions.get(id);
      const recorder = this.recorders.get(id);

      // Session context is already stored in browserSession.sessionContext
      // No need to restore workspace context

      let noteEvent: QAEvent;

      // Handle active session (with recorder)
      if (browserSession && recorder) {
        if (type === 'FLAG') {
          noteEvent = recorder.addFlag(message || 'Flagged point');
        } else if (type === 'BUG') {
          noteEvent = recorder.addBug(message || 'Bug reported');
        } else {
          noteEvent = recorder.addNote(message || 'Note added');
        }
        res.json(noteEvent);
        return;
      }

      // Handle active session without recorder (e.g., debug_gateway)
      if (browserSession && !recorder) {
        const ts = timestamp || Date.now();
        noteEvent = {
          id: generateEventId(type === 'FLAG' ? 'flag' : type === 'BUG' ? 'bug' : 'note'),
          type: (type || 'NOTE') as EventType,
          message: message || (type === 'FLAG' ? 'Flagged point' : type === 'BUG' ? 'Bug reported' : 'Note added'),
          timestamp: new Date(ts).toISOString(),
        };

        // Add to in-memory session
        browserSession.events.push(noteEvent);
        if (this.eventEmitter) {
          this.eventEmitter(id, noteEvent);
        }

        // Persist to storage (create session file if missing)
        let session = await this.storageService.getSession(id);
        if (!session) {
          session = {
            id,
            name: browserSession.name,
            description: browserSession.description,
            status: browserSession.isPaused ? 'paused' : 'recording',
            startTime: browserSession.startTime,
            createdAt: browserSession.createdAt,
            config: browserSession.config,
            events: [],
          } as Session;
        }
        session.events.push(noteEvent);
        await this.storageService.saveSession(session);

        res.json(noteEvent);
        return;
      }

      // Handle replay mode (closed session) or active session without recorder
      const session = await this.storageService.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Create note event for closed session
      const ts = timestamp || Date.now();
      noteEvent = {
        id: generateEventId(type === 'FLAG' ? 'flag' : type === 'BUG' ? 'bug' : 'note'),
        type: (type || 'NOTE') as EventType,
        message: message || (type === 'FLAG' ? 'Flagged point' : type === 'BUG' ? 'Bug reported' : 'Note added'),
        timestamp: new Date(ts).toISOString(),
      };

      // If it's an active session without recorder, add to runtime events
      if (browserSession) {
        browserSession.events.push(noteEvent);
        if (this.eventEmitter) {
          this.eventEmitter(id, noteEvent);
        }
      }

      // Add to stored session file
      session.events.push(noteEvent);
      await this.storageService.saveSession(session);

      res.json(noteEvent);
    } catch (error) {
      console.error('Error adding note:', error);
      res.status(500).json({ error: 'Failed to add note' });
    }
  }

  async updateNote(req: Request, res: Response): Promise<void> {
    try {
      const { id, noteId } = req.params;
      const { message } = req.body;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // Handle active session
      const browserSession = this.sessions.get(id);
      if (browserSession) {
        const event = browserSession.events.find(e => e.id === noteId);
        if (event) {
          event.message = message;
        }
      }

      // Handle stored session
      const session = await this.storageService.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const eventIndex = session.events.findIndex(e => e.id === noteId);
      if (eventIndex === -1) {
        res.status(404).json({ error: 'Note not found' });
        return;
      }

      session.events[eventIndex].message = message;
      await this.storageService.saveSession(session);

      res.json(session.events[eventIndex]);
    } catch (error) {
      console.error('Error updating note:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  }

  async deleteNote(req: Request, res: Response): Promise<void> {
    try {
      const { id, noteId } = req.params;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // Find the event to check if it's a screenshot
      let eventToDelete: QAEvent | undefined;

      // Handle active session
      const browserSession = this.sessions.get(id);
      if (browserSession) {
        eventToDelete = browserSession.events.find(e => e.id === noteId);
        browserSession.events = browserSession.events.filter(e => e.id !== noteId);
      }

      // Handle stored session
      const session = await this.storageService.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      if (!eventToDelete) {
        eventToDelete = session.events.find(e => e.id === noteId);
      }

      // If it's a screenshot, delete the file
      if (eventToDelete && eventToDelete.type === EventType.SCREENSHOT && eventToDelete.details) {
        try {
          const details = JSON.parse(eventToDelete.details);
          const filename = details.filename;
          if (filename) {
            // Get session directory to find the file
            const sessionDirName = session.sessionDirName || id;
            const filePath = join(this.getSessionsDir(req), sessionDirName, filename);

            console.log(`[Delete Screenshot] Deleting file: ${filePath}`);
            await fs.unlink(filePath).catch(err => {
              console.warn(`[Delete Screenshot] Could not delete file ${filePath}:`, err.message);
            });
          }
        } catch (parseError) {
          console.error('[Delete Screenshot] Error parsing event details:', parseError);
        }
      }

      session.events = session.events.filter(e => e.id !== noteId);
      await this.storageService.saveSession(session);

      res.json({ message: 'Event deleted', noteId });
    } catch (error) {
      console.error('Error deleting note:', error);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  }


  async captureScreenshot(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { imageData, timestamp } = req.body;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      const browserSession = this.sessions.get(id);
      const recorder = this.recorders.get(id);

      // Session context is already stored in browserSession.sessionContext
      // No need to restore workspace context

      // Check if this is a debug_gateway session
      if (browserSession?.config?.sessionType === 'debug_gateway') {
        res.status(400).json({ error: 'Screenshots are not available for debug gateway sessions' });
        return;
      }

      if (imageData && id) {
        // Handle manual screenshot from replay
        const session = await this.storageService.getSession(id);
        if (!session) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }

        // Extract UUID from id parameter (it might be full directory name or just UUID)
        // Format: YYYY-MM-DD_HH-MM-SS_UUID or just UUID
        const parts = id.split('_');
        const sessionUuid = parts.length > 1 ? parts[parts.length - 1] : id;

        const createdAt = session.createdAt || new Date(session.startTime).toISOString();
        const sessionDirName = getSessionDirName(sessionUuid, createdAt);
        const sessionDir = join(this.getSessionsDir(req), sessionDirName);
        await fs.mkdir(sessionDir, { recursive: true });

        // Use provided timestamp (from video position) for both filename and event
        const ts = timestamp || Date.now();
        const screenshotId = generateEventId('ss');
        // Match recorder format: screenshot-{timestamp}-{id}.png
        const screenshotFilename = `screenshot-${ts}-${screenshotId.substring(0, 8)}.png`;
        const screenshotPath = join(sessionDir, screenshotFilename);

        // Convert base64 to buffer
        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        await fs.writeFile(screenshotPath, buffer);

        // Match recorder event format exactly
        const base64Preview = base64Data.substring(0, 1000);
        const event: QAEvent = {
          id: screenshotId,
          type: EventType.SCREENSHOT,
          message: 'Screenshot captured', // Match recorder message
          timestamp: new Date(ts).toISOString(), // Use video timestamp
          details: JSON.stringify({
            filename: screenshotFilename,
            path: screenshotPath,
            size: buffer.length,
            preview: base64Preview,
          }),
        };

        // If it's an active session, add to events
        if (browserSession) {
          browserSession.events.push(event);
          if (this.eventEmitter) {
            this.eventEmitter(id, event);
          }
        }

        // Add to the stored session file
        session.events.push(event);
        await this.storageService.saveSession(session);

        res.json(event);
        return;
      }

      if (!recorder) {
        res.status(404).json({ error: 'Active recorder not found' });
        return;
      }

      const event = await recorder.captureScreenshot();
      res.json(event);
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      res.status(500).json({ error: 'Failed to capture screenshot' });
    }
  }

  async captureSnapshot(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const browserSession = this.sessions.get(id);
      const recorder = this.recorders.get(id);

      // Check if this is a debug_gateway session
      if (browserSession?.config?.sessionType === 'debug_gateway') {
        res.status(400).json({ error: 'Snapshot is not available for debug gateway sessions' });
        return;
      }

      if (!recorder) {
        res.status(404).json({ error: 'Active recorder not found' });
        return;
      }

      const event = await recorder.captureSnapshot();
      res.json(event);
    } catch (error) {
      console.error('Error capturing snapshot:', error);
      res.status(500).json({ error: 'Failed to capture snapshot' });
    }
  }

  async addEvent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const event: QAEvent = req.body;
      const browserSession = this.sessions.get(id);

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // If active session, add to runtime events
      if (browserSession) {
        browserSession.events.push(event);
        // Sort events chronologically by timestamp
        browserSession.events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (this.eventEmitter) {
          this.eventEmitter(id, event);
        }
      }

      // Always save to storage
      const session = await this.storageService.getSession(id);
      if (session) {
        session.events.push(event);
        // Sort events chronologically by timestamp
        session.events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        await this.storageService.saveSession(session);
      }

      res.json({ message: 'Event added', event });
    } catch (error) {
      console.error('Error adding event:', error);
      res.status(500).json({ error: 'Failed to add event' });
    }
  }

  async updateSessionName(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // Update in-memory session if it exists (active session)
      const browserSession = this.sessions.get(id);
      if (browserSession) {
        browserSession.name = name;
      }

      // Also persist to disk for both active and completed sessions
      // IMPORTANT: includeEvents must be true to preserve existing events when updating
      const session = await this.storageService.getSession(id, true);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      session.name = name;
      await this.storageService.saveSession(session);

      res.json({ message: 'Session name updated', name });
    } catch (error) {
      console.error('Error updating session name:', error);
      res.status(500).json({ error: 'Failed to update session name' });
    }
  }

  async updateSessionDescription(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { description } = req.body;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // Try active session first
      const browserSession = this.sessions.get(id);
      if (browserSession) {
        browserSession.description = description;
        res.json({ message: 'Session description updated', description });
        return;
      }

      // Try stored session
      // IMPORTANT: includeEvents must be true to preserve existing events when updating
      const session = await this.storageService.getSession(id, true);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      session.description = description;
      await this.storageService.saveSession(session);
      res.json({ message: 'Session description updated', description });
    } catch (error) {
      console.error('Error updating session description:', error);
      res.status(500).json({ error: 'Failed to update session description' });
    }
  }

  getBrowserSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionRecorder(sessionId: string): EventRecorder | null {
    return this.recorders.get(sessionId) || null;
  }

  async generateQaReport(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { filteredEvents, activeFilters, screenshots } = req.body;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // Get session from storage
      const session = await this.storageService.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Convert activeFilters array to Set if needed
      const filtersSet = activeFilters instanceof Array
        ? new Set(activeFilters)
        : activeFilters;

      const report = await generateQaReport({
        session,
        filteredEvents: filteredEvents || [],
        activeFilters: filtersSet,
        screenshots: screenshots || [],
      });

      res.json({ report });
    } catch (error) {
      console.error('Error generating QA report:', error);
      res.status(500).json({
        error: 'Failed to generate QA report',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Configure storage directory based on workspace before accessing storage
      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // Check if session exists
      const session = await this.storageService.getSession(id, false);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Get session directory name
      const parts = id.split('_');
      const sessionUuid = parts.length > 1 ? parts[parts.length - 1] : id;
      const createdAt = session.createdAt || new Date(session.startTime).toISOString();
      const sessionDirName = getSessionDirName(sessionUuid, createdAt);
      const sessionDir = join(this.getSessionsDir(req), sessionDirName);

      // Delete the entire session folder
      try {
        await fs.rm(sessionDir, { recursive: true, force: true });
        console.log(`[Delete Session] Deleted session folder: ${sessionDir}`);
      } catch (error) {
        console.error(`[Delete Session] Error deleting folder ${sessionDir}:`, error);
        res.status(500).json({
          error: 'Failed to delete session folder',
          details: error instanceof Error ? error.message : String(error)
        });
        return;
      }

      // If it's an active session, close it
      const browserSession = this.sessions.get(id);
      if (browserSession) {
        const playwrightService = this.playwrightServices.get(id);
        if (playwrightService) {
          try {
            await playwrightService.close();
          } catch (closeError) {
            console.warn('[Delete Session] Error closing browser:', closeError);
          }
        }

        // Stop screen recording if active
        const screenRecorder = this.screenRecorders.get(id);
        if (screenRecorder && screenRecorder.isActivelyRecording()) {
          try {
            await screenRecorder.stopRecording();
          } catch (screenRecError) {
            console.warn('[Delete Session] Error stopping screen recording:', screenRecError);
          }
        }

        this.sessions.delete(id);
        this.recorders.delete(id);
        this.playwrightServices.delete(id);
        this.screenRecorders.delete(id);
      }

      res.json({ message: 'Session deleted successfully', sessionId: id });
    } catch (error) {
      console.error('Error deleting session:', error);
      res.status(500).json({
        error: 'Failed to delete session',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async exportSessionContext(req: Request, res: Response): Promise<void> {

    try {
      const { id } = req.params;
      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }
      const session = await this.storageService.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const eventIdsParam = req.query.eventIds as string | undefined;
      const filtersParam = req.query.filters as string | undefined; // Keep for backward compatibility
      const contextResult = this.contextService.renderContext(session, {
        eventIds: eventIdsParam ? eventIdsParam.split(',') : undefined,
        legacyFilters: filtersParam ? filtersParam.split(',') : undefined,
        sessionsDir: this.getSessionsDir(req),
      });

      if (eventIdsParam) {
        const requestedIds = eventIdsParam.split(',').map((eventId) => eventId.trim()).filter(Boolean);
        const requestedIdSet = new Set(requestedIds);
        const missingIds = requestedIds.filter((eventId) => !session.events.some((event) => event.id === eventId));
        // Intentionally keep this logic for potential future diagnostics, but avoid writing to local debug files
        // to prevent ENOENT errors when .cursor directory is not present in the backend process cwd.
        void requestedIdSet;
        void missingIds;
      }

      try {
        const sessionDirName = session.sessionDirName || getSessionDirName(session.id, session.createdAt || new Date(session.startTime).toISOString());
        const savedContext = await this.contextService.saveContextFile(session, {
          sessionsDir: this.getSessionsDir(req),
          sessionDirName,
          eventIds: eventIdsParam ? eventIdsParam.split(',') : undefined,
          legacyFilters: filtersParam ? filtersParam.split(',') : undefined,
        });

        console.log(`[Export Context] Saved context to: ${savedContext.contextFilePath}`);
      } catch (saveError) {
        // Log error but don't fail the export - user still gets the download
        console.error('[Export Context] Failed to save context copy to session directory:', saveError);
      }

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${contextResult.filename}"`);
      res.send(contextResult.content);
    } catch (error) {
      console.error('Error exporting session context:', error);
      res.status(500).json({ error: 'Failed to export session context' });
    }
  }

  async ingestServerLog(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, lvl, src, message, data } = req.body;

      // Validate required fields
      if (!message) {
        res.status(400).json({ error: 'message is required' });
        return;
      }

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      // Find target session
      let targetSessionId = sessionId;

      // If no sessionId provided, find the most recent active session
      if (!targetSessionId) {
        const activeSessions = Array.from(this.sessions.entries())
          .filter(([_, session]) => session.isPaused === false)
          .sort((a, b) => b[1].startTime - a[1].startTime);

        if (activeSessions.length === 0) {
          res.status(404).json({ error: 'No active session found.' });
          return;
        }

        targetSessionId = activeSessions[0][0];
      }

      // Get the session
      const browserSession = this.sessions.get(targetSessionId);
      if (!browserSession) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Create SERVER_LOG event
      const logLevel = lvl || 'log';
      const source = src || 'external';
      const event: QAEvent = {
        id: generateEventId('svr'),
        type: EventType.SERVER_LOG,
        message: message || `Log from ${source}`,
        timestamp: new Date().toISOString(),
        details: JSON.stringify({
          lvl: logLevel,
          src: source,
          data: data || {}
        }),
      };

      // Add to session
      browserSession.events.push(event);

      // Emit via WebSocket
      if (this.eventEmitter) {
        this.eventEmitter(targetSessionId, event);
      }

      // Also save to storage if session exists
      const session = await this.storageService.getSession(targetSessionId);
      if (session) {
        session.events.push(event);
        await this.storageService.saveSession(session);
      }

      res.json({ message: 'Log ingested successfully', event });
    } catch (error) {
      console.error('Error ingesting server log:', error);
      res.status(500).json({ error: 'Failed to ingest server log' });
    }
  }

  async getServerInfo(req: Request, res: Response): Promise<void> {
    try {
      const interfaces = networkInterfaces();
      let localIp = 'localhost';

      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
          if (iface.family === 'IPv4' && !iface.internal) {
            localIp = iface.address;
            break;
          }
        }
        if (localIp !== 'localhost') break;
      }

      res.json({
        ip: localIp,
        port: config.port,
        url: `http://${localIp}:${config.port}`
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get server info' });
    }
  }

  /**
   * Upload screen recording from browser capture
   */
  async uploadScreenRecording(req: Request, res: Response): Promise<void> {
    // Use multer middleware
    upload.single('video')(req, res, async (err) => {
      if (err) {
        console.error('[ScreenRecording] Upload error:', err);
        res.status(500).json({ error: 'Failed to upload screen recording' });
        return;
      }

      try {
        const { id } = req.params;
        const file = (req as any).file;

        if (!this.ensureStorageForRequest(req, res)) {
          return;
        }

        if (!file) {
          res.status(400).json({ error: 'No video file provided' });
          return;
        }

        // Get session - check memory first, then storage
        let session: Session | null = null;
        let sessionUuid = id;
        let createdAt: string | undefined;

        // First, check if session is active in memory
        const browserSession = this.sessions.get(id);
        if (browserSession) {
          sessionUuid = browserSession.sessionId;
          createdAt = browserSession.createdAt || new Date(browserSession.startTime).toISOString();
        } else {
          // If not found in memory, try storage (saved sessions)
          session = await this.storageService.getSession(id);
          if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
          }
          const parts = id.split('_');
          sessionUuid = parts.length > 1 ? parts[parts.length - 1] : id;
          createdAt = session.createdAt || new Date(session.startTime).toISOString();
        }

        // Determine session directory
        const sessionDirName = getSessionDirName(sessionUuid, createdAt || new Date().toISOString());
        const sessionDir = join(this.getSessionsDir(req), sessionDirName);

        // Ensure directory exists
        await fs.mkdir(sessionDir, { recursive: true });

        // Save video file
        const videoPath = join(sessionDir, file.originalname);
        await fs.writeFile(videoPath, file.buffer);

        console.log('[ScreenRecording] Saved:', {
          path: videoPath,
          size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
          sessionId: id,
          sessionUuid,
          sessionDirName,
        });

        res.json({
          message: 'Screen recording uploaded successfully',
          path: file.originalname, // Path/filename for post-processing
          filename: file.originalname,
          size: file.size,
        });
      } catch (error) {
        console.error('[ScreenRecording] Save error:', error);
        res.status(500).json({
          error: 'Failed to save screen recording',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Post-process WebM video to fix metadata and enable seeking
   * This fixes the issue where WebM videos behave like streams without proper seeking
   */
  async postProcessVideo(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { filename } = req.body;

      if (!this.ensureStorageForRequest(req, res)) {
        return;
      }

      if (!filename) {
        res.status(400).json({ error: 'Filename is required' });
        return;
      }

      // Get session directory
      let sessionUuid = id;
      let createdAt: string | undefined;

      const browserSession = this.sessions.get(id);
      if (browserSession) {
        sessionUuid = browserSession.sessionId;
        createdAt = browserSession.createdAt || new Date(browserSession.startTime).toISOString();
      } else {
        const session = await this.storageService.getSession(id);
        if (!session) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }
        const parts = id.split('_');
        sessionUuid = parts.length > 1 ? parts[parts.length - 1] : id;
        createdAt = session.createdAt || new Date(session.startTime).toISOString();
      }

      const sessionDirName = getSessionDirName(sessionUuid, createdAt || new Date().toISOString());
      const sessionDir = join(this.getSessionsDir(req), sessionDirName);
      const inputPath = join(sessionDir, filename);
      const tempPath = inputPath.replace('.webm', '-temp.webm');

      // Check if file exists
      try {
        await fs.access(inputPath);
      } catch {
        res.status(404).json({ error: 'Video file not found' });
        return;
      }

      console.log('[PostProcess] Processing video:', inputPath);

      // Use FFmpeg to re-mux with proper metadata
      const { spawn } = await import('child_process');
      const args = [
        '-i', inputPath,
        '-c', 'copy',              // Don't re-encode, just copy streams
        '-movflags', '+faststart', // Move metadata to beginning
        '-y',
        tempPath
      ];

      const ffmpegProcess = spawn('ffmpeg', args, { stdio: 'pipe' });

      await new Promise((resolve, reject) => {
        ffmpegProcess.on('close', async (code) => {
          if (code === 0) {
            try {
              // Replace original with processed version
              await fs.unlink(inputPath);
              await fs.rename(tempPath, inputPath);
              console.log('[PostProcess] Video processed successfully:', inputPath);
              resolve(true);
            } catch (error) {
              reject(error);
            }
          } else {
            // Clean up temp file on failure
            await fs.unlink(tempPath).catch(() => { });
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        ffmpegProcess.on('error', (error) => {
          reject(error);
        });
      });

      res.json({
        message: 'Video post-processed successfully',
        filename,
      });
    } catch (error) {
      console.error('[PostProcess] Error:', error);
      res.status(500).json({
        error: 'Failed to post-process video',
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
