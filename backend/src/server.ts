import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { promises as fs } from 'fs';
import { createReadStream, appendFileSync } from 'fs';
import sessionRoutes, { setSessionController } from './routes/session.js';
import { SessionController } from './controllers/session.js';
import { config } from './config.js';
import { QAEvent } from './types/index.js';

// Load .env from project root (two levels up from backend/src)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../.env') });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({
  origin: [config.corsOrigin, 'http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Store WebSocket clients per session
const sessionClients = new Map<string, Set<any>>();

// Helper to broadcast events to session clients
function broadcastToSession(sessionId: string, event: QAEvent) {
  const clients = sessionClients.get(sessionId);
  if (clients) {
    const message = JSON.stringify(event);
    clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }
}

// Create session controller and configure event emitter BEFORE routes
const sessionController = new SessionController();
sessionController.setEventEmitter(broadcastToSession);

// Inject controller into routes
setSessionController(sessionController);

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    ws.close(1008, 'sessionId required');
    return;
  }

  if (!sessionClients.has(sessionId)) {
    sessionClients.set(sessionId, new Set());
  }
  sessionClients.get(sessionId)!.add(ws);

  ws.on('close', () => {
    const clients = sessionClients.get(sessionId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        sessionClients.delete(sessionId);
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// API Routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/credentials', (await import('./routes/credentials.js')).default);

// Helper function to find video file in session directory
async function findVideoFile(sessionDir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(sessionDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.webm')) {
        return entry.name;
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  return null;
}

// Serve screenshots, videos and session files
app.get('/api/sessions/:id/files/:filename', async (req, res) => {
  try {
    const { id, filename } = req.params;

    console.log(`[File Request] ID: ${id}, Filename: ${filename}`);

    // Security: only allow PNG files for screenshots and webm for videos
    const isScreenshot = filename.startsWith('screenshot-') && filename.endsWith('.png');
    const isVideo = filename === 'video.webm' || filename.endsWith('.webm');

    if (!isScreenshot && !isVideo) {
      res.status(403).json({ error: 'Invalid file type' });
      return;
    }

    // Find session directory (supports both formats: UUID and DATE_TIME_UUID)
    let sessionDir: string | null = null;

    // Try direct match first (id could be the full directory name)
    const directPath = join(config.sessionsDir, id);
    console.log(`[File Request] Trying direct path: ${directPath}`);
    try {
      const stat = await fs.stat(directPath);
      if (stat.isDirectory()) {
        sessionDir = directPath;
        console.log(`[File Request] Found session directory: ${sessionDir}`);
      }
    } catch (error) {
      console.log(`[File Request] Direct path not found, trying search...`);
      // Not found, try date-prefixed format
    }

    // If not found, search for date-prefixed directory
    if (!sessionDir) {
      try {
        const entries = await fs.readdir(config.sessionsDir, { withFileTypes: true });
        console.log(`[File Request] Searching in sessions directory, found ${entries.length} entries`);
        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Check if it matches the full directory name or ends with _UUID
            if (entry.name === id || entry.name.endsWith(`_${id}`)) {
              sessionDir = join(config.sessionsDir, entry.name);
              console.log(`[File Request] Found matching directory: ${sessionDir}`);
              break;
            }
          }
        }
      } catch (error) {
        console.error('[File Request] Error reading sessions directory:', error);
        res.status(404).json({ error: 'Session directory not found', details: error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    if (!sessionDir) {
      console.error(`[File Request] Session directory not found for ID: ${id}`);
      res.status(404).json({ error: 'Session not found', id });
      return;
    }

    // If requesting video.webm, find the actual video file
    let actualFilename = filename;
    if (filename === 'video.webm') {
      console.log(`[File Request] Looking for video file in: ${sessionDir}`);
      const videoFile = await findVideoFile(sessionDir);
      if (!videoFile) {
        console.error(`[File Request] Video file not found in: ${sessionDir}`);
        res.status(404).json({ error: 'Video file not found' });
        return;
      }
      actualFilename = videoFile;
      console.log(`[File Request] Found video file: ${actualFilename}`);
    }

    const filePath = resolve(join(sessionDir, actualFilename));
    console.log(`[File Request] Resolved file path: ${filePath}`);

    try {
      const fileStats = await fs.stat(filePath);
      console.log(`[File Request] File exists, size: ${fileStats.size} bytes`);

      // Set proper headers for webm video files
      if (isVideo) {
        res.setHeader('Content-Type', 'video/webm');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Length', fileStats.size);
      }
    }

      // Handle range requests for video seeking
      const range = req.headers.range;
    if (range && isVideo) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileStats.size - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileStats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/webm',
      });


      const fileStream = createReadStream(filePath, { start, end });
      fileStream.pipe(res);
      fileStream.on('error', (err: Error) => {
        console.error('[File Request] Stream error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file', details: err.message });
        }
      });
    } else {
      // Send full file

      // Ensure status 200 for full file requests
      if (!res.headersSent) {
        res.status(200);
      }
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);
      fileStream.on('error', (err: Error) => {
        console.error('[File Request] Stream error:', err);

        if (!res.headersSent) {
          res.status(500).json({ error: 'Error streaming file', details: err.message });
        }
      });
      fileStream.on('end', () => {
        console.log(`[File Request] File served successfully: ${actualFilename} (${isVideo ? 'video/webm' : 'image'})`);
      });
    });
      }
    } catch (error) {
  console.error('[File Request] Error accessing file:', error);
  console.error('[File Request] File path attempted:', filePath);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  console.error('[File Request] Error stack:', errorStack);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Error accessing file', details: errorMessage });
  }
}
  } catch (error) {
  // Catch any unhandled errors in the entire handler
  console.error('[File Request] Unhandled error:', error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  console.error('[File Request] Unhandled error stack:', errorStack);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error', details: errorMessage });
  }
}
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = config.port;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server ready`);
});

