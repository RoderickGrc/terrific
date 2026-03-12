export enum EventType {
  ACTION = 'ACTION',
  CONSOLE = 'CONSOLE',
  NETWORK = 'NETWORK',
  PAGE_RELOAD = 'PAGE_RELOAD',
  NOTE = 'NOTE',
  SCREENSHOT = 'SCREENSHOT',
  SNAPSHOT = 'SNAPSHOT',
  FLAG = 'FLAG',
  BUG = 'BUG',
  SERVER_LOG = 'SERVER_LOG',
  SESSION_STOPPED = 'SESSION_STOPPED',
}

export interface QAEvent {
  id: string;
  type: EventType;
  message: string;
  timestamp: string;
  details?: string;
}

export type Resolution = 'FHD' | 'HD' | 'Tablet' | 'Mobile' | 'Dynamic';

export type RecordingMode = 'browser' | 'screen';

export type ScreenSelection = 'primary' | 'secondary' | 'all';

export type SessionType = 'browser' | 'debug_gateway';

export interface SessionConfig {
  sessionType?: SessionType; // Default: 'browser'
  recordActions: boolean;
  recordConsole: boolean;
  recordNetwork: boolean;
  recordVideo: boolean;
  recordingMode?: RecordingMode; // 'browser' | 'screen' (default: 'browser')
  screenToRecord?: ScreenSelection; // 'primary' | 'secondary' | 'all' (default: 'primary')
  initialUrl: string;
  name?: string;
  resolution?: Resolution;
  credentialId?: string;
  snapshotOnReload?: boolean;
  snapshotOnScreenshot?: boolean;
}

export interface Session {
  id: string;
  name?: string;
  description?: string;
  status: 'recording' | 'paused' | 'completed';
  startTime: number;
  createdAt?: string;
  config: SessionConfig;
  events: QAEvent[];
  videoFilename?: string; // Name of the video file if it exists
  previewImage?: string; // Path or URL to the preview image
  sessionDirName?: string; // Optional full directory name
}

/**
 * Session context containing all session-scoped information.
 * This is created at session start and passed to all services.
 */
export interface SessionContext {
  sessionId: string;
  sessionsDir: string;      // Workspace-specific sessions directory
  sessionDirName: string;   // Full directory name (YYYY-MM-DD_HH-MM-SS_UUID)
  sessionDir: string;       // Full path: sessionsDir + sessionDirName
  createdAt: string;
  workspaceHash?: string;
}

export interface BrowserSession {
  sessionId: string;
  name?: string;
  description?: string;
  browser: any;
  context: any;
  page: any;
  config: SessionConfig;
  startTime: number;
  createdAt?: string;
  events: QAEvent[];
  isPaused: boolean;
  sessionContext: SessionContext; // Full session context
}

