import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateMaxInitData } from '../src/max-auth.js';

function signedData(token: string, now: number): string {
  const values = {
    auth_date: String(Math.floor(now / 1000)),
    query_id: 'query-1',
    user: JSON.stringify({ id: 12345, first_name: 'Тест' })
  };
  const check = Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return `${Object.entries(values).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}&hash=${hash}`;
}

describe('MAX WebAppData validation', () => {
  it('accepts a current correctly signed payload', () => {
    const now = Date.parse('2026-09-18T10:00:00Z');
    expect(validateMaxInitData(signedData('test-token', now), 'test-token', now).id).toBe(12345);
  });

  it('rejects tampering, duplicate keys and stale auth dates', () => {
    const now = Date.parse('2026-09-18T10:00:00Z');
    expect(() => validateMaxInitData(signedData('test-token', now).replace('query-1', 'query-2'), 'test-token', now)).toThrow(/подпись/i);
    expect(() => validateMaxInitData(`${signedData('test-token', now)}&user=x`, 'test-token', now)).toThrow(/повторяются/i);
    expect(() => validateMaxInitData(signedData('test-token', now - 2 * 60 * 60_000), 'test-token', now)).toThrow(/устарели/i);
  });
});

