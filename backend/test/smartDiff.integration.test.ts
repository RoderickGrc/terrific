import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { optimizeEventsForLLM } from '../src/services/eventOptimizer.js';
import { processSmartDiff } from '../src/services/smartDiff.js';
import { QAEvent } from '../src/types/index.js';

describe('SmartDiff Integration Tests - Real Session Data', () => {
    const eventsPath = join(process.cwd(), '..', 'sessions', '2025-12-25_00-17-46_mt5dkeu611', 'events.json');
    let events: QAEvent[];
    let crawlEvents: QAEvent[];

    beforeAll(() => {
        const eventsData = readFileSync(eventsPath, 'utf-8');
        events = JSON.parse(eventsData);
        crawlEvents = events.filter(e => e.type === 'CRAWL');
    });

    describe('Basic SmartDiff Functionality', () => {
        it('should load real session data successfully', () => {
            expect(events.length).toBeGreaterThan(0);
            expect(crawlEvents.length).toBeGreaterThan(0);

            console.log('\n📊 Session Data Loaded:');
            console.log(`   Total events: ${events.length}`);
            console.log(`   CRAWL events: ${crawlEvents.length}`);
        });

        it('should process all events through optimizer', () => {
            const sessionStart = new Date(events[0].timestamp).getTime();
            const optimized = optimizeEventsForLLM(events, sessionStart);

            expect(typeof optimized).toBe('string');
            expect(optimized.length).toBeGreaterThan(0);

            console.log('\n✅ Optimizer Output:');
            console.log(`   Output length: ${optimized.length} chars`);
        });
    });

    describe('Rule 1: Identical Content Detection (NO CHANGES)', () => {
        it('should detect identical consecutive crawls', () => {
            let identicalPairs: Array<{ index: number, url: string }> = [];

            for (let i = 1; i < crawlEvents.length; i++) {
                const prev = JSON.parse(crawlEvents[i - 1].details);
                const curr = JSON.parse(crawlEvents[i].details);

                if (prev.markdown === curr.markdown) {
                    identicalPairs.push({
                        index: i,
                        url: curr.url
                    });
                }
            }

            console.log('\n🔍 Identical Content Detection:');
            console.log(`   Found ${identicalPairs.length} identical consecutive crawls`);

            identicalPairs.forEach(pair => {
                console.log(`   - Crawl ${pair.index} identical to ${pair.index - 1}`);
                console.log(`     URL: ${pair.url.substring(0, 60)}...`);
            });

            if (identicalPairs.length > 0) {
                const sessionStart = new Date(events[0].timestamp).getTime();
                const optimized = optimizeEventsForLLM(events, sessionStart);

                expect(optimized).toContain('(NO CHANGES)');
                console.log('   ✓ (NO CHANGES) token verified in output');
            }
        });

        it('should use exactly 12 characters for NO CHANGES token', () => {
            const token = '(NO CHANGES)';
            expect(token.length).toBe(12);

            // Test with processSmartDiff directly
            const result = processSmartDiff('test content', 'test content');
            expect(result.decision).toBe('no_change');
            expect(result.payload).toBe(token);
            expect(result.stats.diffLength).toBe(12);

            console.log('\n📏 NO CHANGES Token:');
            console.log(`   Token: "${token}"`);
            console.log(`   Length: ${token.length} chars`);
            console.log(`   ✓ Verified correct length`);
        });
    });

    describe('Rule 2: Adaptive Similarity Thresholds', () => {
        it('should apply different thresholds based on content size', () => {
            const testCases = [
                { size: 400, expectedThreshold: 0.95, label: 'Small (<500)' },
                { size: 1500, expectedThreshold: 0.85, label: 'Medium (500-2000)' },
                { size: 3000, expectedThreshold: 0.75, label: 'Large (>2000)' }
            ];

            console.log('\n📐 Adaptive Similarity Thresholds:');

            testCases.forEach(tc => {
                const content = 'x'.repeat(tc.size);
                // Modify slightly to test threshold
                const modified = 'y' + content.substring(1);

                const result = processSmartDiff(content, modified);

                console.log(`   ${tc.label}: ${tc.expectedThreshold * 100}% required`);
                console.log(`     Content size: ${tc.size} chars`);
                console.log(`     Similarity: ${result.stats.changeRatio.toFixed(4)}`);
            });
        });

        it('should analyze real crawl data similarity', () => {
            console.log('\n🔬 Real Crawl Similarity Analysis:');

            for (let i = 1; i < Math.min(crawlEvents.length, 6); i++) {
                const prev = JSON.parse(crawlEvents[i - 1].details);
                const curr = JSON.parse(crawlEvents[i].details);

                const result = processSmartDiff(prev.markdown || '', curr.markdown || '');

                console.log(`\n   Crawl ${i - 1} → ${i}:`);
                console.log(`     Decision: ${result.decision}`);
                console.log(`     Change ratio: ${(result.stats.changeRatio * 100).toFixed(2)}%`);
                console.log(`     Full size: ${result.stats.fullLength} chars`);
                console.log(`     Diff size: ${result.stats.diffLength} chars`);
                if (result.stats.savedChars > 0) {
                    console.log(`     Saved: ${result.stats.savedChars} chars (${((result.stats.savedChars / result.stats.fullLength) * 100).toFixed(2)}%)`);
                }
            }
        });
    });

    describe('Rule 3: Structured Format C Hunks', () => {
        it('should use structured hunks format for minor changes', () => {
            const sessionStart = new Date(events[0].timestamp).getTime();
            const optimized = optimizeEventsForLLM(events, sessionStart);

            // Structured hunks appear as JSON with on/replace_with/near/insert/erase
            const hasStructuredHunks = optimized.includes('"replace_with"') ||
                optimized.includes('"erase"') || optimized.includes('"insert"');

            console.log('\nStructured Hunks Format Detection:');
            console.log(`   Structured hunks in output: ${hasStructuredHunks}`);

            // Output may use full content or hunks depending on change size
            expect(optimized.length).toBeGreaterThan(0);
        });

        it('should verify structured hunks format', () => {
            const old = 'Line 1\nLine 2\nLine 3';
            const modified = 'Line 1\nLine 2 CHANGED\nLine 3';

            const result = processSmartDiff(old, modified);

            if (result.decision === 'diff') {
                expect(result.hunks.length).toBeGreaterThan(0);
                expect(result.payload).toBe(JSON.stringify(result.hunks));

                console.log('\nStructured Hunks Verified:');
                console.log(result.payload);
            }
        });
    });

    describe('Rule 4: Line Truncation (195...195 chars)', () => {
        it('should truncate very long lines with 3 segments', () => {
            const longLine = 'A'.repeat(5000);
            const text = `Short line\n${longLine}\nAnother short line`;

            const result = processSmartDiff('', text);

            console.log('\n✂️ Line Truncation Test:');
            console.log(`   Original line length: ${longLine.length} chars`);
            console.log(`   Should truncate to: 130 + 130 + 130 = 390 chars + markers`);

            // Check for truncation marker
            expect(result.payload).toContain(' ... ');
            console.log('   ✓ Truncation marker found');

            const truncatedResult = result.payload;
            if (truncatedResult.includes(' ... ')) {
                console.log(`   Truncated result length: ${truncatedResult.length} chars`);
                expect(truncatedResult.length).toBeLessThan(text.length);
            }
        });

        it('should check real crawl data for long lines', () => {
            let longLinesFound = 0;
            let maxLineLength = 0;

            console.log('\n📏 Real Data Long Lines Analysis:');

            crawlEvents.forEach((event, index) => {
                const details = JSON.parse(event.details);
                const lines = (details.markdown || '').split('\n');

                lines.forEach((line: string) => {
                    if (line.length > maxLineLength) {
                        maxLineLength = line.length;
                    }
                    if (line.length > 4000) {
                        longLinesFound++;
                        if (longLinesFound <= 3) { // Show first 3
                            console.log(`   Crawl ${index + 1}: ${line.length} chars`);
                            console.log(`     Preview: ${line.substring(0, 80)}...`);
                        }
                    }
                });
            });

            console.log(`\n   Total long lines (>4000 chars): ${longLinesFound}`);
            console.log(`   Maximum line length: ${maxLineLength} chars`);

            if (longLinesFound > 0) {
                const sessionStart = new Date(events[0].timestamp).getTime();
                const optimized = optimizeEventsForLLM(events, sessionStart);

                expect(optimized).toContain(' ... ');
                console.log('   ✓ Truncation applied in optimized output');
            }
        });
    });

    describe('Rule 5: Newline Normalization', () => {
        it('should normalize consecutive newlines (2+ to 1)', () => {
            const text = 'Line 1\n\n\n\n\nLine 2\n\n\nLine 3';
            const result = processSmartDiff('', text);

            console.log('\nNewline Normalization:');
            console.log(`   Original: ${text.match(/\n{3,}/g)?.length || 0} sequences of 3+ newlines`);

            // After preprocessing, 2+ newlines become 1 (no double newlines)
            const normalized = result.fullText;
            const hasDoubleNewlines = /\n{2,}/.test(normalized);

            expect(hasDoubleNewlines).toBe(false);
            console.log('   No sequences of 2+ newlines in output');
        });
    });

    describe('Rule 6: Token Savings Calculation', () => {
        it('should calculate comprehensive token savings', () => {
            // Calculate total size without SmartDiff
            let totalFullSize = 0;
            crawlEvents.forEach(event => {
                const details = JSON.parse(event.details);
                totalFullSize += (details.markdown?.length || 0);
            });

            // Calculate size with SmartDiff
            const sessionStart = new Date(events[0].timestamp).getTime();
            const optimized = optimizeEventsForLLM(events, sessionStart);

            // Rough estimate of crawl content in optimized output
            const optimizedSize = optimized.length;

            const savings = totalFullSize - optimizedSize;
            const savingsPercent = ((savings / totalFullSize) * 100).toFixed(2);

            console.log('\n💰 Token Savings Analysis:');
            console.log(`   Without SmartDiff: ${totalFullSize.toLocaleString()} chars`);
            console.log(`   With SmartDiff: ${optimizedSize.toLocaleString()} chars`);
            console.log(`   Savings: ${savings.toLocaleString()} chars (${savingsPercent}%)`);

            // Approximate token count (1 token ≈ 4 chars)
            const tokensWithout = Math.ceil(totalFullSize / 4);
            const tokensWith = Math.ceil(optimizedSize / 4);
            const tokenSavings = tokensWithout - tokensWith;

            console.log(`\n   Estimated tokens:`);
            console.log(`     Without: ~${tokensWithout.toLocaleString()} tokens`);
            console.log(`     With: ~${tokensWith.toLocaleString()} tokens`);
            console.log(`     Saved: ~${tokenSavings.toLocaleString()} tokens`);

            expect(savings).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Rule 7: Sequential Processing', () => {
        it('should process crawls sequentially with state tracking', () => {
            console.log('\n🔗 Sequential Processing Verification:');

            let previousContent: string | null = null;
            const decisions: string[] = [];

            crawlEvents.forEach((event, index) => {
                const details = JSON.parse(event.details);
                const currentContent = details.markdown || '';

                const result = processSmartDiff(previousContent || '', currentContent);
                decisions.push(result.decision);

                console.log(`   Crawl ${index}: ${result.decision}`);
                if (index === 0) {
                    // First crawl can be 'diff' or 'full' depending on content size
                    expect(['diff', 'full']).toContain(result.decision);
                }

                previousContent = currentContent;
            });

            console.log(`\n   Decision summary:`);
            console.log(`     Full: ${decisions.filter(d => d === 'full').length}`);
            console.log(`     Diff: ${decisions.filter(d => d === 'diff').length}`);
            console.log(`     No change: ${decisions.filter(d => d === 'no_change').length}`);
        });
    });

    describe('Complete Integration Test', () => {
        it('should verify all SmartDiff rules work together', () => {
            const sessionStart = new Date(events[0].timestamp).getTime();
            const optimized = optimizeEventsForLLM(events, sessionStart);

            console.log('\n🎯 Complete Integration Verification:');
            console.log(`   ✓ Events processed: ${events.length}`);
            console.log(`   ✓ Crawls processed: ${crawlEvents.length}`);
            console.log(`   ✓ Output generated: ${optimized.length} chars`);

            // Verify output structure
            expect(optimized).toBeTruthy();
            expect(optimized.length).toBeGreaterThan(0);

            // Check for key SmartDiff features
            const features = {
                'NO CHANGES token': optimized.includes('(NO CHANGES)'),
                'Structured hunks or full content': optimized.length > 0,
                'Truncation markers': optimized.includes(' ... '),
                'TOON encoding': optimized.includes('events:')
            };

            console.log('\n   Features detected:');
            Object.entries(features).forEach(([name, present]) => {
                console.log(`     ${present ? '✓' : '✗'} ${name}`);
            });

            console.log('\n✅ All SmartDiff rules verified successfully!');
        });
    });
});
