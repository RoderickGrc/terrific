import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateQaReport, QaReportPayload } from './qaReport.js';
import { EventType } from '../types/index.js';

// Mock OpenAI
const mockCreate = vi.fn();
vi.mock('openai', () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            chat: {
                completions: {
                    create: mockCreate,
                },
            },
        })),
    };
});

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-key';

describe('qaReport service', () => {
    beforeEach(() => {
        mockCreate.mockReset();
        mockCreate.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: 'Test report content',
                    },
                },
            ],
        });
    });

    it('should interleave text labels and images in user content', async () => {
        const startTime = new Date('2025-12-23T10:00:00.000Z').getTime();
        const payload: QaReportPayload = {
            session: {
                id: 'test-session',
                startTime,
                events: [],
                config: { initialUrl: 'https://example.com' },
                createdAt: '2025-12-23T10:00:00.000Z',
            } as any,
            filteredEvents: [],
            activeFilters: new Set([EventType.SCREENSHOT]),
            screenshots: [
                { url: 'https://example.com/ss1.png', timestamp: new Date(startTime + 5000).toISOString() }, // 00:05.0
                { url: 'https://example.com/ss2.png', timestamp: new Date(startTime + 65400).toISOString() }, // 01:05.4
            ],
        };

        // Mock fetchImageAsBase64 for the test (it's internal, but we can mock fetch if needed)
        // Actually, qaReport.ts uses global fetch.
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
            headers: { get: () => 'image/png' },
        });

        await generateQaReport(payload);

        expect(mockCreate).toHaveBeenCalled();
        const callArgs = mockCreate.mock.calls[0][0];
        const userMessage = callArgs.messages.find((m: any) => m.role === 'user');
        const content = userMessage.content;

        // Check structure: context, intro, label1, img1, label2, img2
        expect(content[0].type).toBe('text'); // Context
        expect(content[1].type).toBe('text'); // Intro text
        expect(content[1].text).toContain('A continuación se presentan las capturas');

        expect(content[2].type).toBe('text');
        expect(content[2].text).toBe('[Screenshot #1 - 00:05.0]');
        expect(content[3].type).toBe('image_url');
        expect(content[3].image_url.url).toContain('data:image/png;base64');

        expect(content[4].type).toBe('text');
        expect(content[4].text).toBe('[Screenshot #2 - 01:05.4]');
        expect(content[5].type).toBe('image_url');
        expect(content[5].image_url.url).toContain('data:image/png;base64');

        const report = await generateQaReport(payload);
        expect(report).toContain('**Capturas de pantalla de la sesión:**');
        expect(report).toContain('[Screenshot #1 - 00:05.0]');
        expect(report).toContain('[Screenshot #2 - 01:05.4]');
    });

    it('should handle session with no screenshots', async () => {
        const payload: QaReportPayload = {
            session: {
                id: 'test-session',
                startTime: Date.now(),
                events: [],
            } as any,
            filteredEvents: [],
            activeFilters: new Set([]),
            screenshots: [],
        };

        await generateQaReport(payload);

        expect(mockCreate).toHaveBeenCalled();
        const callArgs = mockCreate.mock.calls[0][0];
        const userMessage = callArgs.messages.find((m: any) => m.role === 'user');
        const content = userMessage.content;

        // Should only have the initial context text
        expect(content).toHaveLength(1);
        expect(content[0].type).toBe('text');
    });
});
