import { describe, expect, it } from 'vitest';
import { maxBotDisplayName, registerMaxBotUser } from './users.js';

describe('MAX bot user registration', () => {
  it('uses the MAX profile name when available', () => {
    expect(maxBotDisplayName({ userId: 1, firstName: 'Анна', lastName: 'Иванова' })).toBe('Анна Иванова');
    expect(maxBotDisplayName({ userId: 2, username: 'anna' })).toBe('anna');
    expect(maxBotDisplayName({ userId: 3 })).toBe('Пользователь MAX');
  });

  it('creates a customer without overwriting an existing role', async () => {
    const query = async (text: string, values: unknown[]) => {
      expect(text).toContain("VALUES ($1,$2,$3,$4,$5,$6,'CUSTOMER')");
      expect(text).toContain('ON CONFLICT (max_user_id) DO UPDATE');
      expect(text).not.toContain('role=');
      expect(values.slice(1)).toEqual([77, 'Илья', null, 'ilya', 'Илья']);
    };
    await registerMaxBotUser({ query } as never, { userId: 77, firstName: 'Илья', username: 'ilya' });
  });
});
