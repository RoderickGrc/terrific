import { promises as fs } from 'fs';
import { join } from 'path';
import { getSessionDirName } from '../config.js';
import { QAEvent, Session } from '../types/index.js';
import { optimizeEventsForLLM } from './eventOptimizer.js';
import { applyFilterPolicyToEvents, resolveFilterPolicy } from './filtersPolicy.js';

export interface ContextRenderOptions {
  eventIds?: string[];
  legacyFilters?: string[];
  timestamp?: Date;
  sessionsDir?: string;
}

export interface ContextRenderResult {
  filename: string;
  content: string;
  eventsToExport: QAEvent[];
  filterInfo: string;
  filtersSourceLabel: 'Local' | 'Global' | 'None';
}

export interface ContextSaveOptions extends ContextRenderOptions {
  sessionsDir: string;
  sessionDirName?: string;
}

export interface ContextSaveResult extends ContextRenderResult {
  contextFilePath: string;
}

export class ContextService {
  private normalizeName(name?: string): string {
    return (name || 'session')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  generateFilename(sessionName?: string, timestamp: Date = new Date()): string {
    const time = timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const normalizedName = this.normalizeName(sessionName);
    return `${time}-${normalizedName}-context.txt`;
  }

  private selectEvents(session: Session, options: ContextRenderOptions): { eventsToExport: QAEvent[]; filterInfo: string; filtersSourceLabel: 'Local' | 'Global' | 'None' } {
    const { eventIds, legacyFilters } = options;
    const allEvents = session.events || [];
    const resolvedFilters = resolveFilterPolicy(options.sessionsDir);

    const applyPolicy = (sourceEvents: QAEvent[]) => {
      const policyResult = applyFilterPolicyToEvents(sourceEvents, resolvedFilters.policy);
      return policyResult.events;
    };

    if (eventIds && eventIds.length > 0) {
      const requestedIds = new Set(eventIds.map((id) => id.trim()).filter(Boolean));
      const requestedEvents = allEvents.filter((event) => requestedIds.has(event.id));
      const eventsToExport = applyPolicy(requestedEvents);
      const missingCount = requestedIds.size - requestedEvents.length;
      const filterInfo = `Filtered by event IDs: ${eventsToExport.length} events${missingCount > 0 ? ` (${missingCount} requested IDs not found)` : ''}`;
      return { eventsToExport, filterInfo, filtersSourceLabel: resolvedFilters.sourceLabel };
    }

    if (legacyFilters && legacyFilters.length > 0) {
      const activeFilters = legacyFilters.map((f) => f.trim()).filter(Boolean);
      const selectedEvents = allEvents.filter((event) => activeFilters.includes(event.type));
      const eventsToExport = applyPolicy(selectedEvents);
      return {
        eventsToExport,
        filterInfo: `Filtered by: ${activeFilters.join(', ')}`,
        filtersSourceLabel: resolvedFilters.sourceLabel,
      };
    }

    const eventsToExport = applyPolicy(allEvents);
    return {
      eventsToExport,
      filterInfo: 'All events',
      filtersSourceLabel: resolvedFilters.sourceLabel,
    };
  }

  renderContext(session: Session, options: ContextRenderOptions = {}): ContextRenderResult {
    const timestamp = options.timestamp || new Date();
    const filename = this.generateFilename(session.name, timestamp);
    const { eventsToExport, filterInfo, filtersSourceLabel } = this.selectEvents(session, options);
    const optimizedEvents = optimizeEventsForLLM(eventsToExport, session.startTime);

    const content = [
      '=== CONTEXT ===',
      `ID: ${session.id}`,
      `Name: ${session.name || 'N/A'}`,
      `Status: ${session.status}`,
      `Date: ${session.createdAt || new Date(session.startTime).toISOString()}`,
      `Initial URL: ${session.config?.initialUrl || 'N/A'}`,
      `Resolution: ${session.config?.resolution || 'N/A'}`,
      `Features: Actions:${session.config?.recordActions}, Console:${session.config?.recordConsole}, Network:${session.config?.recordNetwork}, Video:${session.config?.recordVideo}`,
      `Export filters: ${filterInfo}`,
      `Events exported: ${eventsToExport.length} of ${(session.events || []).length}`,
      `Filters: ${filtersSourceLabel}`,
      '',
      '=== EVENT LOG ===',
      optimizedEvents || 'No events recorded.',
      '',
      '=== END OF EXPORT ===',
    ].join('\n');

    return {
      filename,
      content,
      eventsToExport,
      filterInfo,
      filtersSourceLabel,
    };
  }

  resolveSessionDir(session: Session, sessionsDir: string, sessionDirName?: string): string {
    const resolvedSessionDirName = sessionDirName || session.sessionDirName || getSessionDirName(session.id, session.createdAt || new Date(session.startTime).toISOString());
    return join(sessionsDir, resolvedSessionDirName);
  }

  async saveContextFile(session: Session, options: ContextSaveOptions): Promise<ContextSaveResult> {
    const renderResult = this.renderContext(session, options);
    const sessionDir = this.resolveSessionDir(session, options.sessionsDir, options.sessionDirName);
    await fs.mkdir(sessionDir, { recursive: true });

    const contextFilePath = join(sessionDir, renderResult.filename);
    await fs.writeFile(contextFilePath, renderResult.content, 'utf-8');

    return {
      ...renderResult,
      contextFilePath,
    };
  }
}
