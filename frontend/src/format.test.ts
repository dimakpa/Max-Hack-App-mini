import { describe, expect, it } from 'vitest';
import { categoryLabels, money, statusLabels } from './format';

describe('UI formatting', () => {
  it('has labels for every MVP category and status', () => {
    expect(Object.keys(categoryLabels)).toHaveLength(4);
    expect(Object.keys(statusLabels)).toHaveLength(6);
  });

  it('formats shift prices in rubles', () => {
    expect(money(42000)).toMatch(/42[\s\u00a0]?000 ₽/);
  });
});

