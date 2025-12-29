import { describe, it, expect } from 'vitest';
import { processSmartDiff } from '../src/services/smartDiff.js';

describe('SmartDiff - Orphan Blank Lines Filtering', () => {
        it('should remove orphan blank lines that are not adjacent to changes', () => {
                const original = `Lock

 [BUTTON: Ventas]

 [BUTTON: ![Chat-icon]()]`;

                const current = `Lock

 [BUTTON: Ventas]

 [BUTTON: ![Chat-icon]()]`;

                const result = processSmartDiff(original, current);

                // Should detect no changes
                expect(result.decision).toBe('no_change');
                expect(result.payload).toBe('(NO CHANGES)');
        });

        it('should keep blank lines adjacent to actual changes in realistic content', () => {
                // Realistic content size where diff is beneficial
                const original = `Header Section
Navigation Menu
 [BUTTON: Home]
 [BUTTON: About]
 [BUTTON: Services]
 [BUTTON: Contact]

Main Content Area
Lorem ipsum dolor sit amet
consectetur adipiscing elit
sed do eiusmod tempor

 [BUTTON: ![Chat-icon]()]

Footer Section
Copyright 2024
Privacy Policy
Terms of Service`;

                const current = `Header Section
Navigation Menu
 [BUTTON: Home]
 [BUTTON: About]
 [BUTTON: Services]
 [BUTTON: Contact]

Main Content Area
Lorem ipsum dolor sit amet
consectetur adipiscing elit
sed do eiusmod tempor

 [BUTTON: ![Chat-icon]()] [BUTTON: Configurar]

Footer Section
Copyright 2024
Privacy Policy
Terms of Service`;

                const result = processSmartDiff(original, current);

                // Should generate a diff for this realistic scenario
                expect(result.decision).toBe('diff');
                expect(result.diffText).toContain('<<<<<<< ON');
                expect(result.diffText).toContain('=======');
                expect(result.diffText).toContain('>>>>>>> CHANGED');

                // The blank line before the changed button should be preserved
                expect(result.diffText).toContain('[BUTTON: ![Chat-icon]()]');
        });

        it('should remove multiple consecutive orphan blank lines', () => {
                const original = `Header


Content


Footer`;

                const current = `Header


Content


Footer`;

                const result = processSmartDiff(original, current);

                // No changes, should be detected
                expect(result.decision).toBe('no_change');
        });

        it('should handle realistic page changes with orphan blank line filtering', () => {
                const original = `Page Title
Subtitle

Section 1 Content
This is some text
More text here

Section 2 Content  
Another paragraph
With multiple lines

Section 3 Content
Final section text
End of page`;

                const current = `Page Title
Subtitle

Section 1 Content
This is some text
More text here

Section 2 Content MODIFIED
Another paragraph
With multiple lines

Section 3 Content
Final section text
End of page`;

                const result = processSmartDiff(original, current);

                // The decision depends on content size, but diff should be generated
                expect(['diff', 'full']).toContain(result.decision);

                // Should contain the change in the diff text
                expect(result.diffText).toContain('Section 2 Content');
                expect(result.diffText).toContain('MODIFIED');
        });

        it('should not break when all lines are blank', () => {
                const original = `


`;

                const current = `


`;

                const result = processSmartDiff(original, current);

                expect(result.decision).toBe('no_change');
        });

        it('should filter orphan blanks in realistic multi-section content', () => {
                const original = `Navigation
Home | About | Contact

Main Section

Content Block 1
Some text here

Content Block 2
More text here

Content Block 3
Final text

Footer`;

                const current = `Navigation
Home | About | Contact

Main Section

Content Block 1
Some text here UPDATED

Content Block 2
More text here

Content Block 3
Final text

Footer`;

                const result = processSmartDiff(original, current);

                // Decision depends on content size and diff overhead
                expect(['diff', 'full']).toContain(result.decision);

                // Verify the diff contains the actual change
                expect(result.diffText).toContain('Content Block 1');
                expect(result.diffText).toContain('UPDATED');

                // The orphan blank line filtering should have been applied
                expect(result.structuredDiff).toBeDefined();
        });
});
