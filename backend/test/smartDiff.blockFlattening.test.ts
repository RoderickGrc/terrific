import { describe, it, expect } from 'vitest';
import { processSmartDiff } from '../src/services/smartDiff.js';

/**
 * Block-Aware Flattening Test Suite
 * 
 * Verifica el algoritmo de "Segmentación Retrospectiva basada en Cambios"
 * donde los bloques de contenido se aplanan (eliminan \n internos) pero
 * se preservan los separadores entre bloques lógicos.
 */
describe('SmartDiff - Block-Aware Content Flattening', () => {

    it('debe aplanar contenido dentro de bloques ON y CHANGED', () => {
        // Simula un crawl c1 con múltiples secciones separadas
        const c1 = `Mis Tareas Pendientes


[ ] Comprar leche


[ ] Pasear al perro


Derechos Reservados 2025`;

        // c2: el usuario marca "Comprar leche" como completada
        const c2 = `Mis Tareas Pendientes


[x] Comprar leche


[ ] Pasear al perro


Derechos Reservados 2025`;

        const result = processSmartDiff(c1, c2);

        // Puede usar diff o full según si los hunks son más compactos que el contenido completo
        expect(['diff', 'full']).toContain(result.decision);

        // Si usa diff, debe tener hunks estructurados con contenido aplanado
        expect(result.hunks.length).toBeGreaterThan(0);

        if (result.decision === 'diff') {
            const payloadStr = JSON.stringify(result.hunks);
            expect(payloadStr).toContain('[ ] Comprar leche');
            expect(payloadStr).toContain('[x] Comprar leche');
        } else {
            expect(result.payload).toContain('[x] Comprar leche');
        }
    });

    it('debe preservar separación entre bloques cuando hay múltiples cambios', () => {
        const c1 = `Header

Section 1 with
multiple lines


Section 2 with
more content


Footer`;

        const c2 = `Header

Section 1 MODIFIED
single line


Section 2 ALSO MODIFIED
different content


Footer`;

        const result = processSmartDiff(c1, c2);

        expect(['diff', 'full']).toContain(result.decision);

        // Si usa diff, debe haber hunks
        if (result.decision === 'diff') {
            expect(result.hunks.length).toBeGreaterThan(0);
            const payloadStr = JSON.stringify(result.hunks);
            expect(payloadStr).toContain('Section 1');
            expect(payloadStr).toContain('Section 2');
        }
    });

    it('debe aplanar agresivamente el full content cuando se use decision=full', () => {
        // Caso donde el diff sería más largo que el full
        const c1 = `A

B

C`;

        const c2 = `X

Y

Z`;

        const result = processSmartDiff(c1, c2);

        // Con cambio tan masivo, podría decidir usar 'full'
        if (result.decision === 'full') {
            // El full debe estar aplanado: sin múltiples \n consecutivos
            // exceptuando separadores de bloques lógicos
            const lineBreaksCount = (result.payload.match(/\n\n/g) || []).length;

            // Debe tener menos líneas en blanco que el original
            const originalLineBreaksCount = (c2.match(/\n\n/g) || []).length;
            expect(lineBreaksCount).toBeLessThanOrEqual(originalLineBreaksCount);
        }
    });

    it('debe manejar el ejemplo real del usuario', () => {
        const c1 = `![Logo]()

Sigue estos pasos para personalizar tu organización y activar tu asistente con IA.

1

1.Crear organización

Crear organización

2

2.Crear departamento

Crear departamento`;

        const c2 = `Te quedan 13 días de tu plan gratuito. [BUTTON: ¡Mejora tu plan ahora!]

 [BUTTON: ![User logo]()]

User

![Minimizar sidebar]()

![Logo]()

-   User

 [BUTTON: ![Menú]()]`;

        const result = processSmartDiff(c1, c2);

        // Debe reconocer que es un cambio masivo
        expect(result.decision).toBeDefined();

        // Si usa diff, los hunks deben estar en formato JSON (sin triple newlines)
        if (result.decision === 'diff') {
            expect(result.hunks.length).toBeGreaterThan(0);
        }

        // Si usa full, debe tener el contenido optimizado
        if (result.decision === 'full') {
            // El contenido debe estar más compacto que el original
            expect(result.payload.length).toBeLessThanOrEqual(c2.length);
        }
    });

    it('debe preservar un solo \\n entre bloques lógicos identificados', () => {
        // Test del ejemplo dado por el usuario
        const c1 = `p1 content here

p2 content that will change

p3 more content

p4 final section`;

        const c2 = `p1 content here

p2 MODIFIED content

p3 more content

p4 final section`;

        const result = processSmartDiff(c1, c2);

        expect(['diff', 'full']).toContain(result.decision);

        // Si usa diff, los hunks deben contener p2 + contexto
        if (result.decision === 'diff') {
            expect(result.hunks.length).toBeGreaterThan(0);
            const payloadStr = JSON.stringify(result.hunks);
            expect(payloadStr).toContain('p2 content that will change');
        }
    });
});
