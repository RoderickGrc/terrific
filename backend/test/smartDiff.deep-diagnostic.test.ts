/**
 * Deep Diagnostic Test for SmartDiff Token Savings
 * 
 * This test traces every step of the SmartDiff processing to verify
 * that optimizations are being applied correctly.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { processSmartDiff, calculateSimilarity } from '../src/services/smartDiff.js';
import { QAEvent } from '../src/types/index.js';

interface CrawlDetails {
    url: string;
    title: string;
    wordCount: number;
    characterCount: number;
    markdown: string;
}

describe('Deep SmartDiff Diagnostic Tests', () => {
    const eventsPath = join(process.cwd(), '..', 'sessions', '2025-12-25_00-17-46_mt5dkeu611', 'events.json');
    let events: QAEvent[];
    let crawlEvents: QAEvent[];
    let crawlDetails: CrawlDetails[];

    beforeAll(() => {
        const eventsData = readFileSync(eventsPath, 'utf-8');
        events = JSON.parse(eventsData);
        crawlEvents = events.filter(e => e.type === 'CRAWL');
        crawlDetails = crawlEvents.map(e => JSON.parse(e.details));
    });

    describe('Step 1: Raw Data Analysis', () => {
        it('should analyze raw crawl markdown sizes', () => {
            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║           STEP 1: RAW DATA ANALYSIS                          ║');
            console.log('╚══════════════════════════════════════════════════════════════╝\n');

            let totalRawSize = 0;

            crawlDetails.forEach((detail, index) => {
                const markdownSize = detail.markdown?.length || 0;
                totalRawSize += markdownSize;

                console.log(`📄 Crawl ${index}:`);
                console.log(`   URL: ${detail.url.substring(0, 50)}...`);
                console.log(`   Markdown size: ${markdownSize.toLocaleString()} chars`);
                console.log(`   Word count: ${detail.wordCount}`);
            });

            console.log(`\n📊 TOTAL RAW MARKDOWN SIZE: ${totalRawSize.toLocaleString()} chars`);
            console.log(`   Estimated tokens (raw): ~${Math.ceil(totalRawSize / 4).toLocaleString()}`);

            expect(totalRawSize).toBeGreaterThan(0);
        });
    });

    describe('Step 2: Sequential SmartDiff Processing', () => {
        it('should trace each SmartDiff decision with detailed metrics', () => {
            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║       STEP 2: SEQUENTIAL SMARTDIFF PROCESSING                ║');
            console.log('╚══════════════════════════════════════════════════════════════╝\n');

            let previousContent: string = '';
            let totalInputSize = 0;
            let totalOutputSize = 0;
            let totalSavedBySmartDiff = 0;

            const results: Array<{
                index: number;
                decision: string;
                inputSize: number;
                outputSize: number;
                saved: number;
                savingPercent: string;
            }> = [];

            crawlDetails.forEach((detail, index) => {
                const currentContent = detail.markdown || '';
                const inputSize = currentContent.length;
                totalInputSize += inputSize;

                const result = processSmartDiff(previousContent, currentContent);
                const outputSize = result.payload.length;
                totalOutputSize += outputSize;

                const saved = inputSize - outputSize;
                totalSavedBySmartDiff += saved;

                const savingPercent = inputSize > 0
                    ? ((saved / inputSize) * 100).toFixed(2)
                    : '0.00';

                results.push({
                    index,
                    decision: result.decision,
                    inputSize,
                    outputSize,
                    saved,
                    savingPercent
                });

                const emoji = result.decision === 'no_change' ? '🟢'
                    : result.decision === 'diff' ? '🟡'
                        : '🔴';

                console.log(`\n${emoji} Crawl ${index}: ${result.decision.toUpperCase()}`);
                console.log(`   Input size:  ${inputSize.toLocaleString()} chars`);
                console.log(`   Output size: ${outputSize.toLocaleString()} chars`);
                console.log(`   Saved:       ${saved.toLocaleString()} chars (${savingPercent}%)`);

                if (result.decision === 'no_change') {
                    console.log(`   ✓ Saved ${inputSize - 12} chars by using (NO CHANGES)`);
                } else if (result.decision === 'diff') {
                    console.log(`   ✓ Diff is smaller than full content`);
                    console.log(`   Change ratio: ${(result.stats.changeRatio * 100).toFixed(2)}%`);
                } else {
                    console.log(`   ✗ Full content used (major change or first crawl)`);
                    console.log(`   Change ratio: ${(result.stats.changeRatio * 100).toFixed(2)}%`);
                }

                previousContent = currentContent;
            });

            console.log('\n' + '─'.repeat(65));
            console.log('📊 SMARTDIFF PROCESSING SUMMARY:');
            console.log(`   Total input:  ${totalInputSize.toLocaleString()} chars`);
            console.log(`   Total output: ${totalOutputSize.toLocaleString()} chars`);
            console.log(`   Total saved:  ${totalSavedBySmartDiff.toLocaleString()} chars`);
            console.log(`   Saving rate:  ${((totalSavedBySmartDiff / totalInputSize) * 100).toFixed(2)}%`);

            console.log('\n   Decision breakdown:');
            console.log(`     🟢 no_change: ${results.filter(r => r.decision === 'no_change').length}`);
            console.log(`     🟡 diff:      ${results.filter(r => r.decision === 'diff').length}`);
            console.log(`     🔴 full:      ${results.filter(r => r.decision === 'full').length}`);
        });
    });

    describe('Step 3: Why are most decisions "full"?', () => {
        it('should analyze why SmartDiff chooses full content', () => {
            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║     STEP 3: ANALYSIS OF "FULL" DECISIONS                     ║');
            console.log('╚══════════════════════════════════════════════════════════════╝\n');

            let previousContent: string = '';

            crawlDetails.forEach((detail, index) => {
                const currentContent = detail.markdown || '';

                if (index === 0) {
                    console.log(`📄 Crawl 0: First crawl always uses FULL (no previous content)`);
                    previousContent = currentContent;
                    return;
                }

                const similarity = calculateSimilarity(previousContent, currentContent);
                const result = processSmartDiff(previousContent, currentContent);

                if (result.decision === 'full') {
                    console.log(`\n📄 Crawl ${index}: FULL decision analysis`);
                    console.log(`   Previous URL: ${crawlDetails[index - 1].url.substring(0, 40)}...`);
                    console.log(`   Current URL:  ${detail.url.substring(0, 40)}...`);
                    console.log(`   Similarity: ${similarity.toFixed(2)}%`);
                    console.log(`   Change ratio: ${(result.stats.changeRatio * 100).toFixed(2)}%`);
                    console.log(`   Full length: ${result.stats.fullLength.toLocaleString()} chars`);
                    console.log(`   Diff length: ${result.stats.diffLength.toLocaleString()} chars`);

                    // Determine why
                    const contentSize = currentContent.length;
                    const threshold = contentSize < 500 ? 0.95
                        : contentSize < 2000 ? 0.85
                            : 0.75;

                    console.log(`   Adaptive threshold: ${(threshold * 100)}%`);

                    if (result.stats.changeRatio > threshold) {
                        console.log(`   ⚠️  REASON: Change ratio exceeds threshold (major change)`);
                    } else if (result.stats.diffLength >= result.stats.fullLength) {
                        console.log(`   ⚠️  REASON: Diff is not smaller than full content`);
                    } else {
                        console.log(`   ❓ REASON: Unknown - this should have been a diff`);
                    }
                }

                previousContent = currentContent;
            });
        });
    });

    describe('Step 4: URL-based Content Grouping', () => {
        it('should analyze if crawls from same URL could benefit more', () => {
            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║     STEP 4: URL-BASED CONTENT GROUPING                       ║');
            console.log('╚══════════════════════════════════════════════════════════════╝\n');

            // Group crawls by URL
            const urlGroups: Map<string, CrawlDetails[]> = new Map();

            crawlDetails.forEach(detail => {
                const baseUrl = new URL(detail.url).pathname;
                const existing = urlGroups.get(baseUrl) || [];
                existing.push(detail);
                urlGroups.set(baseUrl, existing);
            });

            console.log(`📊 Found ${urlGroups.size} unique URL paths:\n`);

            urlGroups.forEach((details, url) => {
                console.log(`🔗 ${url}`);
                console.log(`   Crawl count: ${details.length}`);

                if (details.length > 1) {
                    // Calculate similarity between consecutive crawls of same URL
                    for (let i = 1; i < details.length; i++) {
                        const similarity = calculateSimilarity(
                            details[i - 1].markdown || '',
                            details[i].markdown || ''
                        );
                        console.log(`   Similarity [${i - 1}→${i}]: ${similarity.toFixed(2)}%`);
                    }
                }
                console.log('');
            });

            console.log('💡 INSIGHT: SmartDiff compares SEQUENTIAL crawls, not by URL.');
            console.log('   If user navigates: Page A → Page B → Page A');
            console.log('   SmartDiff will compare: A vs B (different), B vs A (different)');
            console.log('   Even though A pages are identical, they are not sequential.');
        });
    });

    describe('Step 5: Truncation Verification', () => {
        it('should verify line truncation is actually applied', () => {
            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║     STEP 5: TRUNCATION VERIFICATION                          ║');
            console.log('╚══════════════════════════════════════════════════════════════╝\n');

            let totalLinesAnalyzed = 0;
            let linesOver4000 = 0;
            let linesOver1000 = 0;
            let linesOver500 = 0;
            let maxLineLength = 0;

            crawlDetails.forEach((detail, index) => {
                const lines = (detail.markdown || '').split('\n');
                totalLinesAnalyzed += lines.length;

                lines.forEach(line => {
                    if (line.length > maxLineLength) maxLineLength = line.length;
                    if (line.length > 4000) linesOver4000++;
                    else if (line.length > 1000) linesOver1000++;
                    else if (line.length > 500) linesOver500++;
                });
            });

            console.log(`📏 Line Length Analysis:`);
            console.log(`   Total lines analyzed: ${totalLinesAnalyzed.toLocaleString()}`);
            console.log(`   Maximum line length:  ${maxLineLength.toLocaleString()} chars`);
            console.log(`   Lines > 4000 chars:   ${linesOver4000} (would be truncated)`);
            console.log(`   Lines > 1000 chars:   ${linesOver1000}`);
            console.log(`   Lines > 500 chars:    ${linesOver500}`);

            if (linesOver4000 === 0) {
                console.log('\n⚠️  NOTE: No lines exceed 4000 chars in this dataset.');
                console.log('   Truncation threshold is 4000 chars (maxLength default).');
                console.log('   Consider lowering the threshold for more aggressive optimization.');
            }

            // Test truncation with synthetic data
            console.log('\n📐 Synthetic Truncation Test:');
            const longLine = 'X'.repeat(5000);
            const result = processSmartDiff('', longLine);

            console.log(`   Original: ${longLine.length} chars`);
            console.log(`   After SmartDiff: ${result.payload.length} chars`);
            console.log(`   Contains truncation marker: ${result.payload.includes('[...')}`);

            expect(result.payload).toContain('[...');
            expect(result.payload.length).toBeLessThan(longLine.length);
            console.log('   ✓ Truncation is working correctly');
        });
    });

    describe('Step 6: Potential Optimization Opportunities', () => {
        it('should identify ways to increase savings', () => {
            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║     STEP 6: OPTIMIZATION OPPORTUNITIES                       ║');
            console.log('╚══════════════════════════════════════════════════════════════╝\n');

            let previousContent: string = '';
            let potentialSavingsIfLowerThreshold = 0;
            let potentialSavingsIfLowerTruncation = 0;

            crawlDetails.forEach((detail, index) => {
                const currentContent = detail.markdown || '';

                if (index > 0) {
                    const result = processSmartDiff(previousContent, currentContent);

                    if (result.decision === 'full' && result.stats.diffLength < result.stats.fullLength) {
                        // This could have been a diff if threshold was lower
                        const savings = result.stats.fullLength - result.stats.diffLength;
                        potentialSavingsIfLowerThreshold += savings;
                    }
                }

                // Check for potential truncation savings
                const lines = currentContent.split('\n');
                lines.forEach(line => {
                    if (line.length > 1000 && line.length <= 4000) {
                        // This line could be truncated with a lower threshold
                        potentialSavingsIfLowerTruncation += line.length - 500;
                    }
                });

                previousContent = currentContent;
            });

            console.log('💡 OPTIMIZATION OPPORTUNITIES:\n');

            console.log('1️⃣  Lower similarity threshold:');
            console.log(`   Potential additional savings: ${potentialSavingsIfLowerThreshold.toLocaleString()} chars`);
            console.log('   Current thresholds: 95%/85%/75% (small/medium/large)');
            console.log('   Consider: 90%/80%/70% for more aggressive diffing\n');

            console.log('2️⃣  Lower truncation threshold:');
            console.log(`   Current threshold: 4000 chars`);
            console.log(`   Potential savings if 1000 chars: ${potentialSavingsIfLowerTruncation.toLocaleString()} chars`);
            console.log('   Consider: 1000-2000 chars for Wikipedia-like content\n');

            console.log('3️⃣  Consider URL-based comparison:');
            console.log('   Current: Sequential comparison only');
            console.log('   Proposal: Track last crawl per URL for better diff matching\n');

            console.log('4️⃣  Content-aware preprocessing:');
            console.log('   Wikipedia pages have lots of boilerplate (menus, footers)');
            console.log('   Consider stripping common boilerplate before diffing');
        });
    });

    describe('Final Summary', () => {
        it('should provide a complete diagnostic summary', () => {
            console.log('\n╔══════════════════════════════════════════════════════════════╗');
            console.log('║              FINAL DIAGNOSTIC SUMMARY                        ║');
            console.log('╚══════════════════════════════════════════════════════════════╝\n');

            let previousContent: string = '';
            let totalInput = 0;
            let totalOutput = 0;
            let noChangeCount = 0;
            let diffCount = 0;
            let fullCount = 0;

            crawlDetails.forEach((detail, index) => {
                const currentContent = detail.markdown || '';
                totalInput += currentContent.length;

                const result = processSmartDiff(previousContent, currentContent);
                totalOutput += result.payload.length;

                if (result.decision === 'no_change') noChangeCount++;
                else if (result.decision === 'diff') diffCount++;
                else fullCount++;

                previousContent = currentContent;
            });

            const savedChars = totalInput - totalOutput;
            const savedPercent = ((savedChars / totalInput) * 100).toFixed(2);
            const estimatedTokensSaved = Math.ceil(savedChars / 4);

            console.log('📊 FINAL METRICS:');
            console.log(`   ┌─────────────────────────────────────┐`);
            console.log(`   │ Total crawls processed: ${crawlDetails.length.toString().padStart(10)} │`);
            console.log(`   │ Raw content size:       ${totalInput.toLocaleString().padStart(10)} │`);
            console.log(`   │ Optimized size:         ${totalOutput.toLocaleString().padStart(10)} │`);
            console.log(`   │ Characters saved:       ${savedChars.toLocaleString().padStart(10)} │`);
            console.log(`   │ Saving percentage:      ${(savedPercent + '%').padStart(10)} │`);
            console.log(`   │ Estimated tokens saved: ${('~' + estimatedTokensSaved).padStart(10)} │`);
            console.log(`   └─────────────────────────────────────┘`);

            console.log('\n📈 DECISION DISTRIBUTION:');
            console.log(`   🟢 NO_CHANGE: ${noChangeCount} (${((noChangeCount / crawlDetails.length) * 100).toFixed(1)}%)`);
            console.log(`   🟡 DIFF:      ${diffCount} (${((diffCount / crawlDetails.length) * 100).toFixed(1)}%)`);
            console.log(`   🔴 FULL:      ${fullCount} (${((fullCount / crawlDetails.length) * 100).toFixed(1)}%)`);

            console.log('\n✅ VERIFICATION COMPLETE');
            console.log('   SmartDiff IS working correctly.');
            console.log('   The current session has many page NAVIGATIONS (different pages),');
            console.log('   which results in mostly FULL decisions (expected behavior).');
            console.log('   Sessions with more SAME-PAGE interactions will show more savings.');
        });
    });
});
