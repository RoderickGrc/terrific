import * as Diff from 'diff';
import { DiffLine, SmartDiffResult, SmartDiffOptions, SmartDiffStats } from '../types/smartDiff.types.js';
import { truncateLongLine } from '../utils/textUtils.js';

/**
 * SmartDiff Service
 * Intelligent diff processing for consecutive crawl events
 * Uses ON-CHANGED format for optimal LLM performance
 */

/**
 * Pre-process text before diffing
 * - Normalize consecutive newlines (max 2)
 * - Truncate long lines (>600 chars)
 */
function preprocessText(text: string): string {
    // Normalize newlines (3+ to 2)
    let processed = text.replace(/\n{3,}/g, '\n\n');

    // Truncate long lines
    const lines = processed.split('\n');
    const truncatedLines = lines.map(line => truncateLongLine(line));

    // Remove orphan blank lines from full content
    // Keep blank lines only if they separate content blocks
    const filteredLines = removeOrphanBlankLinesFromText(truncatedLines);

    return filteredLines.join('\n');
}

/**
 * Remove orphan blank lines from an array of text lines
 * Only keeps a single blank line between major content blocks
 * Removes consecutive blank lines and trailing/leading blanks
 */
function removeOrphanBlankLinesFromText(lines: string[]): string[] {
    const result: string[] = [];
    let lastWasBlank = true; // Start as true to skip leading blanks

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isBlank = line.trim() === '';

        if (!isBlank) {
            result.push(line);
            lastWasBlank = false;
        } else if (!lastWasBlank) {
            // Only add blank line if previous wasn't blank
            // and there's content ahead
            const hasContentAhead = lines.slice(i + 1).some(l => l.trim() !== '');
            if (hasContentAhead) {
                result.push(line);
                lastWasBlank = true;
            }
        }
        // Skip consecutive blank lines
    }

    // Remove trailing blank lines
    while (result.length > 0 && result[result.length - 1].trim() === '') {
        result.pop();
    }

    return result;
}

/**
 * Flatten a block of content by removing internal newlines
 * Preserves structure by replacing newlines with spaces
 */
function flattenBlock(text: string): string {
    return text
        .replace(/\n+/g, ' ')       // Replace all newlines with spaces
        .replace(/\s{2,}/g, ' ')    // Collapse multiple spaces
        .trim();                     // Remove leading/trailing whitespace
}

/**
 * Flatten an array of lines into a single line
 * Used for flattening content within ON/CHANGED blocks
 */
function flattenBlockLines(lines: string[]): string {
    return lines
        .map(l => l.trim())         // Trim each line
        .filter(l => l.length > 0)   // Remove empty lines
        .join(' ')                   // Join with single space
        .replace(/\s{2,}/g, ' ');    // Collapse multiple spaces
}

/**
 * Remove all newlines from text, replacing them with spaces
 * This creates single-line content for more efficient LLM token usage
 */
function removeNewlines(text: string): string {
    return text.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Calculate adaptive similarity threshold based on content size
 * Research-backed: larger blocks tolerate lower similarity
 */
function getAdaptiveThreshold(contentLength: number): number {
    if (contentLength < 500) return 0.95;    // Small: require 95% similarity
    if (contentLength < 2000) return 0.85;   // Medium: 85%
    return 0.75;                              // Large: 75%
}

/**
 * Calculate diff lines with type annotations
 */
export function calculateDiffLines(oldText: string, newText: string): DiffLine[] {
    const changes = Diff.diffLines(oldText, newText, { newlineIsToken: false });

    const lines: DiffLine[] = [];
    let originalIndex = 0;
    let newIndex = 0;

    changes.forEach((part) => {
        let partLines = part.value.split('\n');
        if (part.value.length > 0 && partLines[partLines.length - 1] === '') {
            partLines.pop();
        }

        partLines.forEach((lineText) => {
            const type = part.added ? 'added' : part.removed ? 'removed' : 'neutral';

            const lineObj: DiffLine = {
                text: lineText,
                type: type,
                originalIndex: originalIndex,
                newIndex: newIndex
            };

            if (type === 'neutral') {
                originalIndex++;
                newIndex++;
            } else if (type === 'removed') {
                originalIndex++;
            } else if (type === 'added') {
                newIndex++;
            }

            lines.push(lineObj);
        });
    });

    return lines;
}

/**
 * Calculate similarity score (0-100) using Dice coefficient
 */
export function calculateSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 100;
    if (text1.length === 0 && text2.length === 0) return 100;
    if (text1.length === 0 || text2.length === 0) return 0;

    const diffs = Diff.diffChars(text1, text2);
    let commonLength = 0;

    diffs.forEach(part => {
        if (!part.added && !part.removed) {
            commonLength += part.value.length;
        }
    });

    const totalLength = text1.length + text2.length;
    const score = (2 * commonLength) / totalLength;

    return Number((score * 100).toFixed(2));
}

