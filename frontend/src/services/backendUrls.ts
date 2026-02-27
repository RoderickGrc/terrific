/**
 * Backend URL Configuration
 *
 * Single source of truth for backend URL construction.
 * Eliminates hardcoded ports and provides consistent helpers.
 */

// Default backend HTTP endpoint (fixed port: 4568)
const DEFAULT_BACKEND_HTTP = 'http://localhost:4568';

// Environment vars
const env = (import.meta as any).env || {};

// Normalize environment variable: trim whitespace and empty check
function normalize(value: string | undefined): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

// Base API URL
// In DEV: use relative URL '' to leverage Vite proxy
// In PROD: use VITE_API_URL or fallback to DEFAULT_BACKEND_HTTP
const API_BASE_URL = normalize(env.VITE_API_URL) || (env.DEV ? '' : DEFAULT_BACKEND_HTTP);

// Absolute API URL (always full URL, never relative)
// Used for asset URLs that need to be fetchable by backend
const API_ABSOLUTE_URL = normalize(env.VITE_API_URL) || DEFAULT_BACKEND_HTTP;

// WebSocket URL
const WS_BASE_URL = env.VITE_WS_URL || 'ws://localhost:4568';

/**
 * Build a full API URL.
 * @param path - API path, should start with '/'
 * @param options
 *   - absolute: if true, returns absolute URL (for fetch/asset loading by backend)
 *   - workspaceHash: optional workspace hash to append as query param
 */
export function buildApiUrl(
  path: string,
  options?: { absolute?: boolean; workspaceHash?: string }
): string {
  const base = options?.absolute ? API_ABSOLUTE_URL : API_BASE_URL;

  // Ensure path starts with '/'
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Remove trailing slash from base and leading from path to avoid '//'
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const cleanPath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

  let url = `${cleanBase}${cleanPath}`;

  // Append workspace query param if provided (for browser asset loading without headers)
  if (options?.workspaceHash) {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}workspace=${options.workspaceHash}`;
  }

  return url;
}

/**
 * Build URL for a session file (screenshot, video, etc.)
 * @param sessionId - Session ID (UUID)
 * @param filename - File name (e.g., 'video.webm', 'screenshot-123.png')
 * @param options
 *   - absolute: if true, returns absolute URL (for QA report, backend fetch)
 *   - workspaceHash: optional workspace hash
 */
export function buildSessionFileUrl(
  sessionId: string,
  filename: string,
  options?: { absolute?: boolean; workspaceHash?: string }
): string {
  const encodedFilename = encodeURIComponent(filename);
  return buildApiUrl(`/api/sessions/${sessionId}/files/${encodedFilename}`, options);
}

/**
 * Build URL for session video (convenience wrapper).
 * @param sessionId - Session ID
 * @param options - Same as buildSessionFileUrl
 */
export function buildSessionVideoUrl(
  sessionId: string,
  options?: { absolute?: boolean; workspaceHash?: string }
): string {
  // Backend resolves 'video.webm' to actual .webm file
  return buildApiUrl(`/api/sessions/${sessionId}/files/video.webm`, options);
}

// Export base URLs for direct use if needed
export { API_BASE_URL, API_ABSOLUTE_URL, WS_BASE_URL };
