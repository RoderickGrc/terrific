import { SessionConfig, Session, QAEvent, EventType, WorkspaceSummary } from '../../types';
import { API_BASE_URL } from './backendUrls';

export const api = {
  async createSession(config: SessionConfig, workspaceHash?: string): Promise<Session> {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:8',message:'Creating session with config',data:{API_BASE_URL,config},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (workspaceHash) {
        headers['X-Workspace-Hash'] = workspaceHash;
      }
      const response = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to create session';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:22',message:'createSession response not ok',data:{status:response.status,statusText:response.statusText,errorMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        throw new Error(errorMessage);
      }

      const sessionData = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:27',message:'createSession success',data:{sessionId:sessionData.id,recordingMode:sessionData.config?.recordingMode,recordVideo:sessionData.config?.recordVideo},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      return sessionData;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Cannot connect to backend at ${API_BASE_URL}. Make sure the backend server is running.`);
      }
      throw error;
    }
  },

  async startBrowser(sessionId: string, recordingStartTime?: number, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/start-browser`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ recordingStartTime }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to start browser';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch {
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }
  },

  async getSession(sessionId: string, workspaceHash?: string): Promise<Session> {
    const url = `${API_BASE_URL}/api/sessions/${sessionId}`;

    try {
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:40',message:'getSession called',data:{sessionId,url},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      const headers: Record<string, string> = {};
      if (workspaceHash) {
        headers['X-Workspace-Hash'] = workspaceHash;
      }
      const response = await fetch(url, { headers });

      // Check if response is HTML (error page)
      const contentType = response.headers.get('content-type') || '';
      const isHTML = contentType.includes('text/html') || !contentType.includes('application/json');

      if (isHTML) {
        const text = await response.text();
        if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
          throw new Error(`Backend returned HTML instead of JSON. Is the backend running at ${API_BASE_URL}? Response preview: ${text.substring(0, 200)}`);
        }
      }

      if (!response.ok) {
        let errorMessage = 'Failed to get session';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        // #region agent log
        fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:58',message:'getSession response not ok',data:{status:response.status,statusText:response.statusText,errorMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        throw new Error(errorMessage);
      }

      const data = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:66',message:'getSession success',data:{sessionId:data.id,config:data.config},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      return data;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Cannot connect to backend at ${API_BASE_URL}. Make sure the backend server is running.`);
      }
      throw error;
    }
  },

  async listSessions(workspaceHash?: string): Promise<Session[]> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions`, { headers });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list sessions');
    }

    return response.json();
  },

  async stopSession(sessionId: string, workspaceHash?: string): Promise<{ message: string; sessionId: string; sessionDirName?: string }> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to stop session');
    }

    return response.json();
  },

  async pauseSession(sessionId: string, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/pause`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to pause session');
    }
  },

  async resumeSession(sessionId: string, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/resume`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to resume session');
    }
  },

  async addNote(sessionId: string, message: string, type?: 'NOTE' | 'FLAG' | 'BUG', timestamp?: number, workspaceHash?: string): Promise<QAEvent> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, type, timestamp }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add note');
    }

    return response.json();
  },

  async updateNote(sessionId: string, noteId: string, message: string, workspaceHash?: string): Promise<QAEvent> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/notes/${noteId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update note');
    }

    return response.json();
  },

  async deleteNote(sessionId: string, noteId: string, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/notes/${noteId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete note');
    }
  },

  async captureScreenshot(sessionId: string, imageData?: string, timestamp?: number, workspaceHash?: string): Promise<QAEvent> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/screenshot`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageData, timestamp }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to capture screenshot');
    }

    return response.json();
  },

  async captureCrawl(sessionId: string, workspaceHash?: string): Promise<QAEvent> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/crawl`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to capture crawl');
    }

    return response.json();
  },

  async updateSessionName(sessionId: string, name: string, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/name`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update session name');
    }
  },

  async updateSessionDescription(sessionId: string, description: string, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/description`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update session description');
    }
  },

  async deleteSession(sessionId: string, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete session');
    }
  },

  async generateQaReport(sessionId: string, payload: { filteredEvents: QAEvent[]; activeFilters: Set<EventType> | string[]; screenshots: { url: string; timestamp: string }[] }, workspaceHash?: string): Promise<string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/qa-report`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filteredEvents: payload.filteredEvents,
        activeFilters: Array.isArray(payload.activeFilters) ? payload.activeFilters : Array.from(payload.activeFilters),
        screenshots: payload.screenshots,
      }),
    });

    if (!response.ok) {
      let errorMessage = 'Failed to generate QA report';
      try {
        const error = await response.json();
        errorMessage = error.error || error.details || errorMessage;
      } catch {
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data.report;
  },

  // Credentials
  async listCredentials(workspaceHash?: string): Promise<any[]> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/credentials`, { headers });
    if (!response.ok) throw new Error('Failed to list credentials');
    return response.json();
  },

  async createCredential(data: { alias: string; targetUrl: string; username?: string; email?: string }, workspaceHash?: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/credentials`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create credential');
    return response.json();
  },

  async updateCredential(id: string, data: { alias?: string; username?: string; email?: string }, workspaceHash?: string): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/credentials/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update credential');
    return response.json();
  },

  async deleteCredential(id: string, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/credentials/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) throw new Error('Failed to delete credential');
  },

  async captureCredential(id: string, workspaceHash?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/credentials/${id}/capture`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) throw new Error('Failed to capture credential state');
  },

  // Alias for captureCredential (launches browser for user configuration)
  async launchCredential(id: string, workspaceHash?: string): Promise<any> {
    await this.captureCredential(id, workspaceHash);
    // Return the updated credential
    const credentials = await this.listCredentials(workspaceHash);
    return credentials.find(c => c.id === id);
  },

  async exportSessionContext(sessionId: string, eventIds?: string[], workspaceHash?: string): Promise<{ blob: Blob; filename: string }> {
    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:360',message:'exportSessionContext called',data:{sessionId,eventIdsCount:eventIds ? eventIds.length : 'undefined',firstFewIds:eventIds ? eventIds.slice(0,5) : null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    let url = `${API_BASE_URL}/api/sessions/${sessionId}/export-context`;

    // Add event IDs as query params if provided
    if (eventIds && eventIds.length > 0) {
      const params = new URLSearchParams();
      params.set('eventIds', eventIds.join(','));
      url += `?${params.toString()}`;
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/2036a99f-528e-4b2c-ad8b-559edfab1e53',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api.ts:366',message:'eventIds added to URL',data:{url,eventIdsParam:params.get('eventIds')?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    }

    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('Failed to export session context');

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'session-context.txt';
    if (contentDisposition && contentDisposition.includes('filename=')) {
      filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
    }

    const blob = await response.blob();
    return { blob, filename };
  },

  async getServerInfo(workspaceHash?: string): Promise<{ ip: string; port: number; url: string }> {
    const headers: Record<string, string> = {};
    if (workspaceHash) {
      headers['X-Workspace-Hash'] = workspaceHash;
    }
    const response = await fetch(`${API_BASE_URL}/api/sessions/server-info`, { headers });
    if (!response.ok) throw new Error('Failed to get server info');
    return response.json();
  },

  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    const response = await fetch(`${API_BASE_URL}/api/workspaces`);
    if (!response.ok) throw new Error('Failed to list workspaces');
    const data = await response.json() as { workspaces?: WorkspaceSummary[] };
    return data.workspaces || [];
  },
};

