/**
 * Text processing utilities for crawling and diff operations
 */

/**
 * Truncate long lines intelligently
 * Preserves: [195 chars start] ... [195 chars end]
 * Threshold: 400 chars (195 + 5 + 195 + margin = ~400)
 */
export function truncateLongLine(line: string, maxLength = 400): string {
    if (line.length <= maxLength) return line;

    const segmentLength = 195;

    const start = line.slice(0, segmentLength);
    const end = line.slice(-segmentLength);

    return `${start} ... ${end}`;
}

/**
 * Clean and normalize text content
 * - Remove excessive whitespace
 * - Normalize line breaks
 */
export function cleanTextContent(text: string): string {
    return text
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();
}

/**
 * Check if a string is effectively empty (only whitespace/punctuation)
 */
export function isEffectivelyEmpty(text: string): boolean {
    const cleaned = text.trim();
    return cleaned.length === 0 || /^[\s\p{P}]+$/u.test(cleaned);
}
