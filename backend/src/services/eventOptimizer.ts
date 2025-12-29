import { encode } from '@toon-format/toon';
import { QAEvent, EventType } from '../types/index.js';
import { processSmartDiff } from './smartDiff.js';

/**
 * Configuration flags to control optimization heuristics.
 * Hardcoded here, modify as needed for specific QA sessions.
 */
export const OPTIMIZER_CONFIG = {
    enableInputDebouncing: true,
    enableStaticResourceFiltering: true,
    enableHeaderPruning: true,
    enableSensitiveDataSanitization: true,
    enableTimestampSimplification: true,
    enableToonEncoding: true,
    enableNetworkDeduplication: true,
};

/**
 * Truncate long strings while keeping context from both ends.
 * For data URIs, keep only the prefix.
 */
function truncateWithContext(str: string, edgeLen = 50): string {
    // For data URIs: keep only prefix (type info)
    if (str.startsWith('data:') && str.includes(',')) {
        const commaIndex = str.indexOf(',');
        return str.slice(0, commaIndex); // e.g., "data:image/png;base64"
    }

    // For long strings: 50 start + [...] + 50 end
    if (str.length > edgeLen * 2 + 10) {
        const start = str.slice(0, edgeLen);
        const end = str.slice(-edgeLen);
        return `${start}[...]${end}`;
    }

    return str;
}

/**
 * Recursively process payload objects to truncate long strings.
 * Preserves structure while reducing token count.
 */
function processPayloadRecursive(obj: any): any {
    if (typeof obj === 'string') {
        return truncateWithContext(obj, 50);
    }

    if (Array.isArray(obj)) {
        // For large arrays, show sample + count
        if (obj.length > 3) {
            const sample = obj.slice(0, 2).map(processPayloadRecursive);
            return `items[${obj.length}]: [${JSON.stringify(sample).slice(1, -1)}...]`;
        }
        return obj.map(processPayloadRecursive);
    }

    if (obj && typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
            result[key] = processPayloadRecursive(obj[key]);
        }
        return result;
    }

    return obj;
}

interface OptimizedEvent {
    t: string;       // Timestamp: "HH:mm:ss.ms" or "mm:ss" relative
    type: string;    // Event type abbreviated
    msg: string;     // Clean message
    val?: string;    // Final value (for grouped inputs)
    status?: number; // HTTP status (only for NETWORK)
    details?: any;   // Pruned details if relevant (parsed JSON for natural look)
    body?: any;      // Processed request body (for NETWORK POST/PUT/PATCH)
}

/**
 * Main entry point: optimize events for LLM ingestion.
 */
