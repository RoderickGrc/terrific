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

/**
 * A single change unit in a structured snapshot delta.
 * Exactly one of three shapes is used per hunk:
 *   - Replacement: { on, replace_with }
 *   - Insertion:   { near, insert }
 *   - Deletion:    { erase }
 */
export interface SnapshotHunk {
    /** Text to locate and replace (replacement). Includes neutral context + removed lines, flattened. */
    on?: string;
    /** New text (replacement). Includes neutral context + added lines, flattened. */
    replace_with?: string;
    /** Anchor context for insertion — nearest neutral line before the new content. */
    near?: string;
    /** New content being inserted near the anchor. Contains only added lines, flattened. */
    insert?: string;
    /** Content being removed. Self-identifying — no anchor needed. Contains only removed lines, flattened. */
    erase?: string;
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
    /** Structured delta hunks for LLM output (Format C). Empty array for no_change. */
    hunks: SnapshotHunk[];
}

export interface SmartDiffOptions {
    /** Number of context lines to show around changes (default: 2) */
    contextLines?: number;
    /** Maximum line length before truncation (default: 4000) */
    maxLineLength?: number;
    /** Character used to replace newlines in LLM output. Default: ' ' (space, backward-compatible). */
    lineSeparator?: string;
}
