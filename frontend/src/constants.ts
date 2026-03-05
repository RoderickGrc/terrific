
import { Session, BrowserProfile, QAEvent } from '../types';

// No mock event data; app uses real sessions from the backend
export const REAL_EVENTS: QAEvent[] = [];

export const RESOLUTIONS = ['Dynamic', '4K', '2K', 'FHD', 'HD', 'Tablet', 'Mobile'];

export const MOCK_PROFILES: BrowserProfile[] = [
  {
    id: 'prof_1',
    alias: 'Admin User',
    startUrl: 'https://example.com/dashboard',
    description: 'Authenticated admin session for testing administrative features.',
    hasState: true,
    lastUpdated: Date.now() - 3600000,
    storageSize: '1.2 MB'
  },
  {
    id: 'prof_2',
    alias: 'New User Flow',
    startUrl: 'https://example.com/onboarding',
    description: 'User in onboarding flow for testing registration process.',
    hasState: true,
    lastUpdated: Date.now() - 86400000,
    storageSize: '450 KB'
  },
  {
    id: 'prof_3',
    alias: 'Guest Session',
    startUrl: 'https://example.com',
    description: 'Clean session without cookies for testing public pages.',
    hasState: false
  }
];

export const MOCK_SESSIONS: Session[] = [
  {
    id: 'terr_demo1',
    name: 'Dashboard Performance Test',
    description: 'Example session demonstrating performance monitoring capabilities.',
    status: 'completed',
    startTime: Date.now() - 3600000, // 1 hour ago
    config: {
      initialUrl: 'https://example.com/dashboard',
      recordActions: true,
      recordConsole: true,
      recordNetwork: true,
      recordVideo: true,
      resolution: 'FHD',
      profileId: 'prof_1'
    },
    events: REAL_EVENTS,
    previewImage: 'https://picsum.photos/seed/terr_demo1/800/450'
  },
  {
    id: 'terr_demo2',
    name: 'Login Flow Test',
    status: 'completed',
    startTime: Date.now() - 86400000, // 1 day ago
    config: {
      initialUrl: 'https://example.com/login',
      recordActions: true,
      recordConsole: false,
      recordNetwork: true,
      recordVideo: false,
      resolution: 'Mobile'
    },
    events: [],
    previewImage: 'https://picsum.photos/seed/terr_demo2/800/450'
  }
];

export const AI_DEBUG_PROMPT = `You are instrumenting code to log to the 'Terrific' Debug Gateway.
Target Endpoint: http://localhost:4567/api/sessions/ingest
Method: POST
Headers: Content-Type: application/json

Expected Payload Contract:
{
  "message": string,                 // Required: The log message
  "src": string,                     // Optional: Source ID (e.g., 'backend-api', 'auth-service'; defaults to 'external')
  "lvl": "log" | "warn" | "error",   // Optional: Log level (defaults to 'log')
  "data": object                     // Optional: Arbitrary JSON data/context
}

Instructions:
1. Create a helper function or logger transport that sends this payload asynchronously to /api/sessions/ingest.
2. Ensure it handles connection errors gracefully (fire-and-forget).
3. Rely on the backend to attach each log to the currently active session; you do not need to provide a sessionId.`;