/**
 * Filter diff lines to show changes with context
 * Truncates large change blocks and adds gaps
 */
export function getContextualDiff(
    allLines: DiffLine[],
    contextLines: number = 2
): (DiffLine | { type: 'gap'; internal?: boolean })[] {
    if (allLines.every(l => l.type === 'neutral')) {
        return allLines;
    }

    const result: (DiffLine | { type: 'gap'; internal?: boolean })[] = [];

    // Group into contiguous chunks of changes or neutral
    const chunks: { type: 'change' | 'neutral'; lines: DiffLine[] }[] = [];
    allLines.forEach(line => {
        const isChange = line.type !== 'neutral';
        const lastChunk = chunks[chunks.length - 1];
        const type = isChange ? 'change' : 'neutral';

        if (!lastChunk || lastChunk.type !== type) {
            chunks.push({ type, lines: [line] });
        } else {
            lastChunk.lines.push(line);
        }
    });

    // Process chunks
    chunks.forEach((chunk, chunkIdx) => {
        if (chunk.type === 'change') {
            // Truncate large change blocks: show 2 top, gap, 2 bottom
            if (chunk.lines.length > 4) {
                result.push(...chunk.lines.slice(0, 2));
                result.push({ type: 'gap', internal: true });
                result.push(...chunk.lines.slice(-2));
            } else {
                result.push(...chunk.lines);
            }
        } else {
            // Neutral: intelligent context search
            const hasChangeBefore = chunkIdx > 0;
            const hasChangeAfter = chunkIdx < chunks.length - 1;

            if (!hasChangeBefore && !hasChangeAfter) {
                result.push(...chunk.lines);
                return;
            }

            const indicesToKeep = new Set<number>();

            // Post-change context
            if (hasChangeBefore) {
                let contentFound = 0;
                for (let i = 0; i < chunk.lines.length; i++) {
                    indicesToKeep.add(i);
                    if (chunk.lines[i].text.trim().length > 0) {
                        contentFound++;
                    }
                    if (contentFound >= contextLines) break;
                }
            }

            // Pre-change context
            if (hasChangeAfter) {
                let contentFound = 0;
                for (let i = chunk.lines.length - 1; i >= 0; i--) {
                    indicesToKeep.add(i);
                    if (chunk.lines[i].text.trim().length > 0) {
                        contentFound++;
                    }
                    if (contentFound >= contextLines) break;
                }
            }

            // Build neutral block with gaps
            let lastAddedIdx = -1;
            const sortedIndices = Array.from(indicesToKeep).sort((a, b) => a - b);

            sortedIndices.forEach((idx) => {
                if (lastAddedIdx !== -1 && idx > lastAddedIdx + 1) {
                    result.push({ type: 'gap' });
                }
                result.push(chunk.lines[idx]);
                lastAddedIdx = idx;
            });

            // Gap at end if needed
            if (hasChangeAfter && lastAddedIdx !== -1 && lastAddedIdx < chunk.lines.length - 1) {
                result.push({ type: 'gap' });
            }
        }
    });

    // Clean duplicate gaps
    const finalResult: (DiffLine | { type: 'gap'; internal?: boolean })[] = [];
    result.forEach((item) => {
        if (item.type === 'gap') {
            const last = finalResult[finalResult.length - 1];
            if (!last || last.type !== 'gap') {
                finalResult.push(item);
            }
        } else {
            finalResult.push(item);
        }
    });

    return finalResult;
}

