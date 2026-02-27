import { describe, it, expect } from 'vitest';
import {
    debounceInputEvents,
    filterStaticResources,
    sanitizeSensitiveData,
    simplifyTimestamp,
    pruneNetworkHeaders,
    optimizeEventsForLLM,
    OPTIMIZER_CONFIG
} from './eventOptimizer.js';
import { QAEvent, EventType } from '../types/index.js';

describe('eventOptimizer', () => {
    describe('debounceInputEvents', () => {
        it('should collapse consecutive input events on same element', () => {
            const events: QAEvent[] = [
                {
                    id: '1',
                    type: EventType.ACTION,
                    message: 'input on INPUT#email',
                    timestamp: '2025-12-22T23:59:28.266Z',
                    details: JSON.stringify({
                        type: 'input',
                        tagName: 'INPUT',
                        id: 'email',
                        className: 'form-input',
                        value: 'r'
                    })
                },
                {
                    id: '2',
                    type: EventType.ACTION,
                    message: 'input on INPUT#email',
                    timestamp: '2025-12-22T23:59:28.472Z',
                    details: JSON.stringify({
                        type: 'input',
                        tagName: 'INPUT',
                        id: 'email',
                        className: 'form-input',
                        value: 'ro'
                    })
                },
                {
                    id: '3',
                    type: EventType.ACTION,
                    message: 'input on INPUT#email',
                    timestamp: '2025-12-22T23:59:28.741Z',
                    details: JSON.stringify({
                        type: 'input',
                        tagName: 'INPUT',
                        id: 'email',
                        className: 'form-input',
                        value: 'user@example.com'
                    })
                }
            ];

            const result = debounceInputEvents(events);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('3');
            const details = JSON.parse(result[0].details!);
            expect(details.value).toBe('user@example.com');
        });

        it('should keep separate groups for different inputs', () => {
            const events: QAEvent[] = [
                {
                    id: '1',
                    type: EventType.ACTION,
                    message: 'input on INPUT#email',
                    timestamp: '2025-12-22T23:59:28.266Z',
                    details: JSON.stringify({
                        type: 'input',
                        tagName: 'INPUT',
                        id: 'email',
                        className: 'form-input',
                        value: 'test@example.com'
                    })
                },
                {
                    id: '2',
                    type: EventType.ACTION,
                    message: 'input on INPUT#password',
                    timestamp: '2025-12-22T23:59:29.266Z',
                    details: JSON.stringify({
                        type: 'input',
                        tagName: 'INPUT',
                        id: 'password',
                        className: 'form-input',
                        value: 'secret'
                    })
                }
            ];

            const result = debounceInputEvents(events);

            expect(result).toHaveLength(2);
        });

        it('should preserve non-input events', () => {
            const events: QAEvent[] = [
                {
                    id: '1',
                    type: EventType.NETWORK,
                    message: 'GET /api/test',
                    timestamp: '2025-12-22T23:59:28.266Z',
                },
                {
                    id: '2',
                    type: EventType.ACTION,
                    message: 'click on BUTTON#submit',
                    timestamp: '2025-12-22T23:59:29.266Z',
                    details: JSON.stringify({
                        type: 'click',
                        tagName: 'BUTTON',
                        id: 'submit'
                    })
                }
            ];

            const result = debounceInputEvents(events);

            expect(result).toHaveLength(2);
            expect(result[0].type).toBe(EventType.NETWORK);
            expect(result[1].type).toBe(EventType.ACTION);
        });
    });

    describe('filterStaticResources', () => {
        it('should filter out 200 responses to static resources', () => {
            const events: QAEvent[] = [
                {
                    id: '1',
                    type: EventType.NETWORK,
                    message: '200 https://example.com/logo.svg',
                    timestamp: '2025-12-22T23:59:28.266Z',
                },
                {
                    id: '2',
                    type: EventType.NETWORK,
                    message: '200 https://example.com/font.otf',
                    timestamp: '2025-12-22T23:59:28.267Z',
                },
                {
                    id: '3',
                    type: EventType.NETWORK,
                    message: '200 https://example.com/api/users',
                    timestamp: '2025-12-22T23:59:28.268Z',
                },
                {
                    id: '4',
                    type: EventType.NETWORK,
                    message: '404 https://example.com/missing.png',
                    timestamp: '2025-12-22T23:59:28.269Z',
                }
            ];

            const result = filterStaticResources(events);

            expect(result).toHaveLength(2);
            expect(result[0].message).toContain('/api/users');
            expect(result[1].message).toContain('404');
        });

        it('should filter Lottie animations', () => {
            const events: QAEvent[] = [
                {
                    id: '1',
                    type: EventType.NETWORK,
                    message: '200 https://example.com/animations/loading.json',
                    timestamp: '2025-12-22T23:59:28.266Z',
                },
                {
                    id: '2',
                    type: EventType.NETWORK,
                    message: '200 https://example.com/api/data.json',
                    timestamp: '2025-12-22T23:59:28.267Z',
                }
            ];

            const result = filterStaticResources(events);

            expect(result).toHaveLength(1);
            expect(result[0].message).toContain('/api/data.json');
        });
    });

    describe('sanitizeSensitiveData', () => {
        it('should truncate long alphanumeric tokens', () => {
            const event: QAEvent = {
                id: '1',
                type: EventType.NETWORK,
                message: 'POST /api/auth',
                timestamp: '2025-12-22T23:59:28.266Z',
                details: JSON.stringify({
                    headers: {
                        authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ'
                    }
                })
            };

            const result = sanitizeSensitiveData(event);

            expect(result.details).toContain('<REDACTED');
            expect(result.details).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
        });

        it('should sanitize authorization headers', () => {
            const event: QAEvent = {
                id: '1',
                type: EventType.NETWORK,
                message: 'GET /api/protected',
                timestamp: '2025-12-22T23:59:28.266Z',
                details: '{"authorization": "Bearer secret-token-12345"}'
            };

            const result = sanitizeSensitiveData(event);

            expect(result.details).toContain('<REDACTED>');
            expect(result.details).not.toContain('secret-token-12345');
        });
    });

    describe('simplifyTimestamp', () => {
        it('should convert to relative mm:ss format', () => {
            const sessionStart = new Date('2025-12-22T23:59:00.000Z').getTime();
            const timestamp = '2025-12-22T23:59:28.500Z';

            const result = simplifyTimestamp(timestamp, sessionStart);

            expect(result).toBe('00:28.5');
        });

        it('should include hours if session is long', () => {
            const sessionStart = new Date('2025-12-22T22:00:00.000Z').getTime();
            const timestamp = '2025-12-22T23:35:45.800Z';

            const result = simplifyTimestamp(timestamp, sessionStart);

            expect(result).toBe('01:35:45.8');
        });
    });

    describe('pruneNetworkHeaders', () => {
        it('should remove unnecessary headers', () => {
            const details = JSON.stringify({
                method: 'GET',
                url: 'https://example.com/api/test',
                headers: {
                    'user-agent': 'Mozilla/5.0...',
                    'sec-ch-ua': 'Chrome',
                    'sec-ch-ua-mobile': '?0',
                    'authorization': 'Bearer token',
                    'content-type': 'application/json',
                    'accept': 'application/json'
                }
            });

            const result = pruneNetworkHeaders(details);
            const parsed = JSON.parse(result);

            expect(parsed.headers).toBeDefined();
            expect(parsed.headers['user-agent']).toBeUndefined();
            expect(parsed.headers['sec-ch-ua']).toBeUndefined();
            expect(parsed.headers['authorization']).toBe('Bearer token');
            expect(parsed.headers['content-type']).toBe('application/json');
        });

        it('should remove headers object if only 1-2 headers remain', () => {
            const details = JSON.stringify({
                method: 'GET',
                headers: {
                    'user-agent': 'Mozilla/5.0...',
                    'sec-ch-ua': 'Chrome'
                }
            });

            const result = pruneNetworkHeaders(details);
            const parsed = JSON.parse(result);

            expect(parsed.headers).toBeUndefined();
        });
    });

    describe('optimizeEventsForLLM', () => {
        it('should produce valid TOON output when enabled', () => {
            const events: QAEvent[] = [
                {
                    id: '1',
                    type: EventType.ACTION,
                    message: 'click on BUTTON#submit',
                    timestamp: '2025-12-22T23:59:28.000Z',
                    details: JSON.stringify({ type: 'click' })
                }
            ];

            const sessionStart = new Date('2025-12-22T23:59:00.000Z').getTime();
            const result = optimizeEventsForLLM(events, sessionStart);

            // Should be TOON format if enabled
            if (OPTIMIZER_CONFIG.enableToonEncoding) {
                expect(result).toContain('events');
            }
            // Should contain some representation of the event
            expect(result.length).toBeGreaterThan(0);
        });

        it('should respect configuration flags', () => {
            const originalConfig = { ...OPTIMIZER_CONFIG };

            // Disable all optimizations
            Object.keys(OPTIMIZER_CONFIG).forEach(key => {
                (OPTIMIZER_CONFIG as any)[key] = false;
            });

            const events: QAEvent[] = [
                {
                    id: '1',
                    type: EventType.NETWORK,
                    message: '200 https://example.com/logo.svg',
                    timestamp: '2025-12-22T23:59:28.000Z',
                }
            ];

            const result = optimizeEventsForLLM(events, Date.now());

            // Should still produce output, just not optimized
            expect(result.length).toBeGreaterThan(0);

            // Restore original config
            Object.assign(OPTIMIZER_CONFIG, originalConfig);
        });
    });
});
