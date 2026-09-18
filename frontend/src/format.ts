import type { Category, OrderStatus } from './types';

export const categoryLabels: Record<Category, string> = {
  MOBILE_CRANE: 'Автокран',
  TRACTOR: 'Трактор с навесным оборудованием',
  DUMP_TRUCK: 'Самосвал КамАЗ',
  BACKHOE_LOADER: 'Экскаватор-погрузчик'
};

export const statusLabels: Record<OrderStatus, string> = {
  NEW: 'Новая',
  CONFIRMED: 'Подтверждена',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершена',
  DECLINED: 'Отклонена',
  CANCELLED: 'Отменена'
};

export function money(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
}

export function dateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