/**
 * Remove orphan blank lines from structured diff
 * A blank neutral line is kept only if it's directly adjacent to a change
 * This reduces noise while preserving meaningful context anchors
 */
function removeOrphanBlankLines(
    structuredDiff: (DiffLine | { type: 'gap'; internal?: boolean })[]
): (DiffLine | { type: 'gap'; internal?: boolean })[] {
    return structuredDiff.filter((item, idx, arr) => {
        // Gaps always preserved
        if ('type' in item && item.type === 'gap') return true;

        const line = item as DiffLine;

        // Non-neutral or non-empty lines always preserved
        if (line.type !== 'neutral' || line.text.trim() !== '') return true;

        // Neutral blank line - check if adjacent to changes
        const prev = idx > 0 ? arr[idx - 1] : null;
        const next = idx < arr.length - 1 ? arr[idx + 1] : null;

        const isChange = (item: any) =>
            item && 'type' in item && (item.type === 'added' || item.type === 'removed');

        return isChange(prev) || isChange(next);
    });
}

/**
 * Generate ON-CHANGED format diff with flattened block content
 * Research shows 3× better LLM performance vs unified diff
 * Flattens internal newlines within blocks to reduce token usage
 */
function generateSearchReplaceDiff(
    structuredDiff: (DiffLine | { type: 'gap'; internal?: boolean })[]
): string {
    let diffText = '';
    let currentHunk: DiffLine[] = [];

    const flushHunk = () => {
        if (currentHunk.length === 0) return;

        const removedLines = currentHunk.filter(l => l.type === 'removed');
        const addedLines = currentHunk.filter(l => l.type === 'added');
        const neutralLines = currentHunk.filter(l => l.type === 'neutral');

        if (removedLines.length === 0 && addedLines.length === 0) {
            currentHunk = [];
            return;
        }

        diffText += '<<<<<<< ON\n';

        // FLATTEN: Collapse ON block content into single line
        // Include context + removed lines, all flattened
        const onLines: string[] = [];
        currentHunk.forEach(line => {
            if (line.type !== 'added') {
                onLines.push(line.text);
            }
        });
        const onContent = flattenBlockLines(onLines);
        diffText += `${onContent}\n`;

        diffText += '=======\n';

        // FLATTEN: Collapse CHANGED block content into single line
        // Include context + added lines, all flattened
        const changedLines: string[] = [];
        currentHunk.forEach(line => {
            if (line.type !== 'removed') {
                changedLines.push(line.text);
            }
        });
        const changedContent = flattenBlockLines(changedLines);
        diffText += `${changedContent}\n`;

        diffText += '>>>>>>> CHANGED\n\n';

        currentHunk = [];
    };

    structuredDiff.forEach(item => {
        if ('type' in item && item.type === 'gap') {
            flushHunk();
        } else {
            currentHunk.push(item as DiffLine);
        }
    });

    flushHunk();

    return diffText.trim();
}

/**
 * Main SmartDiff processor
 * Decides between full content, diff, or no-change token
 */
