import { promises as fs } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';
import { config, getSessionDirName } from '../config.js';
import { Session, QAEvent } from '../types/index.js';

export class StorageService {
  private sessionsDir: string;

  constructor() {
    this.sessionsDir = config.sessionsDir;
    this.ensureSessionsDir();
  }

  /**
   * Set a custom sessions directory for the next operations.
   * This allows saving sessions to a different location (e.g., client's working directory).
   */
  setSessionsDir(sessionsDir: string): void {
    this.sessionsDir = sessionsDir;
  }

  /**
   * Reset sessions directory to the default config value.
   */
  resetSessionsDir(): void {
    this.sessionsDir = config.sessionsDir;
  }

  /**
   * Get the current sessions directory being used.
   */
  getSessionsDir(): string {
    return this.sessionsDir;
  }

  private async ensureSessionsDir() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating sessions directory:', error);
    }
  }

  async saveSession(session: Session, sessionsDir?: string): Promise<string> {
    // Use provided sessionsDir or fall back to instance state
    const targetDir = sessionsDir || this.sessionsDir;
    
    // Create directory with format: YYYY-MM-DD_HH-MM-SS_UUID
    const createdAt = session.createdAt || new Date(session.startTime).toISOString();
    const sessionDirName = getSessionDirName(session.id, createdAt);
    const sessionDir = join(targetDir, sessionDirName);
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
    // Sort events before saving to avoid sorting on every read
    const sortedEvents = [...session.events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    await fs.writeFile(
      eventsPath,
      JSON.stringify(sortedEvents, null, 2)
    );

    return sessionDirName;
  }

  async getSession(sessionIdOrDirName: string, includeEvents: boolean = true): Promise<Session | null> {
    try {
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
        } catch (accessError) {
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
        } catch {
          // Try to find in date-prefixed directories (ends with _UUID)
          const entries = await fs.readdir(this.sessionsDir, { withFileTypes: true });

          for (const entry of entries) {
            if (entry.isDirectory()) {
              if (entry.name.endsWith(`_${sessionIdOrDirName}`)) {
                sessionDir = join(this.sessionsDir, entry.name);
                actualDirName = entry.name;
                metadataPath = join(sessionDir, 'metadata.json');
                eventsPath = join(sessionDir, 'events.json');
                break;
              }
            }
          }
        }
      }

      if (!sessionDir || !metadataPath || !eventsPath) {
        return null;
      }

      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      let events: QAEvent[] = [];

      if (includeEvents) {
        const eventsContent = await fs.readFile(eventsPath, 'utf-8');
        events = JSON.parse(eventsContent);
        // Events are already sorted when saved, no need to sort again
      }

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

