import { promises as fs } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';
import { request } from 'http';
import { config, getSessionDirName } from '../config.js';
import { Session, QAEvent } from '../types/index.js';

const DEBUG_LOG_PATH = join(process.cwd(), '.cursor', 'debug.log');
const DEBUG_SERVER_URL = process.env.DEBUG_SERVER_URL || '';

async function debugLog(location: string, message: string, data: any, hypothesisId: string) {
  const logEntry = {
    location,
    message,
    data,
    timestamp: Date.now(),
    sessionId: 'debug-session',
    runId: 'run2',
    hypothesisId,
  };

  // Write to file
  try {
    const logLine = JSON.stringify(logEntry) + '\n';
    await fs.appendFile(DEBUG_LOG_PATH, logLine);
  } catch {
    // Ignore file write errors
  }

  // Send to debug server (using http module for Node.js compatibility)
  try {
    const url = new URL(DEBUG_SERVER_URL);
    const postData = JSON.stringify(logEntry);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = request(options, () => { });
    req.on('error', () => { });
    req.write(postData);
    req.end();
  } catch {
    // Ignore network errors
  }
}

export class StorageService {
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = config.sessionsDir;
    this.ensureSessionsDir();
  }

  private async ensureSessionsDir() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating sessions directory:', error);
    }
  }

  async saveSession(session: Session): Promise<string> {
    // Create directory with format: YYYY-MM-DD_HH-MM-SS_UUID
    const createdAt = session.createdAt || new Date(session.startTime).toISOString();
    const sessionDirName = getSessionDirName(session.id, createdAt);
    const sessionDir = join(this.sessionsDir, sessionDirName);
    await fs.mkdir(sessionDir, { recursive: true });

    const metadataPath = join(sessionDir, 'metadata.json');
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        id: session.id,
        name: session.name || session.config.name,
        description: session.description,
        status: session.status,
        startTime: session.startTime,
        createdAt,
        config: session.config,
      }, null, 2)
    );

    const eventsPath = join(sessionDir, 'events.json');
    await fs.writeFile(
      eventsPath,
      JSON.stringify(session.events, null, 2)
    );

    return sessionDirName;
  }

  async getSession(sessionIdOrDirName: string, includeEvents: boolean = true): Promise<Session | null> {
    try {
      // #region agent log
      await debugLog('storage.ts:71', 'getSession entry', { sessionIdOrDirName, sessionsDir: this.sessionsDir }, 'A');
      // #endregion
      // Try to find session directory
      // Format can be: UUID, YYYY-MM-DD_UUID, or YYYY-MM-DD_HH-MM-SS_UUID (full directory name)
      let sessionDir: string | null = null;
      let actualDirName: string | null = null;
      let metadataPath: string | null = null;
      let eventsPath: string | null = null;

      // First try: if it looks like a full directory name (contains underscores and date format), try direct match
      if (sessionIdOrDirName.includes('_') && sessionIdOrDirName.match(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_/)) {
        const testDir = join(this.sessionsDir, sessionIdOrDirName);
        try {
          await fs.access(join(testDir, 'metadata.json'));
          sessionDir = testDir;
          actualDirName = sessionIdOrDirName;
          metadataPath = join(sessionDir, 'metadata.json');
          eventsPath = join(sessionDir, 'events.json');
          // #region agent log
          await debugLog('storage.ts:90', 'Found in full dir name', { sessionIdOrDirName, sessionDir }, 'A');
          // #endregion
        } catch (accessError) {
          // #region agent log
          await debugLog('storage.ts:95', 'Full directory name access failed', { sessionIdOrDirName, testDir, error: String(accessError) }, 'B');
          // #endregion
          // Continue to search by UUID
        }
      }

      // Second try: exact UUID match (for backward compatibility)
      if (!sessionDir) {
        const testDir = join(this.sessionsDir, sessionIdOrDirName);
        try {
          await fs.access(join(testDir, 'metadata.json'));
          sessionDir = testDir;
          actualDirName = sessionIdOrDirName;
          metadataPath = join(sessionDir, 'metadata.json');
          eventsPath = join(sessionDir, 'events.json');
          // #region agent log
          await debugLog('storage.ts:108', 'Found in exact UUID dir', { sessionIdOrDirName, sessionDir }, 'A');
          // #endregion
        } catch {
          // Try to find in date-prefixed directories (ends with _UUID)
          // #region agent log
          await debugLog('storage.ts:112', 'Searching date-prefixed dirs', { sessionIdOrDirName, sessionsDir: this.sessionsDir, searchPattern: `_${sessionIdOrDirName}` }, 'B');
          // #endregion
          const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
          // #region agent log
          await debugLog('storage.ts:115', 'Read sessions directory', { sessionIdOrDirName, entriesCount: entries.length, entryNames: entries.map(e => e.name) }, 'B');
          // #endregion

          for (const entry of entries) {
            if (entry.isDirectory()) {
              // #region agent log
              await debugLog('storage.ts:120', 'Checking directory', { sessionIdOrDirName, entryName: entry.name, endsWithPattern: entry.name.endsWith(`_${sessionIdOrDirName}`) }, 'B');
              // #endregion
              if (entry.name.endsWith(`_${sessionIdOrDirName}`)) {
                sessionDir = join(this.sessionsDir, entry.name);
                actualDirName = entry.name;
                metadataPath = join(sessionDir, 'metadata.json');
                eventsPath = join(sessionDir, 'events.json');
                // #region agent log
                await debugLog('storage.ts:126', 'Found session directory', { sessionIdOrDirName, entryName: entry.name, sessionDir }, 'B');
                // #endregion
                break;
              }
            }
          }
        }
      }

      if (!sessionDir || !metadataPath || !eventsPath) {
        // #region agent log
        await debugLog('storage.ts:133', 'Session directory not found', { sessionIdOrDirName, sessionsDir: this.sessionsDir, sessionDir }, 'D');
        // #endregion
        return null;
      }

      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      let events: QAEvent[] = [];

      if (includeEvents) {
        const eventsContent = await fs.readFile(eventsPath, 'utf-8');
        events = JSON.parse(eventsContent);
        // Sort events chronologically by timestamp
        events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      }

      // #region agent log
      await debugLog('storage.ts:145', 'Successfully loaded session metadata', { sessionIdOrDirName, sessionId: metadata.id, includeEvents }, 'A');
      // #endregion

      // Find preview image (first PNG) and video file
      let previewImage: string | undefined = undefined;
      let videoFilename: string | undefined = undefined;

      try {
        const files = await fs.readdir(sessionDir);

        // Find first screenshot
        const screenshot = files.find(f => f.endsWith('.png') && f.startsWith('screenshot-'));
        if (screenshot) {
          previewImage = screenshot;
        }

        // Find video
        const videoFile = files.find(f => f.endsWith('.webm'));
        if (videoFile) {
          videoFilename = videoFile;
        }
      } catch (error) {
        // Directory read failed
      }

      return {
        ...metadata,
        name: metadata.name || metadata.config?.name,
        description: metadata.description,
        createdAt: metadata.createdAt || new Date(metadata.startTime).toISOString(),
        events,
        videoFilename,
        previewImage,
        sessionDirName: actualDirName || sessionIdOrDirName
      };
    } catch (error) {
      // #region agent log
      await debugLog('storage.ts:155', 'Error loading session', { sessionIdOrDirName, error: error instanceof Error ? error.message : String(error), errorStack: error instanceof Error ? error.stack : undefined }, 'C');
      // #endregion
      return null;
    }
  }

  async listSessions(): Promise<Session[]> {
    try {
      const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });
      const sessions: Session[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Extract sessionId from directory name
          // Format can be: UUID, YYYY-MM-DD_UUID, or YYYY-MM-DD_HH-MM-SS_UUID
          // The UUID is always the last segment after the last underscore
          const parts = entry.name.split('_');
          const sessionId = parts.length > 1 ? parts[parts.length - 1] : entry.name;
          const session = await this.getSession(entry.name, false); // Don't include events for listing
          if (session) {
            sessions.push(session);
          }
        }
      }

      return sessions.sort((a, b) => b.startTime - a.startTime);
    } catch (error) {
      return [];
    }
  }

  getVideoPath(sessionId: string): string {
    // Try to find session directory - same logic as getSession
    // For simplicity, we'll search for the directory ending with _sessionId
    // In practice, this should be called with the full session object or use getSession first
    try {
      const entries = readdirSync(this.sessionsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith(`_${sessionId}`)) {
          return join(this.sessionsDir, entry.name, 'video.webm');
        }
      }
    } catch (error) {
      // If directory doesn't exist or can't be read, fall back to UUID-only format
    }
    // Fallback to UUID-only format (backward compatibility)
    return join(this.sessionsDir, sessionId, 'video.webm');
  }
}

