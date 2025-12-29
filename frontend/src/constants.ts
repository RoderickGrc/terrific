
import { Session, EventType, BrowserProfile, QAEvent } from './types';

// Mock data for demonstration purposes
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
    events: REAL_EVENTS.slice(0, 20), // Subset for variety
    previewImage: 'https://picsum.photos/seed/terr_demo2/800/450'
  }
];

export const AI_DEBUG_PROMPT = `You are instrumenting code to log to the 'Terrific' Debug Gateway.
Target Endpoint: http://localhost:3000/api/ingest
Method: POST
Headers: Content-Type: application/json

Expected Payload Contract:
{
  "lvl": "log" | "warn" | "error",   // Optional, default: log
  "src": string,                     // Required: Source ID (e.g., 'backend-api', 'auth-service')
  "message": string,                 // Required: The log message
  "data": object,                    // Optional: Arbitrary JSON data/context
  "category": string                 // Optional: Tag for filtering
}

Instructions:
1. Create a helper function or logger transport that sends this payload asynchronously.
2. Ensure it handles connection errors gracefully (fire-and-forget).
3. Instrument key logic flows in the provided code snippet to send telemetry to this endpoint.`;