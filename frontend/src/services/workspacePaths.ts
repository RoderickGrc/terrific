export function getHomePath(workspaceHash?: string | null): string {
  if (!workspaceHash) {
    return '/';
  }

  return `/workspace/${workspaceHash}`;
}

export function getSessionPath(sessionId: string, workspaceHash?: string | null): string {
  if (!workspaceHash) {
    return `/session/${sessionId}`;
  }

  return `/workspace/${workspaceHash}/session/${sessionId}`;
}

export function getReplayPath(sessionId: string, workspaceHash?: string | null): string {
  if (!workspaceHash) {
    return `/replay/${sessionId}`;
  }

  return `/workspace/${workspaceHash}/replay/${sessionId}`;
}
