import { useState, useRef, useCallback, useEffect } from 'react';
import { QAEvent } from '../../types';

/**
 * Hook to batch rapid event updates to prevent too many re-renders
 * when events arrive in bursts (e.g., 500+ events in a second).
 * 
 * Instead of updating state for every event, we accumulate them
 * and flush in intervals, reducing render pressure.
 */
export const useEventBatcher = (batchIntervalMs: number = 50) => {
    const [events, setEvents] = useState<QAEvent[]>([]);
    const pendingEventsRef = useRef<QAEvent[]>([]);
    const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const addEvents = useCallback((newEvents: QAEvent[]) => {
        pendingEventsRef.current.push(...newEvents);

        if (!batchTimeoutRef.current) {
            batchTimeoutRef.current = setTimeout(() => {
                setEvents(prev => [...prev, ...pendingEventsRef.current]);
                pendingEventsRef.current = [];
                batchTimeoutRef.current = null;
            }, batchIntervalMs);
        }
    }, [batchIntervalMs]);

    const clearEvents = useCallback(() => {
        setEvents([]);
        pendingEventsRef.current = [];
        if (batchTimeoutRef.current) {
            clearTimeout(batchTimeoutRef.current);
            batchTimeoutRef.current = null;
        }
    }, []);

    const flushPending = useCallback(() => {
        if (pendingEventsRef.current.length > 0) {
            setEvents(prev => [...prev, ...pendingEventsRef.current]);
            pendingEventsRef.current = [];
        }
        if (batchTimeoutRef.current) {
            clearTimeout(batchTimeoutRef.current);
            batchTimeoutRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (batchTimeoutRef.current) {
                clearTimeout(batchTimeoutRef.current);
            }
        };
    }, []);

    return {
        events,
        addEvents,
        clearEvents,
        flushPending,
        pendingCount: pendingEventsRef.current.length
    };
};
