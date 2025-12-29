import { describe, it, expect } from 'vitest';
import { decode } from '@toon-format/toon';
import { QAEvent, EventType } from '../types/index.js';
import { optimizeEventsForLLM } from './eventOptimizer.js';

describe('Event Chronological Sorting', () => {
    // Helper function to parse result (handles both TOON and JSON)
    const parseResult = (result: string): any[] => {
        try {
            // Try TOON format first
            const decoded = decode(result);
            if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
                return (decoded as any).events || decoded;
            }
            return decoded as any[];
        } catch {
            // Fallback to JSON
            return JSON.parse(result);
        }
    };

    it('should sort events chronologically by timestamp', () => {
        const sessionStart = new Date('2025-12-23T10:00:00.000Z').getTime();

        // Create events with timestamps out of order
        const events: QAEvent[] = [
            {
                id: '3',
                type: EventType.ACTION,
                message: 'Third event',
                timestamp: new Date('2025-12-23T10:00:30.000Z').toISOString(),
                details: '',
            },
            {
                id: '5',
                type: EventType.NOTE,
                message: 'Fifth event (added during replay)',
                timestamp: new Date('2025-12-23T10:00:50.000Z').toISOString(),
                details: '',
            },
            {
                id: '1',
                type: EventType.ACTION,
                message: 'First event',
                timestamp: new Date('2025-12-23T10:00:10.000Z').toISOString(),
                details: '',
            },
            {
                id: '4',
                type: EventType.SCREENSHOT,
                message: 'Fourth event (added during replay)',
                timestamp: new Date('2025-12-23T10:00:40.000Z').toISOString(),
                details: '',
            },
            {
                id: '2',
                type: EventType.ACTION,
                message: 'Second event',
                timestamp: new Date('2025-12-23T10:00:20.000Z').toISOString(),
                details: '',
            },
        ];

        const result = optimizeEventsForLLM(events, sessionStart);
        const parsedResult = parseResult(result);
        const eventMessages = parsedResult.map((e: any) => e.msg);

        // Verify events are in chronological order
        expect(eventMessages).toEqual([
            'First event',
            'Second event',
            'Third event',
            'Fourth event (added during replay)',
            'Fifth event (added during replay)',
        ]);
    });

    it('should handle events with identical timestamps', () => {
        const sessionStart = new Date('2025-12-23T10:00:00.000Z').getTime();
        const sameTimestamp = new Date('2025-12-23T10:00:10.000Z').toISOString();

        const events: QAEvent[] = [
            {
                id: 'a',
                type: EventType.ACTION,
                message: 'Event A',
                timestamp: sameTimestamp,
                details: '',
            },
            {
                id: 'b',
                type: EventType.NOTE,
                message: 'Event B',
                timestamp: sameTimestamp,
                details: '',
            },
        ];

        const result = optimizeEventsForLLM(events, sessionStart);
        const parsedResult = parseResult(result);

        // Should not throw error and should maintain stable order
        expect(parsedResult).toHaveLength(2);
    });

    it('should sort events with millisecond precision', () => {
        const sessionStart = new Date('2025-12-23T10:00:00.000Z').getTime();

        const events: QAEvent[] = [
            {
                id: '100',
                type: EventType.ACTION,
                message: 'Event at 100ms',
                timestamp: new Date('2025-12-23T10:00:00.100Z').toISOString(),
                details: '',
            },
            {
                id: '50',
                type: EventType.ACTION,
                message: 'Event at 50ms',
                timestamp: new Date('2025-12-23T10:00:00.050Z').toISOString(),
                details: '',
            },
            {
                id: '200',
                type: EventType.ACTION,
                message: 'Event at 200ms',
                timestamp: new Date('2025-12-23T10:00:00.200Z').toISOString(),
                details: '',
            },
        ];

        const result = optimizeEventsForLLM(events, sessionStart);
        const parsedResult = parseResult(result);
        const eventMessages = parsedResult.map((e: any) => e.msg);

        expect(eventMessages).toEqual([
            'Event at 50ms',
            'Event at 100ms',
            'Event at 200ms',
        ]);
    });
});
