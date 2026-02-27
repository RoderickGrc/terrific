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
    enableViteReloadCollapse: true,
};

interface NetworkMetadata {
    method?: string;
    status?: number;
    url?: string;
}

interface ParsedNetworkEvent {
    method?: string;
    status?: number;
    url?: string;
    requestBody?: unknown;
    responseBody?: unknown;
    kind: 'request' | 'response' | 'unknown';
    matchKey?: string;
    urlKey?: string;
}

interface CorrelatedNetworkResponse {
    timestamp: string;
    status?: number;
    body?: unknown;
}

interface CorrelatedNetworkEvent {
    optimizedKind: 'correlated_network';
    id: string;
    type: EventType.NETWORK;
    timestamp: string;
    message: string;
    requestBody?: unknown;
    response: CorrelatedNetworkResponse | null;
}

type OptimizerPipelineEvent = QAEvent | CorrelatedNetworkEvent;

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const REQUEST_LINE_REGEX = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/i;
const RESPONSE_LINE_REGEX = /^(\d{3})\s+(\S+)/;
const VITE_NOISE_PATH_PREFIXES = [
    '/@vite/client',
    '/@react-refresh',
    '/src/',
    '/node_modules/.vite/',
    '/@fs/',
    '/@id/',
    '/node_modules/vite/dist/client/',
];
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const VOLATILE_MATCH_QUERY_PARAMS = new Set(['t', 'v']);
const VITE_BURST_WINDOW_MS = 1500;

function tryParseJson(value?: string): any {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        return undefined;
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        return undefined;
    }
}

function parseStatus(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
    }

    if (typeof value === 'string' && /^\d{3}$/.test(value.trim())) {
        return Number(value.trim());
    }

    return undefined;
}

function parseMethod(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const upper = value.trim().toUpperCase();
    if (!HTTP_METHODS.has(upper)) {
        return undefined;
    }

    return upper;
}

function parseUrlFromUnknown(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function parseUrl(url: string): URL | null {
    try {
        return new URL(url, 'http://localhost');
    } catch {
        return null;
    }
}

function normalizeUrlForMatching(url: string): string {
    const parsed = parseUrl(url);
    if (!parsed) {
        return url.trim();
    }

    const normalizedParams: Array<[string, string]> = [];
    for (const [key, value] of parsed.searchParams.entries()) {
        if (VOLATILE_MATCH_QUERY_PARAMS.has(key.toLowerCase())) {
            continue;
        }
        normalizedParams.push([key, value]);
    }

    normalizedParams.sort(([aKey, aVal], [bKey, bVal]) => {
        if (aKey === bKey) {
            return aVal.localeCompare(bVal);
        }
        return aKey.localeCompare(bKey);
    });

    const search = normalizedParams.length > 0
        ? `?${normalizedParams.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`
        : '';
    const normalizedPath = parsed.pathname || '/';
    const isAbsolute = /^https?:\/\//i.test(url.trim());

    if (isAbsolute) {
        return `${parsed.protocol}//${parsed.host}${normalizedPath}${search}`;
    }

    return `${normalizedPath}${search}`;
}

function buildNetworkMatchKey(method?: string, url?: string): string | undefined {
    if (!method || !url) {
        return undefined;
    }

    return `${method} ${normalizeUrlForMatching(url)}`;
}

function parseNetworkEvent(event: QAEvent): ParsedNetworkEvent {
    const details = tryParseJson(event.details);
    const requestMatch = event.message.match(REQUEST_LINE_REGEX);
    const responseMatch = event.message.match(RESPONSE_LINE_REGEX);

    const methodFromMessage = parseMethod(requestMatch?.[1]);
    const urlFromMessage = parseUrlFromUnknown(requestMatch?.[2] || responseMatch?.[2]);
    const statusFromMessage = parseStatus(responseMatch?.[1]);

    const methodFromDetails = parseMethod(details?.method);
    const urlFromDetails = parseUrlFromUnknown(details?.url);
    const statusFromDetails = parseStatus(details?.status);

    const method = methodFromMessage || methodFromDetails;
    const url = urlFromMessage || urlFromDetails;
    const status = statusFromMessage ?? statusFromDetails;
    const requestBody = details?.body;
    const responseBody = details?.responseBody;

    let kind: ParsedNetworkEvent['kind'] = 'unknown';
    if (requestMatch) {
        kind = 'request';
    } else if (responseMatch) {
        kind = 'response';
    } else if (method && !status) {
        kind = 'request';
    } else if (status && !method) {
        kind = 'response';
    } else if (method && status) {
        kind = 'response';
    }

    const urlKey = url ? normalizeUrlForMatching(url) : undefined;
    const matchKey = buildNetworkMatchKey(method, url);

    return {
        method,
        status,
        url,
        requestBody,
        responseBody,
        kind,
        matchKey,
        urlKey,
    };
}

function buildNetworkMessage(parsed: ParsedNetworkEvent, fallback: string): string {
    if (parsed.method && parsed.url) {
        return `${parsed.method} ${parsed.url}`;
    }
    if (parsed.url) {
        return `NET ${parsed.url}`;
    }
    return fallback;
}

function extractNetworkMetadata(event: QAEvent): NetworkMetadata {
    if (event.type !== EventType.NETWORK) {
        return {};
    }

    const parsed = parseNetworkEvent(event);
    return {
        method: parsed.method,
        status: parsed.status,
        url: parsed.url,
    };
}

function isErrorStatus(status?: number): boolean {
    return typeof status === 'number' && status >= 400 && status <= 599;
}

function isViteReloadNoise(url?: string): boolean {
    if (!url) {
        return false;
    }

    const parsed = parseUrl(url);
    if (!parsed) {
        return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (!LOCAL_DEV_HOSTS.has(host)) {
        return false;
    }

    return VITE_NOISE_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));
}

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

