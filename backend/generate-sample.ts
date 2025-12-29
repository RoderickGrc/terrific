import fs from 'fs';
import path from 'path';
import { optimizeEventsForLLM, OPTIMIZER_CONFIG } from './src/services/eventOptimizer.js';

// Usar la sesión de ejemplo
const sessionDir = '2025-12-23_00-23-21_dajc2z1cgm';
const eventsPath = path.resolve(process.cwd(), `../sessions/${sessionDir}/events.json`);

if (!fs.existsSync(eventsPath)) {
    console.error(`Events file not found: ${eventsPath}`);
    process.exit(1);
}

const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
const startTime = events[0]?.timestamp ? new Date(events[0].timestamp).getTime() : Date.now();

// Generar output optimizado
const optimizedOutput = optimizeEventsForLLM(events, startTime);

// Guardar en la ruta solicitada (asegurando que el directorio existe)
const tempDir = path.resolve(process.cwd(), '../temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const outputPath = path.join(tempDir, 'optimized_events.toon');
fs.writeFileSync(outputPath, optimizedOutput);

console.log(`\n✅ Archivo generado en: ${outputPath}`);
console.log('\n--- Vistazo de las primeras líneas ---');
console.log(optimizedOutput.split('\n').slice(0, 20).join('\n'));
