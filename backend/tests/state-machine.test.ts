import { describe, expect, it } from 'vitest';
import { allowedTransitions, rollbackTarget, validateTransition } from '../src/state-machine.js';

describe('order status machine', () => {
  it('allows the dispatcher path and customer cancellation only before work', () => {
    expect(allowedTransitions('NEW', 'DISPATCHER')).toEqual(['CONFIRMED', 'DECLINED']);
    expect(allowedTransitions('CONFIRMED', 'DISPATCHER')).toEqual(['IN_PROGRESS', 'CANCELLED']);
    expect(allowedTransitions('CONFIRMED', 'CUSTOMER')).toEqual(['CANCELLED']);
    expect(allowedTransitions('IN_PROGRESS', 'CUSTOMER')).toEqual([]);
  });

  it('treats a repeated target as idempotent', () => {
    expect(() => validateTransition('CONFIRMED', 'CONFIRMED', 'DISPATCHER')).not.toThrow();
  });

  it('rejects skipped and terminal transitions', () => {
    expect(() => validateTransition('NEW', 'COMPLETED', 'DISPATCHER')).toThrow(/Переход/);
    expect(() => validateTransition('COMPLETED', 'CONFIRMED', 'DISPATCHER')).toThrow(/Переход/);
  });

  it('rolls operational statuses back by one step only', () => {
    expect(rollbackTarget('CONFIRMED')).toBe('NEW');
    expect(rollbackTarget('IN_PROGRESS')).toBe('CONFIRMED');
    expect(rollbackTarget('COMPLETED')).toBe('IN_PROGRESS');
    expect(rollbackTarget('NEW')).toBeNull();
    expect(rollbackTarget('CANCELLED')).toBeNull();
  });
});
