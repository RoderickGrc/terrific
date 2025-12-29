import { describe, it, expect } from 'vitest';
import { truncateLongLine, cleanTextContent, isEffectivelyEmpty } from './textUtils.js';

describe('textUtils', () => {
    describe('truncateLongLine', () => {
        it('should not truncate lines shorter than maxLength', () => {
            const shortLine = 'This is a short line';
            expect(truncateLongLine(shortLine, 400)).toBe(shortLine);
        });

        it('should truncate very long lines preserving start and end', () => {
            const longLine = 'A'.repeat(500);
            const result = truncateLongLine(longLine, 400);

            expect(result).toContain(' ... ');
            expect(result.length).toBeLessThan(longLine.length);
            expect(result.startsWith('A'.repeat(195))).toBe(true);
            expect(result.endsWith('A'.repeat(195))).toBe(true);
        });

        it('should handle custom maxLength parameter', () => {
            // The function uses fixed 195-char segments, regardless of maxLength
            // This test verifies the maxLength parameter triggers truncation
            const line = 'X'.repeat(500);
            const result = truncateLongLine(line, 100);

            expect(result).toContain(' ... ');
            expect(result.length).toBeLessThan(500);
        });
    });

    describe('cleanTextContent', () => {
        it('should normalize multiple spaces to single space', () => {
            expect(cleanTextContent('Hello    world')).toBe('Hello world');
        });

        it('should remove newlines and trim', () => {
            expect(cleanTextContent('  Hello\n  world  ')).toBe('Hello world');
        });

        it('should handle tabs and mixed whitespace', () => {
            expect(cleanTextContent('Text\t\twith\n\nmixed   spaces')).toBe('Text with mixed spaces');
        });
    });

    describe('isEffectivelyEmpty', () => {
        it('should return true for empty string', () => {
            expect(isEffectivelyEmpty('')).toBe(true);
        });

        it('should return true for whitespace only', () => {
            expect(isEffectivelyEmpty('   ')).toBe(true);
            expect(isEffectivelyEmpty('\n\t')).toBe(true);
        });

        it('should return true for punctuation only', () => {
            expect(isEffectivelyEmpty('...')).toBe(true);
            expect(isEffectivelyEmpty('!@#')).toBe(true);
        });

        it('should return false for actual text', () => {
            expect(isEffectivelyEmpty('Hello')).toBe(false);
            expect(isEffectivelyEmpty('Save')).toBe(false);
        });
    });
});
