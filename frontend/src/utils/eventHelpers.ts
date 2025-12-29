import { QAEvent, EventType } from '../../types';

// Helper function to get SERVER_LOG level from event details
export const getServerLogLevel = (event: QAEvent): 'log' | 'warn' | 'error' | null => {
    if (event.type !== EventType.SERVER_LOG || !event.details) return null;

    try {
        const details = JSON.parse(event.details);
        return details.lvl || 'log';
    } catch {
        return null;
    }
};

// Helper function to check if SERVER_LOG is an error
export const isServerLogError = (event: QAEvent): boolean => {
    return getServerLogLevel(event) === 'error';
};

// Helper function to check if SERVER_LOG is a warning
export const isServerLogWarn = (event: QAEvent): boolean => {
    return getServerLogLevel(event) === 'warn';
};
