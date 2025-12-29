import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { processSmartDiff } from '../src/services/smartDiff.js';
import { QAEvent } from '../src/types/index.js';

describe('SmartDiff Truncation Validation', () => {
    const eventsPath = join(process.cwd(), '..', 'sessions', '2025-12-25_00-17-46_mt5dkeu611', 'events.json');
    let crawlContents: string[] = [];

    beforeAll(() => {
        console.log('🔄 Loading session data...');
        const eventsData = readFileSync(eventsPath, 'utf-8');
        const events: QAEvent[] = JSON.parse(eventsData);
        const crawlEvents = events.filter(e => e.type === 'CRAWL');

        crawlContents = crawlEvents.map(e => {
            const details = JSON.parse(e.details);
            return details.markdown || '';
        });

        console.log(`✅ Loaded ${crawlContents.length} crawls\n`);
    });

    it('should ensure NO lines exceed 400 chars after SmartDiff processing', () => {
        console.log('═══════════════════════════════════════════════');
        console.log('TRUNCATION VALIDATION TEST');
        console.log('═══════════════════════════════════════════════\n');

        let previousContent = '';
        const allProcessedLines: string[] = [];
        let totalLinesProcessed = 0;
        let linesOver400 = 0;
        let linesOver600Input = 0;
        const violatingLines: Array<{ crawl: number, line: number, length: number, preview: string }> = [];

        crawlContents.forEach((currentContent, crawlIndex) => {
            console.log(`\n🔄 Processing crawl ${crawlIndex}...`);

            // Count long lines in INPUT
            const inputLines = currentContent.split('\n');
            const longInputLines = inputLines.filter(l => l.length > 600).length;
            linesOver600Input += longInputLines;
            console.log(`   Input: ${inputLines.length} lines, ${longInputLines} over 600 chars`);

            // Process through SmartDiff
            const result = processSmartDiff(previousContent, currentContent);

            // Analyze OUTPUT
            const outputLines = result.payload.split('\n');
            totalLinesProcessed += outputLines.length;

            let crawlViolations = 0;
            outputLines.forEach((line, lineIndex) => {
                if (line.length > 400) {
                    linesOver400++;
                    crawlViolations++;

                    if (violatingLines.length < 5) { // Keep first 5 for display
                        violatingLines.push({
                            crawl: crawlIndex,
                            line: lineIndex,
                            length: line.length,
                            preview: line.substring(0, 80) + '...'
                        });
                    }
                }
            });

            console.log(`   Output: ${outputLines.length} lines, ${crawlViolations} over 400 chars`);

            // Store for inspection
            allProcessedLines.push(...outputLines);
            previousContent = currentContent;
        });

        console.log('\n═══════════════════════════════════════════════');
        console.log('VALIDATION RESULTS:');
        console.log('═══════════════════════════════════════════════');
        console.log(`Total crawls processed: ${crawlContents.length}`);
        console.log(`Total INPUT lines > 600 chars: ${linesOver600Input}`);
        console.log(`Total OUTPUT lines processed: ${totalLinesProcessed}`);
        console.log(`Total OUTPUT lines > 400 chars: ${linesOver400}`);

        if (linesOver400 > 0) {
            console.log('\n❌ VIOLATIONS FOUND:');
            violatingLines.forEach(v => {
                console.log(`\n   Crawl ${v.crawl}, Line ${v.line}:`);
                console.log(`   Length: ${v.length} chars`);
                console.log(`   Preview: ${v.preview}`);
            });

            if (linesOver400 > 5) {
                console.log(`\n   ... and ${linesOver400 - 5} more violations`);
            }
        } else {
            console.log('\n✅ NO VIOLATIONS - All lines are ≤ 400 characters');
        }

        console.log('═══════════════════════════════════════════════\n');

        // ASSERTION: No lines should exceed 400 chars
        expect(linesOver400).toBe(0);
    });

    it('should verify truncation format is correct (195 ... 195)', () => {
        console.log('═══════════════════════════════════════════════');
        console.log('TRUNCATION FORMAT VALIDATION');
        console.log('═══════════════════════════════════════════════\n');

        // Create a long line and verify it's truncated correctly
        const longLine = 'A'.repeat(200) + 'B'.repeat(200) + 'C'.repeat(200);
        console.log(`Input: ${longLine.length} chars (600 'A's + 'B's + 'C's)`);

        const result = processSmartDiff('', longLine);
        console.log(`Output: ${result.payload.length} chars`);

        // Should contain " ... "
        expect(result.payload).toContain(' ... ');
        console.log('✓ Contains truncation marker " ... "');

        // Should be approximately 195 + 5 + 195 = 395 chars
        expect(result.payload.length).toBeGreaterThan(390);
        expect(result.payload.length).toBeLessThan(400);
        console.log(`✓ Output length: ${result.payload.length} chars (expected ~395)`);

        // Should start with 'AAA...' and end with '...CCC'
        expect(result.payload.startsWith('AAA')).toBe(true);
        expect(result.payload.endsWith('CCC')).toBe(true);
        console.log('✓ Preserves start (AAA...) and end (...CCC)');

        console.log('\n✅ Truncation format is correct!\n');
    });

    it('should show truncation statistics', () => {
        console.log('═══════════════════════════════════════════════');
        console.log('TRUNCATION STATISTICS');
        console.log('═══════════════════════════════════════════════\n');

        let previousContent = '';
        let totalInputChars = 0;
        let totalOutputChars = 0;
        let linesBeforeTruncation = 0;
        let linesAfterTruncation = 0;

        crawlContents.forEach((currentContent, index) => {
            totalInputChars += currentContent.length;

            const inputLines = currentContent.split('\n');
            const longLines = inputLines.filter(l => l.length > 600);
            linesBeforeTruncation += longLines.length;

            const result = processSmartDiff(previousContent, currentContent);
            totalOutputChars += result.payload.length;

            const outputLines = result.payload.split('\n');
            const stillLongLines = outputLines.filter(l => l.length > 600);
            linesAfterTruncation += stillLongLines.length;

            previousContent = currentContent;
        });

        const charsSaved = totalInputChars - totalOutputChars;
        const percentSaved = ((charsSaved / totalInputChars) * 100).toFixed(2);
        const linesTruncated = linesBeforeTruncation - linesAfterTruncation;

        console.log(`Input:  ${totalInputChars.toLocaleString()} chars`);
        console.log(`Output: ${totalOutputChars.toLocaleString()} chars`);
        console.log(`Saved:  ${charsSaved.toLocaleString()} chars (${percentSaved}%)`);
        console.log(`\nLines > 600 chars BEFORE: ${linesBeforeTruncation}`);
        console.log(`Lines > 600 chars AFTER:  ${linesAfterTruncation}`);
        console.log(`Lines truncated: ${linesTruncated}`);

        const estimatedTokensSaved = Math.ceil(charsSaved / 4);
        console.log(`\nEstimated tokens saved: ~${estimatedTokensSaved.toLocaleString()}`);

        console.log('\n═══════════════════════════════════════════════\n');

        // Lines should be truncated
        expect(linesBeforeTruncation).toBeGreaterThan(0);
        expect(linesAfterTruncation).toBe(0);
    });
});
