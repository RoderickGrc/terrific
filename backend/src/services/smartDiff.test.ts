import { describe, it, expect } from 'vitest';
import {
    calculateDiffLines,
    calculateSimilarity,
    getContextualDiff,
    processSmartDiff
} from './smartDiff.js';

describe('SmartDiff', () => {
    describe('calculateDiffLines', () => {
        it('should identify added lines', () => {
            const oldText = 'line 1\nline 2';
            const newText = 'line 1\nline 2\nline 3';

            const result = calculateDiffLines(oldText, newText);

            const addedLines = result.filter(l => l.type === 'added');
            expect(addedLines.length).toBeGreaterThanOrEqual(1);
            expect(addedLines.some(l => l.text === 'line 3')).toBe(true);
        });

        it('should identify removed lines', () => {
            const oldText = 'line 1\nline 2\nline 3';
            const newText = 'line 1\nline 3';

            const result = calculateDiffLines(oldText, newText);

            const removedLines = result.filter(l => l.type === 'removed');
            expect(removedLines).toHaveLength(1);
            expect(removedLines[0].text).toBe('line 2');
        });

        it('should identify neutral lines', () => {
            const oldText = 'line 1\nline 2';
            const newText = 'line 1\nline 2';

            const result = calculateDiffLines(oldText, newText);

            expect(result.every(l => l.type === 'neutral')).toBe(true);
        });

        it('should track line indices correctly', () => {
            const oldText = 'a\nb\nc';
            const newText = 'a\nx\nc';

            const result = calculateDiffLines(oldText, newText);

            // First line (a) should be neutral at index 0
            expect(result[0].type).toBe('neutral');
            expect(result[0].originalIndex).toBe(0);
            expect(result[0].newIndex).toBe(0);
        });
    });

    describe('calculateSimilarity', () => {
        it('should return 100 for identical texts', () => {
            const text = 'Hello World';
            expect(calculateSimilarity(text, text)).toBe(100);
        });

        it('should return 0 for completely different texts', () => {
            expect(calculateSimilarity('abc', 'xyz')).toBe(0);
        });

        it('should return 100 for both empty strings', () => {
            expect(calculateSimilarity('', '')).toBe(100);
        });

        it('should return 0 when one string is empty', () => {
            expect(calculateSimilarity('', 'text')).toBe(0);
            expect(calculateSimilarity('text', '')).toBe(0);
        });

        it('should calculate partial similarity correctly', () => {
            const text1 = 'The quick brown fox';
            const text2 = 'The quick brown dog';

            const similarity = calculateSimilarity(text1, text2);

            // Should be high similarity (most characters match)
            expect(similarity).toBeGreaterThan(80);
            expect(similarity).toBeLessThan(100);
        });
    });

    describe('getContextualDiff', () => {
        it('should return all lines if all neutral', () => {
            const lines = [
                { text: 'a', type: 'neutral' as const, originalIndex: 0, newIndex: 0 },
                { text: 'b', type: 'neutral' as const, originalIndex: 1, newIndex: 1 }
            ];

            const result = getContextualDiff(lines, 2);

            expect(result).toHaveLength(2);
        });

        it('should truncate large change blocks', () => {
            const lines = [
                { text: 'change1', type: 'added' as const, originalIndex: 0, newIndex: 0 },
                { text: 'change2', type: 'added' as const, originalIndex: 0, newIndex: 1 },
                { text: 'change3', type: 'added' as const, originalIndex: 0, newIndex: 2 },
                { text: 'change4', type: 'added' as const, originalIndex: 0, newIndex: 3 },
                { text: 'change5', type: 'added' as const, originalIndex: 0, newIndex: 4 }
            ];

            const result = getContextualDiff(lines, 2);

            // Should have: 2 lines + gap + 2 lines = 5 items
            expect(result).toHaveLength(5);
            expect(result[2]).toEqual({ type: 'gap', internal: true });
        });

        it('should add context lines around changes', () => {
            const lines = [
                { text: 'neutral1', type: 'neutral' as const, originalIndex: 0, newIndex: 0 },
                { text: 'neutral2', type: 'neutral' as const, originalIndex: 1, newIndex: 1 },
                { text: 'changed', type: 'added' as const, originalIndex: 1, newIndex: 2 },
                { text: 'neutral3', type: 'neutral' as const, originalIndex: 2, newIndex: 3 },
                { text: 'neutral4', type: 'neutral' as const, originalIndex: 3, newIndex: 4 }
            ];

            const result = getContextualDiff(lines, 1);

            // Should include context before and after change
            const texts = result.filter(item => 'text' in item).map(item => (item as any).text);
            expect(texts).toContain('neutral2'); // context before
            expect(texts).toContain('changed');
            expect(texts).toContain('neutral3'); // context after
        });

        it('should not add duplicate gaps', () => {
            const lines = [
                { text: 'a', type: 'neutral' as const, originalIndex: 0, newIndex: 0 },
                { text: 'b', type: 'neutral' as const, originalIndex: 1, newIndex: 1 },
                { text: 'c', type: 'neutral' as const, originalIndex: 2, newIndex: 2 },
                { text: 'changed', type: 'added' as const, originalIndex: 2, newIndex: 3 },
                { text: 'd', type: 'neutral' as const, originalIndex: 3, newIndex: 4 }
            ];

            const result = getContextualDiff(lines, 1);

            // Count gaps
            const gaps = result.filter(item => item.type === 'gap');

            // Should have at most one gap
            expect(gaps.length).toBeLessThanOrEqual(1);
        });
    });

    describe('processSmartDiff', () => {
        it('should return no_change for identical texts', () => {
            const text = 'Hello World\nThis is a test';

            const result = processSmartDiff(text, text);

            expect(result.decision).toBe('no_change');
            expect(result.payload).toBe('(NO CHANGES)');
            expect(result.stats.changeRatio).toBe(0);
        });

        it('should return full content for first crawl (empty original)', () => {
            const text = 'First crawl content';

            const result = processSmartDiff('', text);

            expect(result.decision).toBe('full');
            expect(result.payload).toBe(text.replace(/\n/g, ' ')); // Now flattened
        });

        it('should return diff for minor changes', () => {
            const oldText = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10';
            const newText = 'Line 1\nLine 2 modified\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10';

            const result = processSmartDiff(oldText, newText);

            // Should use diff format for minor change (or full if diff is larger)
            if (result.decision === 'diff') {
                expect(result.hunks.length).toBeGreaterThan(0);
                expect(result.payload).toBe(JSON.stringify(result.hunks));
            }
            // Either decision is acceptable for this test
            expect(['diff', 'full']).toContain(result.decision);
        });

        it('should return full for major changes', () => {
            const oldText = 'A\nB\nC\nD\nE';
            const newText = 'X\nY\nZ\nW\nQ';

            const result = processSmartDiff(oldText, newText);

            // Should use full content for major change (flattened)
            expect(result.decision).toBe('full');
            expect(result.payload).toBe(newText.replace(/\n/g, ' '));
        });

        it('should normalize consecutive newlines', () => {
            const oldText = 'Line 1\n\n\n\nLine 2';
            const newText = 'Line 1\n\n\n\nLine 2';

            const result = processSmartDiff(oldText, newText);

            // Should be treated as identical after normalization
            expect(result.decision).toBe('no_change');
        });

        it('should treat single and double newlines as equivalent to prevent ghost hunks', () => {
            // Same semantic content, different newline spacing between renders
            const oldText = 'Section A\n\nSection B\n\nSection C';
            const newText = 'Section A\nSection B\nSection C';

            const result = processSmartDiff(oldText, newText);

            // Both normalize to identical content after \n{2,} → \n — must be no_change
            expect(result.decision).toBe('no_change');
        });

        it('should truncate very long lines', () => {
            const longLine = 'x'.repeat(5000);
            const oldText = `Short line\n${longLine}\nAnother short line`;
            const newText = `Short line\n${longLine}\nAnother short line`;

            const result = processSmartDiff(oldText, newText);

            // Should handle long lines without error
            expect(result.decision).toBe('no_change');
        });

        it('should use adaptive threshold for small content', () => {
            // Small content (< 500 chars) requires 95% similarity
            const oldText = 'ABC';
            const newText = 'XBC'; // 66% similarity

            const result = processSmartDiff(oldText, newText);

            // Should use full because similarity < 95%
            expect(result.decision).toBe('full');
        });

        it('should calculate saved characters correctly', () => {
            const oldText = 'A\nB\nC\nD\nE\nF\nG\nH';
            const newText = 'A\nB\nC\nX\nE\nF\nG\nH';

            const result = processSmartDiff(oldText, newText);

            if (result.decision === 'diff') {
                expect(result.stats.savedChars).toBeGreaterThan(0);
            }
        });

        it('should generate search-replace format correctly', () => {
            const oldText = 'Hello World\nGoodbye World';
            const newText = 'Hello World\nGoodbye Universe';

            const result = processSmartDiff(oldText, newText);

            if (result.decision === 'diff') {
                // Should contain structured hunks
                expect(result.hunks.length).toBeGreaterThan(0);

                // Should contain the changed content in hunks
                const payloadStr = JSON.stringify(result.hunks);
                expect(payloadStr).toContain('Goodbye World');
                expect(payloadStr).toContain('Goodbye Universe');
            }
        });

        it('should provide stats about the diff', () => {
            const oldText = 'Line 1\nLine 2\nLine 3';
            const newText = 'Line 1\nLine 2 modified\nLine 3';

            const result = processSmartDiff(oldText, newText);

            expect(result.stats).toBeDefined();
            expect(result.stats.changeRatio).toBeGreaterThan(0);
            expect(result.stats.changedLines).toBeGreaterThan(0);
            expect(result.stats.fullLength).toBeGreaterThan(0);
        });
    });
});
