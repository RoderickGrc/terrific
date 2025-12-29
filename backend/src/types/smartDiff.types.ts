/**
 * SmartDiff Types
 * Types for intelligent diff processing between consecutive crawl events
 */

export interface DiffLine {
    text: string;
    type: 'added' | 'removed' | 'neutral';
    originalIndex: number;
    newIndex: number;
}

export interface SmartDiffStats {
    changeRatio: number;
    changedLines: number;
    maxLines: number;
    fullLength: number;
    diffLength: number;
    isMajorChange: boolean;
    savedChars: number;
}

export interface SmartDiffResult {
    /** 'full' if major change or diff is larger, 'diff' if minor change, 'no_change' if identical */
    decision: 'full' | 'diff' | 'no_change';
    /** The optimized payload to send to LLM */
    payload: string;
    /** The full text (for reference) */
    fullText: string;
    /** The diff representation (for reference) */
    diffText: string;
    /** Statistics about the diff */
    stats: SmartDiffStats;
    /** Structured diff for UI rendering (optional) */
    structuredDiff: (DiffLine | { type: 'gap'; internal?: boolean })[];
}

export interface SmartDiffOptions {
    /** Number of context lines to show around changes (default: 2) */
    contextLines?: number;
    /** Maximum line length before truncation (default: 4000) */
    maxLineLength?: number;
}
