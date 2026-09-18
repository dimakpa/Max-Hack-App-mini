import { describe, expect, it } from 'vitest';
import { rankEquipment } from '../src/ranking.js';

describe('proposal ranking', () => {
  const items = [
    { id: 'b', title: 'B', pricePerShift: 40_000, responseMinutes: 60, supplierRating: 4.6 },
    { id: 'a', title: 'A', pricePerShift: 42_000, responseMinutes: 35, supplierRating: 4.9 },
    { id: 'c', title: 'C', pricePerShift: 36_000, responseMinutes: 70, supplierRating: 4.5 }
  ];

  it('is deterministic and explains every result', () => {
    expect(rankEquipment(items).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(rankEquipment(items)).toEqual(rankEquipment([...items]));
    expect(rankEquipment(items).every((item) => item.explanation.length > 10)).toBe(true);
  });
});

