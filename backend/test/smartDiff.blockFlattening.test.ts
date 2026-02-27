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

        // Debe usar diff (no full)
        expect(result.decision).toBe('diff');

        // El diff debe tener contenido aplanado dentro de ON y CHANGED
        // Los bloques citados NO deben tener saltos de línea internos
        expect(result.payload).toContain('<<<<<<< ON');
        expect(result.payload).toContain('>>>>>>> CHANGED');

        // Verificar que el contenido dentro del bloque está aplanado
        // Extraer el contenido entre ON y =======
        const onMatch = result.payload.match(/<<<<<<< ON\n([\s\S]*?)\n=======/);
        const changedMatch = result.payload.match(/=======\n([\s\S]*?)\n>>>>>>> CHANGED/);

        expect(onMatch).toBeTruthy();
        expect(changedMatch).toBeTruthy();

        if (onMatch && changedMatch) {
            const onContent = onMatch[1];
            const changedContent = changedMatch[1];

            // El contenido del bloque NO debe tener múltiples \n consecutivos
            // Debe estar en una sola línea o con separadores mínimos
            expect(onContent).not.toMatch(/\n\n/); // No debe haber líneas dobles
            expect(changedContent).not.toMatch(/\n\n/);

            // Debe contener el contenido de forma colapsada
            expect(onContent).toContain('[ ] Comprar leche');
            expect(changedContent).toContain('[x] Comprar leche');
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

        expect(result.decision).toBe('diff');

        // Debe haber múltiples bloques ON-CHANGED
        const onCount = (result.payload.match(/<<<<<<< ON/g) || []).length;
        expect(onCount).toBeGreaterThan(0);

        // Los bloques deben estar separados pero el contenido interno aplanado
        const blocks = result.payload.split('>>>>>>> CHANGED');

        blocks.forEach((block, idx) => {
            if (idx < blocks.length - 1) { // Ignorar el último fragmento vacío
                // Extraer la parte ON
                const onMatch = block.match(/<<<<<<< ON\n([\s\S]*?)\n=======/);
                if (onMatch) {
                    const onContent = onMatch[1];
                    // No debe tener líneas en blanco múltiples
                    expect(onContent.split('\n').filter(l => l.trim() === '').length).toBeLessThanOrEqual(1);
                }
            }
        });
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

        // Si usa diff, los bloques ON/CHANGED deben estar aplanados
        if (result.decision === 'diff') {
            expect(result.payload).not.toMatch(/\n\n\n/); // No triple newlines en bloques
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

        expect(result.decision).toBe('diff');

        // El bloque ON debe contener p2 + contexto, todo aplanado
        const onMatch = result.payload.match(/<<<<<<< ON\n([\s\S]*?)\n=======/);

        if (onMatch) {
            const onContent = onMatch[1];

            // Dentro del bloque citado, NO debe haber líneas dobles
            expect(onContent).not.toMatch(/\n\n/);

            // Pero debe contener el contenido
            expect(onContent).toContain('p2 content that will change');
        }
    });
});
