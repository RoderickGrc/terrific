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
  SESSION_STOPPED = 'SESSION_STOPPED',
}

export interface QAEvent {
  id: string;
  type: EventType;
  message: string;
  timestamp: string; // ISO string or formatted time
  details?: string;
  isPruned?: boolean;
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
  credentialId?: string; // Legacy
  profileId?: string; // New
  crawlOnReload?: boolean;
  crawlOnScreenshot?: boolean;
}

export interface Credential {
  id: string;
  alias: string;
  username?: string;
  email?: string;
  targetUrl: string;
  isVerified: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface BrowserProfile {
  id: string;
  alias: string;
  startUrl: string;
  description?: string;
  hasState: boolean; // True if localStorage/cookies are saved
  lastUpdated?: number;
  storageSize?: string; // e.g. "45 KB"
}

export interface WorkspaceSummary {
  id: string;
  path: string;
  createdAt: string;
  lastAccessedAt: string;
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
  sessionDirName?: string; // Directory name for local file access
}

export type DocStatus = 'blocked' | 'failed' | 'degraded' | 'success' | 'unassigned';

export interface DocLink {
  type: 'notion' | 'github' | 'linear';
  url: string;
}

export interface DocumentationData {
  title: string;
  description: string;
  status: DocStatus;
  links: DocLink[];
  reports: {
    flow?: string;
    qa?: string;
    suggestions?: string;
  };
}

// --- Filtering System Types ---

export type FilterProperty = 'type' | 'message' | 'smart_group' | 'timestamp';

export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'does_not_contain'
  | 'starts_with'
  | 'ends_with';

export type LogicOperator = 'AND' | 'OR';

export interface ActiveFilter {
  id: string;
  property: FilterProperty;
  operator: FilterOperator;
  value: string | string[]; // Updated to support array for Type multi-select
  logic?: LogicOperator; // Logic connecting to the previous filter
}

export type Theme = 'light' | 'dark';