export function optimizeEventsForLLM(
    events: QAEvent[],
    sessionStart: number
): string {
    // Sort events chronologically by timestamp first
    let processedEvents = [...events].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Apply heuristics based on config
    if (OPTIMIZER_CONFIG.enableInputDebouncing) {
        processedEvents = debounceInputEvents(processedEvents);
    }

    if (OPTIMIZER_CONFIG.enableNetworkDeduplication) {
        processedEvents = deduplicateNetworkEvents(processedEvents);
    }

    if (OPTIMIZER_CONFIG.enableStaticResourceFiltering) {
        processedEvents = filterStaticResources(processedEvents);
    }

    // Track previous crawl for sequential SmartDiff processing
    let previousCrawlContent: string | null = null;

    // Map to optimized format
    const optimized: OptimizedEvent[] = processedEvents.map((event) => {
        let evt = event;

        if (OPTIMIZER_CONFIG.enableSensitiveDataSanitization) {
            evt = sanitizeSensitiveData(evt);
        }

        const timestamp = OPTIMIZER_CONFIG.enableTimestampSimplification
            ? simplifyTimestamp(evt.timestamp, sessionStart)
            : evt.timestamp;

        // Try to parse details if it's a string, to avoid escaped JSON in output
        let details: any = evt.details;
        if (typeof details === 'string' && (details.trim().startsWith('{') || details.trim().startsWith('['))) {
            try {
                details = JSON.parse(details);
            } catch {
                // Keep as string if parsing fails
            }
        }

        if (OPTIMIZER_CONFIG.enableHeaderPruning && evt.type === EventType.NETWORK && details) {
            details = typeof details === 'string' ? pruneNetworkHeaders(details) : pruneNetworkHeaders(JSON.stringify(details));
            try { details = JSON.parse(details); } catch { /* ignore */ }
        }

        const optimizedEvt: OptimizedEvent = {
            t: timestamp,
            type: abbreviateEventType(evt.type),
            msg: evt.message,
        };

        // Extract value for input events
        const rawDetails = typeof evt.details === 'string' ? evt.details : JSON.stringify(evt.details);
        if (evt.type === EventType.ACTION && rawDetails) {
            try {
                const detailsObj = JSON.parse(rawDetails);
                if (detailsObj.type === 'input' && detailsObj.value) {
                    optimizedEvt.val = detailsObj.value;
                }
            } catch {
                // Ignore parse errors
            }
        }

        // Extract status for network events
        if (evt.type === EventType.NETWORK && rawDetails) {
            try {
                const detailsObj = JSON.parse(rawDetails);
                if (detailsObj.status) {
                    optimizedEvt.status = detailsObj.status;
                }
                // Extract and process body for requests
                if (detailsObj.body) {
                    optimizedEvt.body = processPayloadRecursive(detailsObj.body);
                }
            } catch {
                // Ignore parse errors
            }
        }

        // Only include pruned details if they're still meaningful
        if (details) {
            const detailStr = typeof details === 'string' ? details : JSON.stringify(details);
            if (detailStr.length > 10) {
                // CRAWL events: use SmartDiff for intelligent optimization
                if (evt.type === EventType.CRAWL) {
                    const crawlContent = details?.markdown || details;
                    const crawlText = typeof crawlContent === 'string' ? crawlContent : JSON.stringify(crawlContent);

                    // First crawl: send full content, no diff
                    if (previousCrawlContent === null) {
                        optimizedEvt.details = crawlText;
                        previousCrawlContent = crawlText;
                    } else {
                        // Subsequent crawls: use SmartDiff
                        const diffResult = processSmartDiff(previousCrawlContent, crawlText);
                        optimizedEvt.details = diffResult.payload;

                        // Store for next crawl comparison
                        previousCrawlContent = crawlText;
                    }
                } else if (detailStr.length < 200) {
                    optimizedEvt.details = details;
                } else if (evt.type === EventType.ACTION) {
                    // If details are too long but it's an action, preserve the most important parts
                    try {
                        const detailsObj = typeof details === 'string' ? JSON.parse(details) : details;
                        const simplifiedDetails: any = {};
                        if (detailsObj.text) simplifiedDetails.text = detailsObj.text;
                        if (detailsObj.tagName) simplifiedDetails.tagName = detailsObj.tagName;
                        if (detailsObj.id) simplifiedDetails.id = detailsObj.id;

                        if (Object.keys(simplifiedDetails).length > 0) {
                            optimizedEvt.details = simplifiedDetails;
                        }
                    } catch {
                        // Ignore
                    }
                }
            }
        }

        return optimizedEvt;
    });

    // Encode as TOON or JSON depending on config
    if (OPTIMIZER_CONFIG.enableToonEncoding) {
        try {
            // Force YAML format by ensuring field variation
            // TOON uses CSV format when all objects have identical keys
            // We add a dummy field to the first event to force YAML format
            const eventsToEncode = optimized.length > 0
                ? [{ ...optimized[0], _format: 'yaml' }, ...optimized.slice(1)]
                : optimized;

            const toonEncoded = encode({ events: eventsToEncode });

            // Remove the dummy field from output and unescape newlines
            const cleaned = toonEncoded
                .replace(/_format: yaml\n\s*/g, '')  // Remove dummy field
                .replace(/\\n/g, '\n')                // Unescape newlines
                .replace(/\\t/g, '\t');               // Unescape tabs

            return cleaned;
        } catch (error) {
            console.warn('TOON encoding failed, falling back to JSON:', error);
            return JSON.stringify(optimized, null, 2);
        }
    }

    return JSON.stringify(optimized, null, 2);
}

/**
 * Collapse consecutive input events on the same element into one with final value.
 */
export function debounceInputEvents(events: QAEvent[]): QAEvent[] {
    const result: QAEvent[] = [];
    let currentInputGroup: QAEvent[] = [];
    let currentSelector: string | null = null;

    const flush = () => {
        if (currentInputGroup.length > 0) {
            // Take the last event (has final value)
            result.push(currentInputGroup[currentInputGroup.length - 1]);
            currentInputGroup = [];
            currentSelector = null;
        }
    };

    for (const event of events) {
        if (event.type === EventType.ACTION && event.details) {
            try {
                const details = JSON.parse(event.details);
                if (details.action === 'input') {
                    // Build a unique selector for this input element
                    // Priority: use existing selector, or build from element + id/dataTestId
                    let selector: string;
                    if (details.selector) {
                        selector = details.selector;
                    } else {
                        // Fallback: use element type + text (semantic label from message)
                        // Extract semantic label from message: "Typed in: \"label\""
                        const labelMatch = event.message.match(/Typed in: "(.+)"/);
                        const label = labelMatch ? labelMatch[1] : '';
                        selector = `${details.element}:${label}`;
                    }

                    if (selector === currentSelector) {
                        // Same input, group it
                        currentInputGroup.push(event);
                    } else {
                        // Different input, flush previous and start new group
                        flush();
                        currentSelector = selector;
                        currentInputGroup.push(event);
                    }
                    continue;
                }
            } catch {
                // Not parseable, treat as regular event
            }
        }

        // Not an input event, flush any pending group and add this event
        flush();
        result.push(event);
    }

    // Flush remaining group
    flush();

    return result;
}

