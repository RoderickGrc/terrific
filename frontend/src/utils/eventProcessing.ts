import { QAEvent, EventType } from '../../types';
import { isServerLogError } from './eventHelpers';

/**
 * Enhanced event with pre-computed properties to avoid expensive
 * calculations during render (regex, date parsing, etc.)
 */
export interface ProcessedEvent extends QAEvent {
    _isError: boolean;
    _trackIndex: number;
    _timeStr: string;
    _msStr: string;
}

/**
 * Determines which track (0-6) an event type belongs to
 */
const getTrackForEvent = (type: EventType): number => {
    switch (type) {
        case EventType.SERVER_LOG: return 0;
        case EventType.NETWORK: return 1;
        case EventType.CONSOLE: return 2;
        case EventType.ACTION: return 3;
        case EventType.PAGE_RELOAD: return 4;
        case EventType.SCREENSHOT:
        case EventType.SNAPSHOT: return 5;
        case EventType.NOTE:
        case EventType.FLAG:
        case EventType.BUG: return 6;
        default: return 3;
    }
};

/**
 * Pre-processes events to compute expensive properties once
 * instead of on every render. This significantly improves
 * performance when dealing with thousands of events.
 */
export const processEvents = (events: QAEvent[]): ProcessedEvent[] => {
    return events.map(event => {
        // Error detection (regex and string operations)
        const isNetworkError = event.type === EventType.NETWORK && /^(4|5)\d{2}/.test(event.message);
        const isConsoleError = event.type === EventType.CONSOLE && event.message.toLowerCase().startsWith('console error');
        const isServerError = isServerLogError(event);
        const isBug = event.type === EventType.BUG;

        // Time formatting
        const date = new Date(event.timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const ms = date.getMilliseconds().toString().padStart(3, '0');

        return {
            ...event,
            _isError: isNetworkError || isConsoleError || isServerError || isBug,
            _trackIndex: getTrackForEvent(event.type),
            _timeStr: `${hours}:${minutes}:${seconds}`,
            _msStr: ms,
        };
    });
};

/**
 * Process a single event (useful for incremental updates)
 */
export const processEvent = (event: QAEvent): ProcessedEvent => {
    return processEvents([event])[0];
};