/**
 * Extract only the schema (field names and types) from response bodies.
 * This significantly reduces token count while preserving structural information.
 */
function extractSchemaOnly(obj: any, depth: number = 0): string {
    if (obj === null) return 'null';
    if (obj === undefined) return 'undefined';

    const type = typeof obj;

    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';

    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        // For arrays, show schema of first item with count
        const firstItemSchema = extractSchemaOnly(obj[0], depth + 1);
        return `[${firstItemSchema}]×${obj.length}`;
    }

    if (type === 'object') {
        // Prevent infinite recursion
        if (depth > 3) return '{...}';

        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';

        // For nested objects, show field names with their types
        if (depth === 0) {
            // Root level: compact inline format
            const fields = keys.map(key => {
                const value = obj[key];
                const valueType = extractSchemaOnly(value, depth + 1);
                // Only show type annotation for primitives or simple arrays
                if (typeof value === 'object' && value !== null) {
                    return key; // Just the field name for objects
                }
                return `${key}:${valueType}`;
            });
            return `{${fields.join(', ')}}`;
        } else {
            // Nested level: just list the keys
            return `{${keys.join(', ')}}`;
        }
    }

    return String(obj);
}

interface OptimizedEvent {
    t: string;       // Timestamp: "HH:mm:ss.ms" or "mm:ss" relative
    type: string;    // Event type abbreviated
    msg: string;     // Clean message
    val?: string;    // Final value (for grouped inputs)
    details?: any;   // Pruned details if relevant (parsed JSON for natural look)
    body?: any;      // Processed request body (for NETWORK POST/PUT/PATCH)
    response?: {
        t: string;
        status?: number;
        body?: string;
    } | null;
}

function summarizeResponseBody(body: unknown): string | undefined {
    if (body === undefined || body === null) {
        return undefined;
    }

    if (typeof body === 'string') {
        return truncateWithContext(body, 50);
    }

    return extractSchemaOnly(body);
}

function isCorrelatedNetworkEvent(event: OptimizerPipelineEvent): event is CorrelatedNetworkEvent {
    return (event as CorrelatedNetworkEvent).optimizedKind === 'correlated_network';
}

