# QA Testing Backend

Backend server for the QA Testing application using Express, Playwright, and WebSockets.

## Setup

1. Install dependencies:

```powershell
npm install
```

2. Install Playwright browsers:

```powershell
npx playwright install chromium
```

3. Start the development server:

```powershell
npm run dev
```

The server will run on `http://localhost:4568` by default.

## Environment Variables

- `PORT` - Server port (default: 4568)
- `CORS_ORIGIN` - CORS allowed origin (default: http://localhost:4567)

## API Endpoints

- `POST /api/sessions` - Create a new testing session
- `GET /api/sessions` - List all sessions
- `GET /api/sessions/:id` - Get session details
- `POST /api/sessions/:id/stop` - Stop and save session
- `POST /api/sessions/:id/pause` - Pause session recording
- `POST /api/sessions/:id/resume` - Resume session recording
- `POST /api/sessions/:id/notes` - Add a note/flag/bug
- `POST /api/sessions/:id/screenshot` - Capture screenshot

## WebSocket

Connect to `ws://localhost:4568?sessionId=<sessionId>` to receive real-time events.

## Sessions Storage

Sessions are stored in the `sessions/` directory:

- `sessions/{sessionId}/metadata.json` - Session metadata
- `sessions/{sessionId}/events.json` - Recorded events
- `sessions/{sessionId}/video.webm` - Video recording (if enabled)
