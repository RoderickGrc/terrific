import { SessionConfig, Session, QAEvent, EventType } from '../../types';

// Use relative URL when in development (Vite proxy handles it)
// Use full URL in production or when VITE_API_URL is explicitly set
const API_BASE_URL = (import.meta as any).env.VITE_API_URL || ((import.meta as any).env.DEV ? '' : 'http://localhost:3001');

export const api = {
  async createSession(config: SessionConfig): Promise<Session> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Cannot connect to backend at ${API_BASE_URL}. Make sure the backend server is running.`);
      }
      throw error;
    }
  },

  async getSession(sessionId: string): Promise<Session> {
    const url = `${API_BASE_URL}/api/sessions/${sessionId}`;

    try {
      const response = await fetch(url);

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
        throw new Error(errorMessage);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Cannot connect to backend at ${API_BASE_URL}. Make sure the backend server is running.`);
      }
      throw error;
    }
  },

  async listSessions(): Promise<Session[]> {
    const response = await fetch(`${API_BASE_URL}/api/sessions`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list sessions');
    }

    return response.json();
  },

  async stopSession(sessionId: string): Promise<{ message: string; sessionId: string; sessionDirName?: string }> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/stop`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to stop session');
    }

    return response.json();
  },

  async pauseSession(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/pause`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to pause session');
    }
  },

  async resumeSession(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/resume`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to resume session');
    }
  },

  async addNote(sessionId: string, message: string, type?: 'NOTE' | 'FLAG' | 'BUG', timestamp?: number): Promise<QAEvent> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, type, timestamp }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add note');
    }

    return response.json();
  },

  async updateNote(sessionId: string, noteId: string, message: string): Promise<QAEvent> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/notes/${noteId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update note');
    }

    return response.json();
  },

  async deleteNote(sessionId: string, noteId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/notes/${noteId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete note');
    }
  },

  async captureScreenshot(sessionId: string, imageData?: string, timestamp?: number): Promise<QAEvent> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageData, timestamp }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to capture screenshot');
    }

    return response.json();
  },

  async captureCrawl(sessionId: string): Promise<QAEvent> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to capture crawl');
    }

    return response.json();
  },

  async updateSessionName(sessionId: string, name: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/name`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update session name');
    }
  },

  async updateSessionDescription(sessionId: string, description: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/description`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update session description');
    }
  },

  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete session');
    }
  },

  async generateQaReport(sessionId: string, payload: { filteredEvents: QAEvent[]; activeFilters: Set<EventType> | string[]; screenshots: { url: string; timestamp: string }[] }): Promise<string> {

    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/qa-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
  async listCredentials(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/credentials`);
    if (!response.ok) throw new Error('Failed to list credentials');
    return response.json();
  },

  async createCredential(data: { alias: string; targetUrl: string; username?: string; email?: string }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create credential');
    return response.json();
  },

  async updateCredential(id: string, data: { alias?: string; username?: string; email?: string }): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/credentials/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update credential');
    return response.json();
  },

  async deleteCredential(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/credentials/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Failed to delete credential');
  },

  async captureCredential(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/credentials/${id}/capture`, {
      method: 'POST',
    });
    if (!response.ok) throw new Error('Failed to capture credential state');
  },

  // Alias for captureCredential (launches browser for user configuration)
  async launchCredential(id: string): Promise<any> {
    await this.captureCredential(id);
    // Return the updated credential
    const credentials = await this.listCredentials();
    return credentials.find(c => c.id === id);
  },

  async exportSessionContext(sessionId: string, filters?: EventType[]): Promise<{ blob: Blob; filename: string }> {
    let url = `${API_BASE_URL}/api/sessions/${sessionId}/export-context`;

    // Add filters as query params if provided
    if (filters && filters.length > 0) {
      const params = new URLSearchParams();
      params.set('filters', filters.join(','));
      url += `?${params.toString()}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to export session context');

    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'session-context.txt';
    if (contentDisposition && contentDisposition.includes('filename=')) {
      filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
    }

    const blob = await response.blob();
    return { blob, filename };
  },
};


