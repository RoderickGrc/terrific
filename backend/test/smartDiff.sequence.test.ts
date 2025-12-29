import { describe, it, expect } from 'vitest';
import { processSmartDiff } from '../src/services/smartDiff.js';

/**
 * Test de Secuencia de Crawls
 * Simula c1=full, c2=diff, c3=diff para verificar el algoritmo de block flattening
 */
describe('SmartDiff - Crawl Sequence (c1→c2→c3)', () => {

    it('debe procesar correctamente una secuencia c1(full) → c2(diff) → c3(diff)', () => {
        // c1: Página inicial con mucho contenido y líneas en blanco
        const c1 = `Header Principal


Sección 1 con título


Contenido de la sección 1 que tiene varias líneas
y puede tener saltos entre líneas


Sección 2 con más contenido


Aquí hay más información
distribuida en múltiples líneas


Footer de la página`;

        // c2: Pequeño cambio en Sección 1
        const c2 = `Header Principal


Sección 1 con título MODIFICADO


Contenido de la sección 1 que tiene varias líneas
y puede tener saltos entre líneas


Sección 2 con más contenido


Aquí hay más información
distribuida en múltiples líneas


Footer de la página`;

        // c3: Pequeño cambio en Sección 2
        const c3 = `Header Principal


Sección 1 con título MODIFICADO


Contenido de la sección 1 que tiene varias líneas
y puede tener saltos entre líneas


Sección 2 ACTUALIZADA


Aquí hay más información NUEVA
distribuida en múltiples líneas


Footer de la página`;

        // Procesamiento c1 (siempre es full - es el primero)
        // En el eventOptimizer, c1 se enviaría directamente sin diff
        const result1 = { payload: c1, decision: 'full' };

        console.log('\n=== C1 (FULL) ===');
        console.log('Decision:', result1.decision);
        console.log('Payload length:', result1.payload.length);
        console.log('Payload preview:', result1.payload.substring(0, 100) + '...');

        // Procesamiento c2 (diff respecto a c1)
        const result2 = processSmartDiff(c1, c2);

        console.log('\n=== C2 (DIFF respecto a C1) ===');
        console.log('Decision:', result2.decision);
        console.log('Payload length:', result2.payload.length);
        console.log('Full length:', result2.fullText.length);
        console.log('Savings:', result2.stats.savedChars, 'chars');
        console.log('\nPayload:');
        console.log(result2.payload);

        // Verificar que c2 use diff (el cambio es pequeño)
        expect(result2.decision).toBe('diff');

        // Verificar que el diff tenga el formato correcto
        expect(result2.payload).toContain('<<<<<<< ON');
        expect(result2.payload).toContain('>>>>>>> CHANGED');

        // Extraer contenido del bloque ON
        const onMatch = result2.payload.match(/<<<<<<< ON\n([\s\S]*?)\n=======/);
        expect(onMatch).toBeTruthy();

        if (onMatch) {
            const onContent = onMatch[1];
            console.log('\n=== C2 ON Block ===');
            console.log(onContent);

            // Verificar que está aplanado (no debe tener líneas dobles)
            expect(onContent).not.toMatch(/\n\n/);

            // Debe contener el contenido relevante
            expect(onContent).toContain('Sección 1 con título');
        }

        // Procesamiento c3 (diff respecto a c2)
        const result3 = processSmartDiff(c2, c3);

        console.log('\n=== C3 (DIFF respecto a C2) ===');
        console.log('Decision:', result3.decision);
        console.log('Payload length:', result3.payload.length);
        console.log('Full length:', result3.fullText.length);
        console.log('Savings:', result3.stats.savedChars, 'chars');
        console.log('\nPayload:');
        console.log(result3.payload);

        // Verificar que c3 use diff
        expect(result3.decision).toBe('diff');

        // Verificar formato
        expect(result3.payload).toContain('<<<<<<< ON');
        expect(result3.payload).toContain('>>>>>>> CHANGED');

        // Extraer contenido del bloque ON de c3
        const onMatch3 = result3.payload.match(/<<<<<<< ON\n([\s\S]*?)\n=======/);
        expect(onMatch3).toBeTruthy();

        if (onMatch3) {
            const onContent = onMatch3[1];
            console.log('\n=== C3 ON Block ===');
            console.log(onContent);

            // Verificar que está aplanado
            expect(onContent).not.toMatch(/\n\n/);

            // Debe contener el contenido de Sección 2
            expect(onContent).toContain('Sección 2');
        }

        // Verificar métricas de optimización
        console.log('\n=== RESUMEN DE OPTIMIZACIÓN ===');
        console.log('C1 (full):', c1.length, 'chars');
        console.log('C2 (diff):', result2.payload.length, 'chars (saved:', result2.stats.savedChars, ')');
        console.log('C3 (diff):', result3.payload.length, 'chars (saved:', result3.stats.savedChars, ')');

        const totalWithoutOptimization = c1.length + c2.length + c3.length;
        const totalWithOptimization = c1.length + result2.payload.length + result3.payload.length;
        const totalSavings = totalWithoutOptimization - totalWithOptimization;

        console.log('Total sin optimización:', totalWithoutOptimization, 'chars');
        console.log('Total con optimización:', totalWithOptimization, 'chars');
        console.log('Ahorro total:', totalSavings, 'chars (' +
            ((totalSavings / totalWithoutOptimization) * 100).toFixed(1) + '%)');

        expect(totalSavings).toBeGreaterThan(0);
    });

    it('debe aplanar bloques ON/CHANGED con cambios mínimos', () => {
        const c1 = `Línea A


Línea B que va a cambiar


Línea C


Línea D`;

        const c2 = `Línea A


Línea B MODIFICADA


Línea C


Línea D`;

        const result = processSmartDiff(c1, c2);

        console.log('\n=== Test de Cambio Mínimo ===');
        console.log('Decision:', result.decision);
        console.log('Payload:');
        console.log(result.payload);

        expect(result.decision).toBe('diff');

        // El bloque ON debe estar completamente aplanado
        const onMatch = result.payload.match(/<<<<<<< ON\n([\s\S]*?)\n=======/);
        const changedMatch = result.payload.match(/=======\n([\s\S]*?)\n>>>>>>> CHANGED/);

        expect(onMatch).toBeTruthy();
        expect(changedMatch).toBeTruthy();

        if (onMatch && changedMatch) {
            const onContent = onMatch[1];
            const changedContent = changedMatch[1];

            console.log('\nON:', onContent);
            console.log('CHANGED:', changedContent);

            // No debe tener líneas en blanco dobles
            expect(onContent.split('\n').length).toBeLessThanOrEqual(3);
            expect(changedContent.split('\n').length).toBeLessThanOrEqual(3);

            // Debe estar en formato colapsado
            expect(onContent).toContain('Línea B que va a cambiar');
            expect(changedContent).toContain('Línea B MODIFICADA');
        }
    });

    it('debe manejar contenido compacto sin líneas en blanco', () => {
        const c1 = `A
B
C que cambiará
D
E`;

        const c2 = `A
B
C MODIFICADO
D
E`;

        const result = processSmartDiff(c1, c2);

        console.log('\n=== Test Sin Líneas en Blanco ===');
        console.log('Decision:', result.decision);
        console.log('Payload:');
        console.log(result.payload);

        // Para contenido tan corto, podría decidir full o diff
        // Lo importante es que esté optimizado
        if (result.decision === 'diff') {
            expect(result.payload).toContain('<<<<<<< ON');

            const onMatch = result.payload.match(/<<<<<<< ON\n([\s\S]*?)\n=======/);
            if (onMatch) {
                const onContent = onMatch[1];
                console.log('ON:', onContent);

                // Debe contener el contexto colapsado
                expect(onContent).toContain('C que cambiará');
            }
        }

        expect(result.payload.length).toBeLessThanOrEqual(result.fullText.length);
    });
});
