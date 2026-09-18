import { ApiError } from './errors.js';
import type { OrderStatus, UserRole } from './types.js';

const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  NEW: ['CONFIRMED', 'DECLINED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: []
};

const rollbackTargets: Partial<Record<OrderStatus, OrderStatus>> = {
  CONFIRMED: 'NEW',
  IN_PROGRESS: 'CONFIRMED',
  COMPLETED: 'IN_PROGRESS'
};

export function allowedTransitions(status: OrderStatus, role: UserRole): OrderStatus[] {
  if (role === 'DISPATCHER') return [...transitions[status]];
  if (role === 'CUSTOMER' && status === 'CONFIRMED') return ['CANCELLED'];
  return [];
}

export function validateTransition(current: OrderStatus, next: OrderStatus, role: UserRole): void {
  if (current === next) return;
  if (!allowedTransitions(current, role).includes(next)) {
    throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Переход ${current} -> ${next} недоступен для текущей роли`);
  }
}

export function rollbackTarget(status: OrderStatus): OrderStatus | null {
  return rollbackTargets[status] ?? null;
}
