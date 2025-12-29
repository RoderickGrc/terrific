import { QAEvent, Session, EventType } from '../../types';
import { api } from './api';

export interface QaReportPayload {
  session: Session | null;
  filteredEvents: QAEvent[];
  activeFilters: Set<EventType>;
  screenshots: { url: string; timestamp: string }[];
}

export async function generateQaReport(payload: QaReportPayload): Promise<string> {
  if (!payload.session?.id) {
    throw new Error('Session ID is required to generate QA report');
  }

  return api.generateQaReport(payload.session.id, {
    filteredEvents: payload.filteredEvents,
    activeFilters: payload.activeFilters,
    screenshots: payload.screenshots,
  });
}
