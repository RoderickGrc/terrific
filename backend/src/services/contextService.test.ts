import { describe, expect, it } from 'vitest';
import { ContextService } from './contextService.js';
import { EventType, Session } from '../types/index.js';

describe('ContextService', () => {
  const service = new ContextService();

  const baseSession: Session = {
    id: 'session-1',
    name: 'Checkout Flow',
    status: 'completed',
    startTime: new Date('2026-01-01T10:00:00.000Z').getTime(),
    createdAt: '2026-01-01T10:00:00.000Z',
    config: {
      initialUrl: 'http://localhost:3000',
      recordActions: true,
      recordConsole: true,
      recordNetwork: true,
      recordVideo: false,
    },
    events: [
      {
        id: 'evt-1',
        type: EventType.ACTION,
        message: 'Clicked Checkout',
        timestamp: '2026-01-01T10:00:02.000Z',
      },
      {
        id: 'evt-2',
        type: EventType.NETWORK,
        message: '500 http://localhost:3000/api/checkout',
        timestamp: '2026-01-01T10:00:03.000Z',
        details: JSON.stringify({ status: 500, url: 'http://localhost:3000/api/checkout' }),
      },
    ],
  };

  it('renders canonical format with stable filename convention', () => {
    const rendered = service.renderContext(baseSession, {
      timestamp: new Date('2026-01-01T10:05:30.123Z'),
    });

    expect(rendered.filename).toBe('2026-01-01T10-05-30-checkout-flow-context.txt');
    expect(rendered.content).toContain('=== CONTEXT ===');
    expect(rendered.content).toContain('Filters: All events');
    expect(rendered.content).toContain('=== EVENT LOG ===');
    expect(rendered.content).toContain('=== END OF EXPORT ===');
  });

  it('filters by event ids when provided', () => {
    const rendered = service.renderContext(baseSession, {
      eventIds: ['evt-2', 'missing-id'],
      timestamp: new Date('2026-01-01T10:05:30.123Z'),
    });

    expect(rendered.eventsToExport).toHaveLength(1);
    expect(rendered.eventsToExport[0].id).toBe('evt-2');
    expect(rendered.filterInfo).toContain('requested IDs not found');
  });
});
