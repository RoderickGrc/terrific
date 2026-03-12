import { describe, it, expect } from 'vitest';
import { processSmartDiff } from '../src/services/smartDiff.js';

describe('SmartDiff - Full Content Blank Line Filtering', () => {
    it('should remove orphan blank lines from full content (snapshot)', () => {
        // Simula el contenido real del CRAWL a las 00:12.9
        const fullContent = `Te quedan 13 días de tu plan gratuito. [BUTTON: ¡Mejora tu plan ahora!]

 [BUTTON: ![User logo]()]

User

![Minimizar sidebar]()

![Logo]()

-   User

     [BUTTON: ![Menú]()]

-   ![Dashboard]()Dashboard
-   ![Espacios de trabajo]()Espacios de trabajo
-   ![Conversaciones]()Conversaciones
-   ![Departamentos]()Departamentos
-   ![Clientes]()Clientes`;

        const result = processSmartDiff('', fullContent);

        // Debe ser decisión 'diff' o 'full' dependiendo del tamaño
        expect(['diff', 'full']).toContain(result.decision);

        // El fullText procesado NO debe tener múltiples líneas en blanco consecutivas
        const processedLines = result.fullText.split('\n');

        // Verificar que no hay más de una línea en blanco consecutiva
        let consecutiveBlanks = 0;
        let maxConsecutiveBlanks = 0;

        processedLines.forEach(line => {
            if (line.trim() === '') {
                consecutiveBlanks++;
                maxConsecutiveBlanks = Math.max(maxConsecutiveBlanks, consecutiveBlanks);
            } else {
                consecutiveBlanks = 0;
            }
        });

        // Solo debe haber máximo 1 línea en blanco consecutiva
        expect(maxConsecutiveBlanks).toBeLessThanOrEqual(1);

        // No debe haber líneas en blanco al inicio
        expect(processedLines[0].trim()).not.toBe('');

        // No debe haber líneas en blanco al final
        expect(processedLines[processedLines.length - 1].trim()).not.toBe('');

        console.log('\n📊 Full Content Filtering Test:');
        console.log(`Original lines: ${fullContent.split('\n').length}`);
        console.log(`Processed lines: ${processedLines.length}`);
        console.log(`Max consecutive blanks: ${maxConsecutiveBlanks}`);
        console.log(`Lines saved: ${fullContent.split('\n').length - processedLines.length}`);
    });

    it('should remove all orphan blank lines in realistic snapshot', () => {
        const snapshot = `Header
        
Content 1


Content 2



Content 3

Footer`;

        const result = processSmartDiff('', snapshot);

        // Contar líneas en blanco consecutivas
        const lines = result.fullText.split('\n');
        let hasMultipleBlanks = false;
        let prevWasBlank = false;

        lines.forEach(line => {
            const isBlank = line.trim() === '';
            if (isBlank && prevWasBlank) {
                hasMultipleBlanks = true;
            }
            prevWasBlank = isBlank;
        });

        expect(hasMultipleBlanks).toBe(false);

        console.log('\n📊 Realistic Snapshot Test:');
        console.log(`Input:\n${snapshot}`);
        console.log(`\nOutput:\n${result.fullText}`);
    });

    it('should keep single blank lines between content blocks', () => {
        const content = `Block 1
Block 2
Block 3`;

        const result = processSmartDiff('', content);

        // Debe mantener el contenido sin líneas en blanco si no las había
        expect(result.fullText).toBe('Block 1\nBlock 2\nBlock 3');
    });

    it('should handle content with mixed blank lines', () => {
        const content = `Start

Middle


End`;

        const result = processSmartDiff('', content);
        const lines = result.fullText.split('\n');

        // Normalize 2+ newlines to 1 — no blank lines between blocks
        expect(lines).toEqual(['Start', 'Middle', 'End']);

        console.log('\nMixed Blank Lines Test:');
        console.log(`Input lines: ${content.split('\n').length}`);
        console.log(`Output lines: ${lines.length}`);
    });

    it('should validate real crawl content from export', () => {
        // Contenido real del CRAWL a las 00:12.9
        const realCrawl = `Te quedan 13 días de tu plan gratuito. [BUTTON: ¡Mejora tu plan ahora!]

 [BUTTON: ![User logo]()]

User

![Minimizar sidebar]()

![Logo]()

-   User

     [BUTTON: ![Menú]()]

-   ![Dashboard]()Dashboard
-   ![Espacios de trabajo]()Espacios de trabajo
-   ![Conversaciones]()Conversaciones`;

        const result = processSmartDiff('', realCrawl);

        // Analizar el resultado
        const inputLines = realCrawl.split('\n');
        const outputLines = result.fullText.split('\n');

        const inputBlanks = inputLines.filter(l => l.trim() === '').length;
        const outputBlanks = outputLines.filter(l => l.trim() === '').length;

        console.log('\n📊 Real Crawl Analysis:');
        console.log(`Input lines: ${inputLines.length}`);
        console.log(`Input blank lines: ${inputBlanks}`);
        console.log(`Output lines: ${outputLines.length}`);
        console.log(`Output blank lines: ${outputBlanks}`);
        console.log(`Blank lines removed: ${inputBlanks - outputBlanks}`);

        // Lo importante no es cuántas líneas en blanco hay,
        // sino que NO haya líneas en blanco CONSECUTIVAS
        let prevBlank = false;
        let hasConsecutiveBlanks = false;

        outputLines.forEach(line => {
            const isBlank = line.trim() === '';
            if (isBlank && prevBlank) {
                hasConsecutiveBlanks = true;
            }
            prevBlank = isBlank;
        });

        // NO debe haber líneas consecutive blank lines
        expect(hasConsecutiveBlanks).toBe(false);

        // Ver muestra del output
        console.log('\n🔍 Output preview (first 10 lines):');
        outputLines.slice(0, 10).forEach((line, i) => {
            console.log(`${i}: "${line}"`);
        });
    });
});