function correlateNetworkEvents(events: QAEvent[]): OptimizerPipelineEvent[] {
    const parsedByIndex = new Map<number, ParsedNetworkEvent>();
    const pendingRequestByKey = new Map<string, number[]>();
    const requestToResponse = new Map<number, number>();
    const matchedResponses = new Set<number>();

    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (event.type !== EventType.NETWORK) {
            continue;
        }

        const parsed = parseNetworkEvent(event);
        parsedByIndex.set(index, parsed);

        if (parsed.kind === 'request') {
            if (parsed.matchKey) {
                const queue = pendingRequestByKey.get(parsed.matchKey) || [];
                queue.push(index);
                pendingRequestByKey.set(parsed.matchKey, queue);
            }
            continue;
        }

        if (parsed.kind !== 'response') {
            continue;
        }

        let matchedRequestIndex: number | undefined;
        if (parsed.matchKey) {
            const queue = pendingRequestByKey.get(parsed.matchKey);
            if (queue && queue.length > 0) {
                matchedRequestIndex = queue.shift();
            }
        }

        if (matchedRequestIndex === undefined && parsed.urlKey) {
            let oldestKey: string | undefined;
            let oldestRequestIndex: number | undefined;

            for (const [key, queue] of pendingRequestByKey.entries()) {
                if (queue.length === 0) {
                    continue;
                }

                const firstIndex = queue[0];
                const firstParsed = parsedByIndex.get(firstIndex);
                if (!firstParsed || firstParsed.urlKey !== parsed.urlKey) {
                    continue;
                }

                if (oldestRequestIndex === undefined || firstIndex < oldestRequestIndex) {
                    oldestRequestIndex = firstIndex;
                    oldestKey = key;
                }
            }

            if (oldestKey !== undefined && oldestRequestIndex !== undefined) {
                pendingRequestByKey.get(oldestKey)?.shift();
                matchedRequestIndex = oldestRequestIndex;
            }
        }

        if (matchedRequestIndex !== undefined) {
            requestToResponse.set(matchedRequestIndex, index);
            matchedResponses.add(index);
        }
    }

    const output: OptimizerPipelineEvent[] = [];

    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (event.type !== EventType.NETWORK) {
            output.push(event);
            continue;
        }

        const parsed = parsedByIndex.get(index) || parseNetworkEvent(event);

        if (parsed.kind === 'request') {
            const responseIndex = requestToResponse.get(index);
            const response = responseIndex !== undefined
                ? events[responseIndex]
                : undefined;
            const parsedResponse = responseIndex !== undefined
                ? (parsedByIndex.get(responseIndex) || parseNetworkEvent(response!))
                : undefined;

            output.push({
                optimizedKind: 'correlated_network',
                id: event.id,
                type: EventType.NETWORK,
                timestamp: event.timestamp,
                message: buildNetworkMessage(parsed, event.message),
                requestBody: parsed.requestBody,
                response: response && parsedResponse
                    ? {
                        timestamp: response.timestamp,
                        status: parsedResponse.status,
                        body: parsedResponse.responseBody,
                    }
                    : null,
            });
            continue;
        }

        if (parsed.kind === 'response') {
            if (matchedResponses.has(index)) {
                continue;
            }

            output.push({
                optimizedKind: 'correlated_network',
                id: event.id,
                type: EventType.NETWORK,
                timestamp: event.timestamp,
                message: buildNetworkMessage(parsed, event.message),
                response: {
                    timestamp: event.timestamp,
                    status: parsed.status,
                    body: parsed.responseBody,
                },
            });
            continue;
        }

        output.push(event);
    }

    return output;
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

    if (OPTIMIZER_CONFIG.enableViteReloadCollapse) {
        processedEvents = collapseViteReloadNoise(processedEvents);
    }

    if (OPTIMIZER_CONFIG.enableStaticResourceFiltering) {
        processedEvents = filterStaticResources(processedEvents);
    }

    if (OPTIMIZER_CONFIG.enableSensitiveDataSanitization) {
        processedEvents = processedEvents.map((event) => sanitizeSensitiveData(event));
    }

    const pipelineEvents = correlateNetworkEvents(processedEvents);

    // Track previous crawl for sequential SmartDiff processing
    let previousCrawlContent: string | null = null;

    // Map to optimized format
    const optimized: OptimizedEvent[] = pipelineEvents.map((event) => {
        const evt = event;

        const timestamp = OPTIMIZER_CONFIG.enableTimestampSimplification
            ? simplifyTimestamp(evt.timestamp, sessionStart)
            : evt.timestamp;

        if (isCorrelatedNetworkEvent(evt)) {
            const summarizedResponseBody = evt.response
                ? summarizeResponseBody(evt.response.body)
                : undefined;

            const optimizedEvt: OptimizedEvent = {
                t: timestamp,
                type: abbreviateEventType(evt.type),
                msg: evt.message,
                response: evt.response
                    ? {
                        t: OPTIMIZER_CONFIG.enableTimestampSimplification
                            ? simplifyTimestamp(evt.response.timestamp, sessionStart)
                            : evt.response.timestamp,
                        ...(evt.response.status !== undefined ? { status: evt.response.status } : {}),
                        ...(summarizedResponseBody ? { body: summarizedResponseBody } : {}),
                    }
                    : null,
            };

            if (evt.requestBody !== undefined) {
                optimizedEvt.body = processPayloadRecursive(evt.requestBody);
            }

            return optimizedEvt;
        }

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

        // Extract request body for network events that were not correlated
        if (evt.type === EventType.NETWORK && rawDetails) {
            try {
                const detailsObj = JSON.parse(rawDetails);
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
                    // For all ACTION events, only keep essentials
                    try {
                        const detailsObj = typeof details === 'string' ? JSON.parse(details) : details;
                        const simplifiedDetails: any = {};

                        // Essential fields for all action types (click, input, change)
                        if (detailsObj.action) simplifiedDetails.action = detailsObj.action;
                        if (detailsObj.element) simplifiedDetails.element = detailsObj.element;
                        if (detailsObj.selector) simplifiedDetails.selector = detailsObj.selector;
                        if (detailsObj.value !== undefined) simplifiedDetails.value = detailsObj.value;
                        if (detailsObj.xpath) simplifiedDetails.xpath = detailsObj.xpath;

                        // Include placeholder for inputs (useful context)
                        if (detailsObj.attributes?.placeholder) {
                            simplifiedDetails.placeholder = detailsObj.attributes.placeholder;
                        }

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
                .replace(/\n\s*_format:\s*yaml/g, '') // Remove dummy field line only
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
            const { status } = extractNetworkMetadata(event);
            if (isErrorStatus(status)) {
                result.push(event);
                continue;
            }

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

export function collapseViteReloadNoise(events: QAEvent[]): QAEvent[] {
    const viteCandidates: Array<{ index: number; event: QAEvent; timestampMs: number; url?: string }> = [];

    for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        if (event.type !== EventType.NETWORK) {
            continue;
        }

        const { status, url } = extractNetworkMetadata(event);
        if (isErrorStatus(status) || !isViteReloadNoise(url)) {
            continue;
        }

        viteCandidates.push({
            index,
            event,
            timestampMs: new Date(event.timestamp).getTime(),
            url,
        });
    }

    if (viteCandidates.length === 0) {
        return events;
    }

    const groupByStartIndex = new Map<number, Array<{ index: number; event: QAEvent; url?: string }>>();
    let currentGroup: Array<{ index: number; event: QAEvent; url?: string; timestampMs: number }> = [];

    const flushGroup = () => {
        if (currentGroup.length === 0) {
            return;
        }

        groupByStartIndex.set(
            currentGroup[0].index,
            currentGroup.map(({ index, event, url }) => ({ index, event, url }))
        );
        currentGroup = [];
    };

    for (const candidate of viteCandidates) {
        if (currentGroup.length === 0) {
            currentGroup.push(candidate);
            continue;
        }

        const previous = currentGroup[currentGroup.length - 1];
        if ((candidate.timestampMs - previous.timestampMs) <= VITE_BURST_WINDOW_MS) {
            currentGroup.push(candidate);
            continue;
        }

        flushGroup();
        currentGroup.push(candidate);
    }

    flushGroup();

    const skippedIndices = new Set<number>();
    const result: QAEvent[] = [];

    for (let index = 0; index < events.length; index += 1) {
        if (skippedIndices.has(index)) {
            continue;
        }

        const group = groupByStartIndex.get(index);
        if (!group) {
            result.push(events[index]);
            continue;
        }

        if (group.length === 1) {
            result.push(group[0].event);
            continue;
        }

        for (let i = 1; i < group.length; i += 1) {
            skippedIndices.add(group[i].index);
        }

        const uniqueUrls = new Set(group.map((item) => item.url).filter(Boolean));
        const summary: QAEvent = {
            id: `vite-burst-${group[0].event.id}`,
            type: EventType.NETWORK,
            timestamp: group[0].event.timestamp,
            message: `Vite dev reload burst collapsed (${group.length} requests)`,
            details: JSON.stringify({
                summaryType: 'vite_reload_burst',
                collapsedRequestCount: group.length,
                uniqueUrlCount: uniqueUrls.size,
            }),
        };

        result.push(summary);
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
        [EventType.SESSION_STOPPED]: 'STOP',
    };

    return abbreviations[type] || type;
}