export function processSmartDiff(
    originalText: string,
    currentText: string,
    options: SmartDiffOptions = {}
): SmartDiffResult {
    const { contextLines = 2, maxLineLength = 4000 } = options;

    // Pre-process both texts
    const processedOriginal = preprocessText(originalText);
    const processedCurrent = preprocessText(currentText);

    // Truncate long lines
    const truncateLines = (text: string) =>
        text.split('\n').map(line => truncateLongLine(line, maxLineLength)).join('\n');

    const finalOriginal = truncateLines(processedOriginal);
    const finalCurrent = truncateLines(processedCurrent);
    // #region agent log
    const _dbg_orig_blanks_raw = originalText.split('\n').filter(l => l.trim() === '').length;
    const _dbg_orig_blanks_proc = finalOriginal.split('\n').filter(l => l.trim() === '').length;
    const _dbg_curr_blanks_raw = currentText.split('\n').filter(l => l.trim() === '').length;
    const _dbg_curr_blanks_proc = finalCurrent.split('\n').filter(l => l.trim() === '').length;
    fetch('http://127.0.0.1:7805/ingest/7f52cca2-b399-477a-973a-eb3a1ff61c89',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62d663'},body:JSON.stringify({sessionId:'62d663',location:'smartDiff.ts:preprocessText',message:'blank lines before vs after preprocessing',data:{origBlanksRaw:_dbg_orig_blanks_raw,origBlanksProcessed:_dbg_orig_blanks_proc,origBlanksRemoved:_dbg_orig_blanks_raw-_dbg_orig_blanks_proc,currBlanksRaw:_dbg_curr_blanks_raw,currBlanksProcessed:_dbg_curr_blanks_proc,currBlanksRemoved:_dbg_curr_blanks_raw-_dbg_curr_blanks_proc,origLenRaw:originalText.length,origLenProc:finalOriginal.length,currLenRaw:currentText.length,currLenProc:finalCurrent.length},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // Optimization: identical content
    if (finalOriginal === finalCurrent) {
        return {
            decision: 'no_change',
            payload: '(NO CHANGES)',
            fullText: finalCurrent,
            diffText: '(NO CHANGES)',
            stats: {
                changeRatio: 0,
                changedLines: 0,
                maxLines: finalCurrent.split('\n').length,
                fullLength: finalCurrent.length,
                diffLength: 12,
                isMajorChange: false,
                savedChars: Math.max(0, finalCurrent.length - 12)
            },
            structuredDiff: []
        };
    }

    // Calculate diff
    const rawDiff = calculateDiffLines(finalOriginal, finalCurrent);

    // Statistics
    let added = 0;
    let removed = 0;
    let neutral = 0;

    rawDiff.forEach(l => {
        if (l.type === 'added') added++;
        else if (l.type === 'removed') removed++;
        else neutral++;
    });

    const totalOriginal = neutral + removed;
    const totalNew = neutral + added;
    const maxLines = Math.max(totalOriginal, totalNew);
    const changedLines = added + removed;

    const changeRatio = maxLines === 0 ? 0 : changedLines / maxLines;
    const threshold = getAdaptiveThreshold(finalCurrent.length);
    const isMajorChange = changeRatio > threshold;

    // Generate contextual diff
    const structuredDiff = getContextualDiff(rawDiff, contextLines);

    // Remove orphan blank lines to reduce noise
    const cleanedDiff = removeOrphanBlankLines(structuredDiff);

    const diffText = generateSearchReplaceDiff(cleanedDiff);

    // Decision logic
    const flattenedFullText = removeNewlines(finalCurrent);
    const fullLength = flattenedFullText.length;
    const diffLength = diffText.length;

    // Primary criterion: is diff shorter than full content?
    // We now compare against the FLATTENED version of full content
    const useDiff = diffLength < fullLength && diffLength > 0;

    const decision = useDiff ? 'diff' : 'full';
    const payload = useDiff ? diffText : flattenedFullText;
    const savedChars = useDiff ? Math.max(0, fullLength - diffLength) : 0;
    // #region agent log
    fetch('http://127.0.0.1:7805/ingest/7f52cca2-b399-477a-973a-eb3a1ff61c89',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'62d663'},body:JSON.stringify({sessionId:'62d663',location:'smartDiff.ts:processSmartDiff',message:'diff decision',data:{decision,changeRatio:Number(changeRatio.toFixed(3)),changedLines,maxLines,fullLength,diffLength,savedChars,savedPct:fullLength>0?Math.round(savedChars/fullLength*100):0,isMajorChange,threshold:getAdaptiveThreshold(finalCurrent.length)},timestamp:Date.now(),hypothesisId:'C-E'})}).catch(()=>{});
    // #endregion

    return {
        decision,
        payload,
        fullText: finalCurrent,
        diffText,
        stats: {
            changeRatio,
            changedLines,
            maxLines,
            fullLength,
            diffLength,
            isMajorChange,
            savedChars
        },
        structuredDiff: cleanedDiff
    };
}
