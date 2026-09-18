import { describe, expect, it } from 'vitest';
import { parseDraftJson, parseWithMock } from '../src/ai.js';

describe('deterministic Russian request parser', () => {
  it('extracts only supported confident fields', () => {
    const result = parseWithMock('Нужен автокран в Чебоксарах завтра к 9 на 8 часов, узкий въезд', new Date('2026-09-18T08:00:00Z'));
    expect(result).toMatchObject({
      category: 'MOBILE_CRANE',
      locality: 'Чебоксары',
      durationHours: 8,
      constraints: expect.stringMatching(/узкий/i)
    });
    expect(result.scheduledAt).toBe('2026-09-19T06:00:00.000Z');
  });

  it('leaves uncertain fields empty instead of inventing values', () => {
    const result = parseWithMock('Нужно что-нибудь для работ на объекте', new Date('2026-09-18T08:00:00Z'));
    expect(result.category).toBeNull();
    expect(result.scheduledAt).toBeNull();
    expect(result.durationHours).toBeNull();
    expect(result.locality).toBeNull();
  });

  it.each([
    ['автокран', 'Нужен автокран 25 тонн в Чебоксарах завтра к 9:00 на 8 часов, узкий въезд', 'MOBILE_CRANE', 'Чебоксары', 8],
    ['самосвал', 'Нужен самосвал КамАЗ в Новочебоксарске завтра к 8:00 на смену, вывезти грунт с участка', 'DUMP_TRUCK', 'Новочебоксарск', 8],
    ['трактор', 'Нужен трактор с отвалом в Чебоксарах завтра к 10:00 на 4 часа, ограниченный проезд во двор', 'TRACTOR', 'Чебоксары', 4]
  ])('parses the %s demo scenario without an LLM', (_name, text, category, locality, durationHours) => {
    expect(parseWithMock(text, new Date('2026-09-18T08:00:00Z'))).toMatchObject({ category, locality, durationHours });
  });
});

describe('local LLM structured response parser', () => {
  const payload = {
    category: 'MOBILE_CRANE',
    scheduledAt: '2026-09-19T09:00:00+03:00',
    durationHours: 8,
    locality: 'Чебоксары, ул. Калинина, 109',
    workDescription: 'Поднять плиты на второй этаж',
    constraints: 'Узкий въезд'
  };
  const normalizedPayload = { ...payload, scheduledAt: '2026-09-19T06:00:00.000Z' };

  it('accepts a plain JSON object', () => {
    expect(parseDraftJson(JSON.stringify(payload))).toEqual(normalizedPayload);
  });

  it('tolerates model thinking or a JSON code fence', () => {
    expect(parseDraftJson(`<think>Проверяю поля</think>\n${JSON.stringify(payload)}`)).toEqual(normalizedPayload);
    expect(parseDraftJson(`\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``)).toEqual(normalizedPayload);
  });

  it('rejects unsupported categories instead of trusting model output', () => {
    expect(() => parseDraftJson(JSON.stringify({ ...payload, category: 'BULLDOZER' }))).toThrow();
  });
});
