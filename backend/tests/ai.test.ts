import { describe, expect, it } from 'vitest';
import { parseWithMock } from '../src/ai.js';

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
});

