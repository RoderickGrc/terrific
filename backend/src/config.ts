import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Sessions directory: under app root, relative to backend (../../sessions)
export const config = {
  port: process.env.PORT || 4568,
  sessionsDir: join(__dirname, '../../sessions'),
  credentialsFile: join(__dirname, '../../credentials.json'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4567',
};

// Ensure sessions directory exists
fs.mkdir(config.sessionsDir, { recursive: true }).catch(() => { });

/**
 * Calculate session directory name with format: YYYY-MM-DD_HH-MM-SS_UUID
 * @param sessionId - The session UUID
 * @param createdAt - ISO timestamp string (optional, defaults to current time)
 * @returns Directory name in format YYYY-MM-DD_HH-MM-SS_UUID
 */
export function getSessionDirName(sessionId: string, createdAt?: string): string {
  const date = createdAt ? new Date(createdAt) : new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = date.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-'); // HH-MM-SS
  return `${dateStr}_${timeStr}_${sessionId}`;
}
