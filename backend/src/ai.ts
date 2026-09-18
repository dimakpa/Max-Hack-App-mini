import { z } from 'zod';
import { config } from './config.js';
import type { Category, DraftFields } from './types.js';

export interface ParseResult {
  fields: DraftFields;
  provider: 'mock' | 'ollama';
  fallback: boolean;
  notice: string | null;
}

const parsedSchema = z.object({
  category: z.enum(['MOBILE_CRANE', 'TRACTOR', 'DUMP_TRUCK', 'BACKHOE_LOADER']).nullable(),
  scheduledAt: z.string().datetime().nullable(),
  durationHours: z.number().int().min(1).max(168).nullable(),
  locality: z.string().min(1).max(120).nullable(),
  workDescription: z.string().min(1).max(1000).nullable(),
  constraints: z.string().max(500).nullable()
});

function detectCategory(text: string): Category | null {
  if (/автокран|кран\b/i.test(text)) return 'MOBILE_CRANE';
  if (/экскаватор.{0,10}погрузчик|обратн.*лопат/i.test(text)) return 'BACKHOE_LOADER';
  if (/самосвал|камаз|грунт/i.test(text)) return 'DUMP_TRUCK';
  if (/трактор|отвал|щ[её]тк/i.test(text)) return 'TRACTOR';
  return null;
}

function detectDate(text: string, now: Date): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})(?:[ T](\d{1,2})(?::(\d{2}))?)?/);
  if (iso) {
    const [, year, month, day, hour = '09', minute = '00'] = iso;
    return new Date(`${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:00+03:00`).toISOString();
  }
  const ru = text.match(/\b(\d{1,2})[.](\d{1,2})(?:[.](20\d{2}))?(?:\D{0,8}(\d{1,2})(?::(\d{2}))?)?/);
  if (ru) {
    const [, day, month, year = String(now.getUTCFullYear()), hour = '09', minute = '00'] = ru;
    if (!day || !month) return null;
    return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute}:00+03:00`).toISOString();
  }
  if (/завтра/i.test(text)) {
    const next = new Date(now);
    next.setUTCDate(next.getUTCDate() + 1);
    const hour = Number(text.match(/(?:к|в)\s+(\d{1,2})/i)?.[1] ?? 9);
    next.setUTCHours(hour - 3, 0, 0, 0);
    return next.toISOString();
  }
  return null;
}

export function parseWithMock(text: string, now = new Date()): DraftFields {
  const localityPatterns: Array<[RegExp, string]> = [
    [/новочебоксарск/i, 'Новочебоксарск'],
    [/чебоксар/i, 'Чебоксары'],
    [/кугес/i, 'Кугеси'],
    [/цивильск/i, 'Цивильск']
  ];
  const locality = localityPatterns.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  const durationMatch = text.match(/(\d{1,3})\s*(?:час|ч\b)/i);
  const shift = /смен/i.test(text) ? 8 : null;
  const constraints = text.match(/(узк(?:ий|ий проезд|ий въезд)[^,.]*|ограниченн(?:ый|ая)[^,.]*|вылет[^,.]*|грузоподъ[её]мност[^,.]*)/i)?.[0] ?? null;
  return {
    category: detectCategory(text),
    scheduledAt: detectDate(text, now),
    durationHours: durationMatch ? Math.min(168, Number(durationMatch[1])) : shift,
    locality,
    workDescription: text.trim() || null,
    constraints
  };
}

async function parseWithOllama(text: string): Promise<DraftFields> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${config.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.OLLAMA_MODEL,
        stream: false,
        format: 'json',
        messages: [{
          role: 'user',
          content: `Извлеки только уверенные поля заявки спецтехники. Неизвестное = null. Верни JSON с category (MOBILE_CRANE|TRACTOR|DUMP_TRUCK|BACKHOE_LOADER), scheduledAt ISO, durationHours, locality, workDescription, constraints. Текст: ${text}`
        }]
      })
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}`);
    const body = await response.json() as { message?: { content?: string } };
    return parsedSchema.parse(JSON.parse(body.message?.content ?? '{}'));
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseRequestText(text: string): Promise<ParseResult> {
  if (config.AI_PROVIDER === 'mock') {
    return { fields: parseWithMock(text), provider: 'mock', fallback: false, notice: null };
  }
  try {
    return { fields: await parseWithOllama(text), provider: 'ollama', fallback: false, notice: null };
  } catch {
    return {
      fields: parseWithMock(text),
      provider: 'mock',
      fallback: true,
      notice: 'Локальный ИИ недоступен. Черновик подготовлен детерминированно, проверьте поля вручную.'
    };
  }
}
