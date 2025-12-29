import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { processSmartDiff } from '../src/services/smartDiff.js';
import { QAEvent } from '../src/types/index.js';

describe('SmartDiff Deep Diagnostic', () => {
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

    it('should analyze raw sizes', () => {
        console.log('═══════════════════════════════════════════════');
        console.log('STEP 1: RAW DATA ANALYSIS');
        console.log('═══════════════════════════════════════════════\n');

        let total = 0;
        crawlContents.forEach((content, i) => {
            total += content.length;
            console.log(`Crawl ${i}: ${content.length.toLocaleString()} chars`);
        });

        console.log(`\n📊 Total: ${total.toLocaleString()} chars (~${Math.ceil(total / 4).toLocaleString()} tokens)\n`);
        expect(total).toBeGreaterThan(0);
    });

    it('should trace SmartDiff decisions', () => {
        console.log('═══════════════════════════════════════════════');
        console.log('STEP 2: SMARTDIFF PROCESSING');
        console.log('═══════════════════════════════════════════════\n');

        let prev = '';
        let inputTotal = 0;
        let outputTotal = 0;

        crawlContents.forEach((curr, i) => {
            console.log(`\n🔄 Processing crawl ${i}...`);

            const result = processSmartDiff(prev, curr);
            inputTotal += curr.length;
            outputTotal += result.payload.length;

            const saved = curr.length - result.payload.length;
            const percent = curr.length > 0 ? ((saved / curr.length) * 100).toFixed(1) : '0';

            console.log(`   Decision: ${result.decision.toUpperCase()}`);
            console.log(`   Input:  ${curr.length.toLocaleString()} chars`);
            console.log(`   Output: ${result.payload.length.toLocaleString()} chars`);
            console.log(`   Saved:  ${saved.toLocaleString()} chars (${percent}%)`);

            prev = curr;
        });

        const totalSaved = inputTotal - outputTotal;
        const totalPercent = ((totalSaved / inputTotal) * 100).toFixed(2);

        console.log('\n═══════════════════════════════════════════════');
        console.log('SUMMARY:');
        console.log(`Input:  ${inputTotal.toLocaleString()} chars`);
        console.log(`Output: ${outputTotal.toLocaleString()} chars`);
        console.log(`Saved:  ${totalSaved.toLocaleString()} chars (${totalPercent}%)`);
        console.log('═══════════════════════════════════════════════\n');
    });

    it('should analyze why decisions are FULL', () => {
        console.log('═══════════════════════════════════════════════');
        console.log('STEP 3: WHY FULL DECISIONS?');
        console.log('═══════════════════════════════════════════════\n');

        let prev = '';

        crawlContents.forEach((curr, i) => {
            if (i === 0) {
                console.log(`Crawl 0: FULL (first crawl, no previous)`);
                prev = curr;
                return;
            }

            const result = processSmartDiff(prev, curr);

            if (result.decision === 'full') {
                console.log(`\nCrawl ${i}: FULL decision`);
                console.log(`  Change ratio: ${(result.stats.changeRatio * 100).toFixed(1)}%`);
                console.log(`  Diff size: ${result.stats.diffLength.toLocaleString()}`);
                console.log(`  Full size: ${result.stats.fullLength.toLocaleString()}`);

                const threshold = curr.length < 500 ? 95 : curr.length < 2000 ? 85 : 75;
                console.log(`  Threshold: ${threshold}%`);

                if (result.stats.changeRatio * 100 > threshold) {
                    console.log(`  ⚠️ Major change detected`);
                } else if (result.stats.diffLength >= result.stats.fullLength) {
                    console.log(`  ⚠️ Diff not smaller than full`);
                }
            }

            prev = curr;
        });

        console.log('\n');
    });

    it('should check line truncation', () => {
        console.log('═══════════════════════════════════════════════');
        console.log('STEP 4: LINE TRUNCATION CHECK');
        console.log('═══════════════════════════════════════════════\n');

        let maxLen = 0;
        let over600 = 0;

        crawlContents.forEach(content => {
            content.split('\n').forEach(line => {
                if (line.length > maxLen) maxLen = line.length;
                if (line.length > 600) over600++;
            });
        });

        console.log(`Max line length: ${maxLen}`);
        console.log(`Lines > 600 chars: ${over600}`);

        if (over600 === 0) {
            console.log('⚠️  No lines exceed truncation threshold (600 chars)');
        } else {
            console.log(`✓ Found ${over600} lines that will be truncated`);
        }

        // Test with synthetic
        console.log('\nSynthetic test:');
        const long = 'X'.repeat(5000);
        const result = processSmartDiff('', long);
        console.log(`  5000 chars → ${result.payload.length} chars`);
        console.log(`  Truncated: ${result.payload.includes(' ... ')}`);
        expect(result.payload.includes(' ... ')).toBe(true);

        console.log('\n');
    });
});
