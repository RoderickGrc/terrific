import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load the root .env (two levels up from frontend/test/)
dotenv.config({ path: resolve(__dirname, '../../.env') });

const apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const apiBase = process.env.VITE_OPENAI_API_BASE || process.env.OPENAI_API_BASE;
const model = process.env.VITE_OPENAI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!apiKey) {
  console.error('Falta VITE_OPENAI_API_KEY u OPENAI_API_KEY en .env');
  process.exit(1);
}

async function main() {
  const client = new OpenAI({
    apiKey,
    baseURL: apiBase || undefined,
    dangerouslyAllowBrowser: true,
  });

  const extractTextFromSse = (raw) => {
    if (typeof raw !== 'string') return '';
    let out = '';
    raw.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const payload = trimmed.replace(/^data:\s*/, '');
      if (payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta;
        const message = json?.choices?.[0]?.message;
        if (delta?.content) out += delta.content;
        else if (typeof message?.content === 'string') out += message.content;
      } catch {
        // ignore
      }
    });
    return out.trim();
  };

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'Eres un bot QA conciso.' },
      { role: 'user', content: 'Di hola en 5 palabras y nada más.' },
    ],
    response_format: { type: 'text' },
    stream: false,
  });

  const msg = res?.choices?.[0]?.message;
  let content = msg?.content;

  if (!content && msg?.content?.[0]?.text) {
    content = msg.content[0].text;
  } else if (!content && Array.isArray(msg?.content)) {
    content = msg.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text' && typeof part.text === 'string') return part.text;
        if (typeof part?.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  } else if (!content && typeof res === 'string') {
    content = extractTextFromSse(res);
  }

  console.log('✅ OpenAI smoke test ok. Modelo:', model);
  if (typeof content === 'string' && content.trim()) {
    console.log('Respuesta:', content);
  } else {
    console.log('Respuesta no textual, mensaje crudo:', JSON.stringify(msg, null, 2));
    console.log('Respuesta completa cruda:', JSON.stringify(res, null, 2));
  }
}

main().catch((err) => {
  console.error('❌ Error en smoke test:', err?.message || err);
  process.exit(1);
});
