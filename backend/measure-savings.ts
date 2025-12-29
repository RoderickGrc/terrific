import fs from 'fs';
import path from 'path';
import { optimizeEventsForLLM, OPTIMIZER_CONFIG } from './src/services/eventOptimizer.js';

// Load events from a recent session
const sessionDir = '2025-12-22_23-59-24_p520ub7fed';
const eventsPath = path.resolve(process.cwd(), `../sessions/${sessionDir}/events.json`);

if (!fs.existsSync(eventsPath)) {
    console.error(`Events file not found: ${eventsPath}`);
    process.exit(1);
}

const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));

// Format currently used in qaReport.ts before my change (simulated)
function formatOld(events, sessionStart) {
    return events.map((event, idx) => {
        return `${idx + 1}. [${event.type}] ${event.message} | details: ${event.details || ''}`;
    }).join('\n');
}

const startTime = events[0]?.timestamp ? new Date(events[0].timestamp).getTime() : Date.now();

const oldOutput = formatOld(events, startTime);
const newOutput = optimizeEventsForLLM(events, startTime);

console.log('--- AHORRO DE TOKENS (Proxy por caracteres) ---');
console.log(`Original (Formato viejo): ${oldOutput.length} caracteres`);
console.log(`Optimizado (TOON + Heurísticas): ${newOutput.length} caracteres`);

const saving = ((oldOutput.length - newOutput.length) / oldOutput.length * 100).toFixed(2);
console.log(`\nReducción total: ${saving}%`);

console.log('\n--- DETALLE POR HEURÍSTICA ---');
console.log('Eventos originales:', events.length);
// Simulated debouncing count check
import { debounceInputEvents, filterStaticResources } from './src/services/eventOptimizer.js';
const debounced = debounceInputEvents(events);
console.log('Eventos tras debouncing:', debounced.length);
const filtered = filterStaticResources(debounced);
console.log('Eventos finales (tras filtros red):', filtered.length);