/**
 * Filter out static resource requests (fonts, images, 200 OK responses).
 */
export function filterStaticResources(events: QAEvent[]): QAEvent[] {
    const staticExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.otf', '.woff', '.woff2', '.ttf', '.ico'];

    return events.filter((event) => {
        if (event.type !== EventType.NETWORK) return true;

        const message = event.message.toLowerCase();

        // Check if it's a 200 or 304 response to a static resource
        if (message.startsWith('200 ') || message.startsWith('304 ')) {
            for (const ext of staticExtensions) {
                if (message.includes(ext)) {
                    return false; // Filter out
                }
            }
        }

        // Also filter Lottie animations
        if (message.includes('.json') && (message.includes('animation') || message.includes('lottie'))) {
            if (message.startsWith('200 ') || message.startsWith('304 ')) {
                return false;
            }
        }

        return true;
    });
}

/**
 * Deduplicate consecutive identical network requests.
 */
export function deduplicateNetworkEvents(events: QAEvent[]): QAEvent[] {
    const result: QAEvent[] = [];
    const recentRequests = new Map<string, number>();

    for (const event of events) {
        if (event.type === EventType.NETWORK) {
            const currentTime = new Date(event.timestamp).getTime();
            const lastTime = recentRequests.get(event.message);

            // If the same network event happened within 1 second, skip it.
            if (lastTime !== undefined && (currentTime - lastTime) < 1000) {
                continue;
            }

            recentRequests.set(event.message, currentTime);
        }

        result.push(event);
    }

    return result;
}

/**
 * Sanitize sensitive data (tokens, long alphanumeric strings).
 */
export function sanitizeSensitiveData(event: QAEvent): QAEvent {
    if (!event.details) return event;

    let details = event.details;

    // Regex to find long alphanumeric strings (likely tokens, hashes)
    // Match sequences of 40+ alphanumeric chars (common for JWT, tokens, etc)
    const tokenPattern = /[a-zA-Z0-9_-]{40,}/g;

    details = details.replace(tokenPattern, (match) => {
        return `<REDACTED:${match.length}chars>`;
    });

    // Also sanitize Authorization headers
    details = details.replace(
        /"authorization":\s*"[^"]+"/gi,
        '"authorization": "<REDACTED>"'
    );
    details = details.replace(
        /"bearer\s+[^"]+"/gi,
        '"bearer <REDACTED>"'
    );

    return {
        ...event,
        details,
    };
}

/**
 * Simplify timestamp from ISO to relative time (mm:ss or HH:mm:ss).
 */
export function simplifyTimestamp(isoTimestamp: string, sessionStart: number): string {
    try {
        const eventTime = new Date(isoTimestamp).getTime();
        const relativeMs = Math.max(0, eventTime - sessionStart);

        const hours = Math.floor(relativeMs / 3600000);
        const minutes = Math.floor((relativeMs % 3600000) / 60000);
        const seconds = Math.floor((relativeMs % 60000) / 1000);
        const ms = Math.floor((relativeMs % 1000) / 100); // One decimal place

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms}`;
    } catch {
        return isoTimestamp;
    }
}

/**
 * Prune unnecessary HTTP headers from network event details.
 */
export function pruneNetworkHeaders(details: string): string {
    try {
        const obj = JSON.parse(details);

        if (obj.headers) {
            const unnecessaryHeaders = [
                'user-agent',
                'sec-ch-ua',
                'sec-ch-ua-mobile',
                'sec-ch-ua-platform',
                'sec-fetch-site',
                'sec-fetch-mode',
                'sec-fetch-dest',
                'accept-encoding',
                'accept-language',
                'cache-control',
                'pragma',
                'upgrade-insecure-requests',
            ];

            unnecessaryHeaders.forEach((header) => {
                delete obj.headers[header];
            });

            // If headers object is now empty or only has 1-2 items, remove it entirely
            if (Object.keys(obj.headers).length <= 2) {
                delete obj.headers;
            }
        }

        return JSON.stringify(obj);
    } catch {
        return details;
    }
}

/**
 * Abbreviate event types to save tokens.
 */
function abbreviateEventType(type: EventType): string {
    const abbreviations: Record<EventType, string> = {
        [EventType.CONSOLE]: 'CON',
        [EventType.NETWORK]: 'NET',
        [EventType.ACTION]: 'ACT',
        [EventType.NOTE]: 'NOTE',
        [EventType.FLAG]: 'FLAG',
        [EventType.BUG]: 'BUG',
        [EventType.SCREENSHOT]: 'SHOT',
        [EventType.PAGE_RELOAD]: 'RELOAD',
        [EventType.CRAWL]: 'CRAWL',
        [EventType.SERVER_LOG]: 'SVR',
    };

    return abbreviations[type] || type;
}
