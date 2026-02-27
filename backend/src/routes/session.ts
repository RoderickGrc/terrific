import { Router } from 'express';
import { SessionController } from '../controllers/session.js';

const router = Router();
// SessionController will be injected from server.ts to ensure eventEmitter is set
export let sessionController: SessionController | null = null;

export function setSessionController(controller: SessionController) {
  sessionController = controller;
}

router.post('/', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.createSession(req, res);
});
router.get('/', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.listSessions(req, res);
});

// Pagination endpoints - must come BEFORE /:id route
router.get('/:id/events', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.getSessionEventsPaginated(req, res);
});

router.get('/:id/events/latest', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.getLatestEvents(req, res);
});

// Server info endpoint
router.get('/server-info', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.getServerInfo(req, res);
});

router.get('/:id', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.getSession(req, res);
});
router.post('/:id/start-browser', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.startBrowser(req, res);
});
router.post('/:id/stop', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.stopSession(req, res);
});
router.post('/:id/pause', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.pauseSession(req, res);
});
router.post('/:id/resume', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.resumeSession(req, res);
});
router.post('/:id/notes', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.addNote(req, res);
});
router.patch('/:id/notes/:noteId', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.updateNote(req, res);
});
router.delete('/:id/notes/:noteId', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.deleteNote(req, res);
});
router.post('/:id/screenshot', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.captureScreenshot(req, res);
});
router.post('/:id/crawl', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.captureCrawl(req, res);
});
router.patch('/:id/name', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.updateSessionName(req, res);
});
router.patch('/:id/description', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.updateSessionDescription(req, res);
});
router.post('/:id/qa-report', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.generateQaReport(req, res);
});
router.delete('/:id', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.deleteSession(req, res);
});
router.get('/:id/export-context', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.exportSessionContext(req, res);
});

// Ingest endpoint for external server logs
router.post('/ingest', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.ingestServerLog(req, res);
});

// Screen recording upload endpoint (from browser capture)
router.post('/:id/screen-recording', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.uploadScreenRecording(req, res);
});

// Post-process video endpoint (fix WebM metadata for seeking)
router.post('/:id/post-process-video', (req, res) => {
  if (!sessionController) {
    res.status(500).json({ error: 'Session controller not initialized' });
    return;
  }
  sessionController.postProcessVideo(req, res);
});

export default router;
