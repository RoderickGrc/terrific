export enum EventType {
  ACTION = 'ACTION',
  CONSOLE = 'CONSOLE',
  NETWORK = 'NETWORK',
  PAGE_RELOAD = 'PAGE_RELOAD',
  NOTE = 'NOTE',
  SCREENSHOT = 'SCREENSHOT',
  CRAWL = 'CRAWL',
  FLAG = 'FLAG',
  BUG = 'BUG',
  SERVER_LOG = 'SERVER_LOG',
}

export interface QAEvent {
  id: string;
  type: EventType;
  message: string;
  timestamp: string;
  details?: string;
}

export type Resolution = 'FHD' | 'HD' | 'Tablet' | 'Mobile' | 'Dynamic';

export type SessionType = 'browser' | 'debug_gateway';

export interface SessionConfig {
  sessionType?: SessionType; // Default: 'browser'
  recordActions: boolean;
  recordConsole: boolean;
  recordNetwork: boolean;
  recordVideo: boolean;
  initialUrl: string;
  name?: string;
  resolution?: Resolution;
  credentialId?: string;
  crawlOnReload?: boolean;
  crawlOnScreenshot?: boolean;
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
}

