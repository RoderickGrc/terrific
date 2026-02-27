import { describe, it, expect } from 'vitest';
import {
    debounceInputEvents,
    filterStaticResources,
    sanitizeSensitiveData,
    simplifyTimestamp,
    pruneNetworkHeaders,
    collapseViteReloadNoise,
    deduplicateNetworkEvents,
    optimizeEventsForLLM,
    OPTIMIZER_CONFIG
} from './eventOptimizer.js';
import { QAEvent, EventType } from '../types/index.js';

function runOptimizerAsJson(events: QAEvent[], sessionStart: number): any[] {
    const previous = OPTIMIZER_CONFIG.enableToonEncoding;
    OPTIMIZER_CONFIG.enableToonEncoding = false;

    try {
        return JSON.parse(optimizeEventsForLLM(events, sessionStart));
    } finally {
        OPTIMIZER_CONFIG.enableToonEncoding = previous;
    }
}

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
                        action: 'input',
                        selector: '#email',
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
                        action: 'input',
                        selector: '#email',
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
                        action: 'input',
                        selector: '#email',
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
                        action: 'input',
                        selector: '#email',
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
                        action: 'input',
                        selector: '#password',
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

        it('should collapse vite dev reload burst into one summary event', () => {
            const events: QAEvent[] = [
                {
                    id: 'n1',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/@vite/client',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/@vite/client' })
                },
                {
                    id: 'n2',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/@react-refresh',
                    timestamp: '2026-01-01T10:00:00.050Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/@react-refresh' })
                },
                {
                    id: 'n3',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/src/main.tsx',
                    timestamp: '2026-01-01T10:00:00.100Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/src/main.tsx' })
                }
            ];

            const collapsed = collapseViteReloadNoise(events);

            expect(collapsed).toHaveLength(1);
            expect(collapsed[0].message).toContain('Vite dev reload burst collapsed');
        });

        it('should preserve 4xx and 5xx network events', () => {
            const events: QAEvent[] = [
                {
                    id: 'e1',
                    type: EventType.NETWORK,
                    message: '404 http://localhost:5173/src/missing.ts',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({ status: 404, url: 'http://localhost:5173/src/missing.ts' })
                },
                {
                    id: 'e2',
                    type: EventType.NETWORK,
                    message: '500 http://localhost:5173/src/missing.ts',
                    timestamp: '2026-01-01T10:00:00.100Z',
                    details: JSON.stringify({ status: 500, url: 'http://localhost:5173/src/missing.ts' })
                }
            ];

            const deduped = deduplicateNetworkEvents(events);
            const collapsed = collapseViteReloadNoise(deduped);

            expect(collapsed).toHaveLength(2);
            expect(collapsed[0].message).toContain('404');
            expect(collapsed[1].message).toContain('500');
        });

        it('should not collapse non-vite API events', () => {
            const events: QAEvent[] = [
                {
                    id: 'a1',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/api/users',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/api/users' })
                },
                {
                    id: 'a2',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/api/projects',
                    timestamp: '2026-01-01T10:00:00.050Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/api/projects' })
                }
            ];

            const collapsed = collapseViteReloadNoise(events);

            expect(collapsed).toHaveLength(2);
            expect(collapsed[0].id).toBe('a1');
            expect(collapsed[1].id).toBe('a2');
        });

        it('merges request and response NETWORK events', () => {
            const events: QAEvent[] = [
                {
                    id: 'req-1',
                    type: EventType.NETWORK,
                    message: 'GET http://localhost:5173/api/users?page=1',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({
                        method: 'GET',
                        url: 'http://localhost:5173/api/users?page=1&t=123',
                    }),
                },
                {
                    id: 'res-1',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/api/users?page=1',
                    timestamp: '2026-01-01T10:00:00.120Z',
                    details: JSON.stringify({
                        status: 200,
                        url: 'http://localhost:5173/api/users?page=1&t=999',
                        responseBody: [{ id: 1, name: 'Ada' }],
                    }),
                },
            ];

            const optimized = runOptimizerAsJson(events, new Date('2026-01-01T10:00:00.000Z').getTime());
            const net = optimized.find((evt) => evt.type === 'NET');

            expect(net).toBeDefined();
            expect(net.msg).toBe('GET http://localhost:5173/api/users?page=1');
            expect(net.response).toEqual({
                t: '00:00.1',
                status: 200,
                body: '[{id, name}]×1',
            });
            expect(net.status).toBeUndefined();
            expect(net.responseBody).toBeUndefined();
            expect(net.duration).toBeUndefined();
        });

        it('pairs concurrent identical requests FIFO', () => {
            const events: QAEvent[] = [
                {
                    id: 'req-a',
                    type: EventType.NETWORK,
                    message: 'GET http://localhost:5173/api/items?sort=asc&t=1',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({ method: 'GET', url: 'http://localhost:5173/api/items?sort=asc&t=1' }),
                },
                {
                    id: 'req-b',
                    type: EventType.NETWORK,
                    message: 'GET http://localhost:5173/api/items?sort=asc&t=2',
                    timestamp: '2026-01-01T10:00:00.010Z',
                    details: JSON.stringify({ method: 'GET', url: 'http://localhost:5173/api/items?sort=asc&t=2' }),
                },
                {
                    id: 'res-a',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/api/items?sort=asc&t=3',
                    timestamp: '2026-01-01T10:00:00.100Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/api/items?sort=asc&t=3', responseBody: { id: 1 } }),
                },
                {
                    id: 'res-b',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/api/items?sort=asc&t=4',
                    timestamp: '2026-01-01T10:00:00.200Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/api/items?sort=asc&t=4', responseBody: { id: 2 } }),
                },
            ];

            const optimized = runOptimizerAsJson(events, new Date('2026-01-01T10:00:00.000Z').getTime());
            const netEvents = optimized.filter((evt) => evt.type === 'NET');

            expect(netEvents).toHaveLength(2);
            expect(netEvents[0].response?.body).toBe('{id:number}');
            expect(netEvents[1].response?.body).toBe('{id:number}');
            expect(netEvents[0].response?.t).toBe('00:00.1');
            expect(netEvents[1].response?.t).toBe('00:00.2');
        });

        it('emits request NET event with null response when missing response', () => {
            const events: QAEvent[] = [
                {
                    id: 'req-only',
                    type: EventType.NETWORK,
                    message: 'POST https://api.example.com/orders',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({
                        method: 'POST',
                        url: 'https://api.example.com/orders',
                        body: { sku: 'ABC', qty: 2 },
                    }),
                },
            ];

            const optimized = runOptimizerAsJson(events, new Date('2026-01-01T10:00:00.000Z').getTime());
            expect(optimized).toHaveLength(1);
            expect(optimized[0].msg).toBe('POST https://api.example.com/orders');
            expect(optimized[0].response).toBeNull();
            expect(optimized[0].body).toEqual({ sku: 'ABC', qty: 2 });
        });

        it('emits response-only NET event when request is missing', () => {
            const events: QAEvent[] = [
                {
                    id: 'res-only',
                    type: EventType.NETWORK,
                    message: '404 https://api.example.com/orders/999',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({
                        status: 404,
                        url: 'https://api.example.com/orders/999',
                        responseBody: { message: 'not found' },
                    }),
                },
            ];

            const optimized = runOptimizerAsJson(events, new Date('2026-01-01T10:00:00.000Z').getTime());
            expect(optimized).toHaveLength(1);
            expect(optimized[0].msg).toBe('NET https://api.example.com/orders/999');
            expect(optimized[0].response).toEqual({
                t: '00:00.0',
                status: 404,
                body: '{message:string}',
            });
        });

        it('preserves 4xx/5xx vite events from collapse', () => {
            const events: QAEvent[] = [
                {
                    id: 'v1',
                    type: EventType.NETWORK,
                    message: '404 http://127.0.0.1:5173/@vite/client',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({ status: 404, url: 'http://127.0.0.1:5173/@vite/client' }),
                },
                {
                    id: 'v2',
                    type: EventType.NETWORK,
                    message: '500 http://127.0.0.1:5173/src/main.tsx',
                    timestamp: '2026-01-01T10:00:00.100Z',
                    details: JSON.stringify({ status: 500, url: 'http://127.0.0.1:5173/src/main.tsx' }),
                },
            ];

            const collapsed = collapseViteReloadNoise(events);
            expect(collapsed).toHaveLength(2);
            expect(collapsed[0].id).toBe('v1');
            expect(collapsed[1].id).toBe('v2');
        });

        it('collapses vite noise with interleaved events using time window', () => {
            const events: QAEvent[] = [
                {
                    id: 'v1',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/@vite/client',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/@vite/client' }),
                },
                {
                    id: 'a1',
                    type: EventType.ACTION,
                    message: 'click on BUTTON#save',
                    timestamp: '2026-01-01T10:00:00.300Z',
                    details: JSON.stringify({ action: 'click', selector: '#save' }),
                },
                {
                    id: 'v2',
                    type: EventType.NETWORK,
                    message: '200 http://localhost:5173/@id/__x00__react',
                    timestamp: '2026-01-01T10:00:00.700Z',
                    details: JSON.stringify({ status: 200, url: 'http://localhost:5173/@id/__x00__react' }),
                },
            ];

            const collapsed = collapseViteReloadNoise(events);
            expect(collapsed).toHaveLength(2);
            expect(collapsed[0].message).toContain('Vite dev reload burst collapsed (2 requests)');
            expect(collapsed[1].id).toBe('a1');
        });

        it('does not collapse localhost non-vite API events', () => {
            const events: QAEvent[] = [
                {
                    id: 'api-1',
                    type: EventType.NETWORK,
                    message: 'GET http://0.0.0.0:5173/api/users',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({ method: 'GET', url: 'http://0.0.0.0:5173/api/users' }),
                },
                {
                    id: 'api-2',
                    type: EventType.NETWORK,
                    message: 'GET http://0.0.0.0:5173/api/projects',
                    timestamp: '2026-01-01T10:00:00.050Z',
                    details: JSON.stringify({ method: 'GET', url: 'http://0.0.0.0:5173/api/projects' }),
                },
            ];

            const collapsed = collapseViteReloadNoise(events);
            expect(collapsed).toHaveLength(2);
            expect(collapsed[0].id).toBe('api-1');
            expect(collapsed[1].id).toBe('api-2');
        });

        it('keeps NET output free of redundant fields', () => {
            const events: QAEvent[] = [
                {
                    id: 'req-clean',
                    type: EventType.NETWORK,
                    message: 'GET https://api.example.com/health',
                    timestamp: '2026-01-01T10:00:00.000Z',
                    details: JSON.stringify({ method: 'GET', url: 'https://api.example.com/health' }),
                },
                {
                    id: 'res-clean',
                    type: EventType.NETWORK,
                    message: '200 https://api.example.com/health',
                    timestamp: '2026-01-01T10:00:00.050Z',
                    details: JSON.stringify({ status: 200, url: 'https://api.example.com/health' }),
                },
            ];

            const optimized = runOptimizerAsJson(events, new Date('2026-01-01T10:00:00.000Z').getTime());
            const net = optimized[0];

            expect(net.type).toBe('NET');
            expect(net).not.toHaveProperty('duration');
            expect(net).not.toHaveProperty('requestTimestamp');
            expect(net).not.toHaveProperty('status');
            expect(net.response).toEqual({ t: '00:00.0', status: 200 });
        });
    });
});
