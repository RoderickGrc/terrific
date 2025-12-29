import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import OpenAI from 'openai';
import { QAEvent, Session, EventType } from '../types/index.js';
import { qaReportSystemPrompt } from '../prompting.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { config } from '../config.js';

// Load .env from project root (two levels up from backend/src/services)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../../../.env') });

const API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
const API_BASE = process.env.OPENAI_API_BASE || process.env.VITE_OPENAI_API_BASE;
const MODEL = process.env.OPENAI_MODEL || process.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';

// OpenAI client configured for server use
function getOpenAIClient(): OpenAI {
  if (!API_KEY) {
    throw new Error('Falta OPENAI_API_KEY o VITE_OPENAI_API_KEY en el entorno (.env).');
  }
  return new OpenAI({
    apiKey: API_KEY,
    baseURL: API_BASE || undefined,
  });
}

export interface QaReportPayload {
  session: Session | null;
  filteredEvents: QAEvent[];
  activeFilters: Set<EventType> | string[];
  screenshots: { url: string; timestamp: string }[];
}

function formatRelativeTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function fetchImageAsBase64FromUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const base64 = bufferToBase64(arrayBuffer);
    const contentType = response.headers.get('content-type') || 'image/png';
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

async function fetchImageAsBase64FromFile(filePath: string): Promise<string | null> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const base64 = bufferToBase64(fileBuffer.buffer);
    // Try to detect mime type from extension
    const ext = filePath.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp',
    };
    const mime = mimeTypes[ext || ''] || 'image/png';
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

async function fetchImageAsBase64(urlOrPath: string): Promise<string | null> {
  // If it's already a data URL, return it as-is
  if (urlOrPath.startsWith('data:')) {
    return urlOrPath;
  }
  // If it's a URL (starts with http:// or https://), fetch it
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return fetchImageAsBase64FromUrl(urlOrPath);
  }
  // Otherwise, treat it as a file path
  return fetchImageAsBase64FromFile(urlOrPath);
}

import { optimizeEventsForLLM } from './eventOptimizer.js';

function formatEventsSummary(events: QAEvent[], session: Session | null): string {
  if (!events.length) return '';

  const startTime = session?.startTime || Date.now();
  return optimizeEventsForLLM(events, startTime);
}


function extractTextFromSse(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = '';
  raw.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.replace(/^data:\s*/, '');
    if (payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload);
      const delta = json?.choices?.[0]?.delta;
      const message = json?.choices?.[0]?.message;
      if (delta?.content) {
        text += delta.content;
      } else if (message?.content) {
        text += typeof message.content === 'string' ? message.content : '';
      }
    } catch {
      // ignore parse errors
    }
  });
  return text.trim();
}

export async function generateQaReport(payload: QaReportPayload): Promise<string> {
  const openai = getOpenAIClient(); // Validates API_KEY and creates client

  const { session, filteredEvents, activeFilters, screenshots } = payload;
  const filtersArray = Array.isArray(activeFilters)
    ? activeFilters
    : Array.from(activeFilters);
  const hasScreenshotFilter = Array.isArray(activeFilters)
    ? activeFilters.includes(EventType.SCREENSHOT)
    : activeFilters.has(EventType.SCREENSHOT);
  const eventsText = formatEventsSummary(filteredEvents, session);

  const contextLines = [
    `Session ID: ${session?.id || 'desconocida'}`,
    session?.name ? `Nombre: ${session.name}` : null,
    session?.description ? `Descripcion: ${session.description}` : null,
    session?.createdAt ? `Fecha creación: ${session.createdAt}` : null,
    session?.config?.initialUrl ? `URL inicial: ${session.config.initialUrl}` : null,
    `Filtros activos: ${filtersArray.join(', ') || 'ninguno'}`,
    `Eventos incluidos: ${filteredEvents.length}`,
    hasScreenshotFilter ? `Capturas adjuntas: ${screenshots.length}` : 'Capturas adjuntas: no',
    '',
    'Eventos (filtrados):',
    eventsText || 'No hay eventos para los filtros actuales.',
  ].filter(Boolean).join('\n');

  const userContent: Array<
    { type: 'text'; text: string } |
    { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: contextLines }];

  if (hasScreenshotFilter && screenshots.length > 0) {
    console.log(`[QA Report] Loading ${screenshots.length} screenshots for LLM...`);

    const encodedImages = await Promise.all(screenshots.map(s => fetchImageAsBase64(s.url)));

    userContent.push({ type: 'text', text: '\nA continuación se presentan las capturas de pantalla de la sesión en el orden en que ocurrieron:' });

    // Track which images loaded successfully (maintaining order)
    let loadedCount = 0;
    const startTime = session?.startTime || 0;

    encodedImages.forEach((dataUrl, index) => {
      if (dataUrl) {
        const screenshot = screenshots[index];
        const relativeMs = new Date(screenshot.timestamp).getTime() - startTime;
        const timeLabel = formatRelativeTime(relativeMs);

        userContent.push({ type: 'text', text: `[Screenshot #${index + 1} - ${timeLabel}]` });
        userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
        loadedCount++;
      } else {
        console.warn(`[QA Report] Failed to load screenshot #${index + 1}: ${screenshots[index].url}`);
      }
    });

    console.log(`[QA Report] Successfully loaded ${loadedCount}/${screenshots.length} screenshots`);
  }

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: qaReportSystemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'text' },
    stream: false,
  });

  const firstChoice = (completion as any)?.choices?.[0];
  let messageContent = firstChoice?.message?.content as any;
  if (!messageContent && typeof (completion as any) === 'string') {
    messageContent = extractTextFromSse(completion as any);
  }

  const extractText = (content: any): string => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part: any) => {
          if (typeof part === 'string') return part;
          if (part?.type === 'text' && typeof part.text === 'string') return part.text;
          if (typeof part?.text === 'string') return part.text;
          return '';
        })
        .filter(Boolean)
        .join('\n')
        .trim();
    }
    if (content?.[0]?.text) return String(content[0].text);
    return '';
  };

  let content = extractText(messageContent);

  if (!content) {
    throw new Error('No se pudo generar el informe (respuesta vacia).');
  }

  // Append screenshot list at the end for manual reference
  if (hasScreenshotFilter && screenshots.length > 0) {
    const startTime = session?.startTime || 0;
    const screenshotList = screenshots
      .map((s, index) => {
        const relativeMs = new Date(s.timestamp).getTime() - startTime;
        const timeLabel = formatRelativeTime(relativeMs);
        return `[Screenshot #${index + 1} - ${timeLabel}]`;
      })
      .join('\n\n');

    content = `${content.trim()}\n\n---\n\n**Capturas de pantalla de la sesión:**\n\n${screenshotList}`;
  }

  return content.trim();
}

