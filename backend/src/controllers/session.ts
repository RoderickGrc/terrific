import { Request, Response } from 'express';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SessionConfig, Session, BrowserSession, QAEvent, EventType } from '../types/index.js';
import { config, getSessionDirName } from '../config.js';
import { generateShortId, generateEventId } from '../utils/id.js';
import { PlaywrightService } from '../services/playwright.js';
import { EventRecorder } from '../services/recorder.js';
import { StorageService } from '../services/storage.js';
import { generateQaReport } from '../services/qaReport.js';

export class SessionController {
  private sessions: Map<string, BrowserSession> = new Map();
  private recorders: Map<string, EventRecorder> = new Map();
  private playwrightServices: Map<string, PlaywrightService> = new Map();
  private storageService: StorageService;
  private eventEmitter: ((sessionId: string, event: any) => void) | null = null;

  constructor() {
    this.storageService = new StorageService();
  }

  setEventEmitter(emitter: (sessionId: string, event: any) => void) {
    this.eventEmitter = emitter;
  }

  async createSession(req: Request, res: Response): Promise<void> {
    try {
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
        };

        this.sessions.set(sessionId, debugSession);
        res.json(session);
        return;
      }

      // Handle browser sessions (existing logic)
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

        const result = await playwrightService.launchBrowser(config, sessionId, createdAt, storageState);
        browser = result.browser;
        context = result.context;
        page = result.page;
        this.playwrightServices.set(sessionId, playwrightService);
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
        recorder = new EventRecorder(page, {
          recordActions: config.recordActions,
          recordConsole: config.recordConsole,
          recordNetwork: config.recordNetwork,
          crawlOnReload: config.crawlOnReload,
          crawlOnScreenshot: config.crawlOnScreenshot,
        }, sessionId, createdAt);
        this.recorders.set(sessionId, recorder);
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
      };

      this.sessions.set(sessionId, browserSession);

      // Listen to recorder events and store them + emit via WebSocket
      if (recorder) {
        // Remove any existing listeners to prevent duplicates
        recorder.removeAllListeners('event');
        recorder.on('event', (event) => {
          const bs = this.sessions.get(sessionId);
          if (bs) {
            bs.events.push(event);
          }
          // Emit to WebSocket if emitter is set
          if (this.eventEmitter) {
            this.eventEmitter(sessionId, event);
          }
        });
      }

      res.json(session);
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(500).json({
        error: 'Failed to create session',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async getSession(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
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
      const sessions = await this.storageService.listSessions();
      res.json(sessions);
    } catch (error) {
      console.error('Error listing sessions:', error);
      res.status(500).json({ error: 'Failed to list sessions' });
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

      const sessionDirName = await this.storageService.saveSession(session);

      // Remove from active sessions
      this.sessions.delete(id);
      this.recorders.delete(id);

      res.json({ message: 'Session stopped and saved', sessionId: id, sessionDirName });
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
      const browserSession = this.sessions.get(id);
      const recorder = this.recorders.get(id);

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
            const filePath = join(config.sessionsDir, sessionDirName, filename);

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
      const browserSession = this.sessions.get(id);
      const recorder = this.recorders.get(id);

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
        const sessionDir = join(config.sessionsDir, sessionDirName);
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

  async captureCrawl(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const browserSession = this.sessions.get(id);
      const recorder = this.recorders.get(id);

      // Check if this is a debug_gateway session
      if (browserSession?.config?.sessionType === 'debug_gateway') {
        res.status(400).json({ error: 'Crawl is not available for debug gateway sessions' });
        return;
      }

      if (!recorder) {
        res.status(404).json({ error: 'Active recorder not found' });
        return;
      }

      const event = await recorder.captureCrawl();
      res.json(event);
    } catch (error) {
      console.error('Error capturing crawl:', error);
      res.status(500).json({ error: 'Failed to capture crawl' });
    }
  }

  async addEvent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const event: QAEvent = req.body;
      const browserSession = this.sessions.get(id);

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
      const sessionDir = join(config.sessionsDir, sessionDirName);

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
        this.sessions.delete(id);
        this.recorders.delete(id);
        this.playwrightServices.delete(id);
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
      const session = await this.storageService.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Get filters from query params
      const filtersParam = req.query.filters as string | undefined;
      let eventsToExport = session.events;
      let filterInfo = 'All events';

      if (filtersParam) {
        const activeFilters = filtersParam.split(',').map(f => f.trim());
        eventsToExport = session.events.filter(event => activeFilters.includes(event.type));
        filterInfo = `Filtered by: ${activeFilters.join(', ')}`;
      }

      const { optimizeEventsForLLM } = await import('../services/eventOptimizer.js');
      const optimizedEvents = optimizeEventsForLLM(eventsToExport, session.startTime);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const normalizedName = (session.name || 'session')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const filename = `${timestamp}-${normalizedName}-context.txt`;

      const content = [
        "=== CONTEXT ===",
        `ID: ${session.id}`,
        `Name: ${session.name || 'N/A'}`,
        `Status: ${session.status}`,
        `Date: ${session.createdAt || new Date(session.startTime).toISOString()}`,
        `Initial URL: ${session.config?.initialUrl || 'N/A'}`,
        `Resolution: ${session.config?.resolution || 'N/A'}`,
        `Features: Actions:${session.config?.recordActions}, Console:${session.config?.recordConsole}, Network:${session.config?.recordNetwork}, Video:${session.config?.recordVideo}`,
        `Filters: ${filterInfo}`,
        `Events exported: ${eventsToExport.length} of ${session.events.length}`,
        "",
        "=== EVENT LOG ===",
        optimizedEvents || "No events recorded.",
        "",
        "=== END OF EXPORT ==="
      ].join('\n');

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);
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
}
