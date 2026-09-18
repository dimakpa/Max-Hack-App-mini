export const categories = ['MOBILE_CRANE', 'TRACTOR', 'DUMP_TRUCK', 'BACKHOE_LOADER'] as const;
export type Category = (typeof categories)[number];

export const orderStatuses = ['NEW', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED', 'CANCELLED'] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export type UserRole = 'CUSTOMER' | 'DISPATCHER' | 'ADMIN';

export interface AuthUser {
  id: string;
  displayName: string;
  role: UserRole;
  supplierId: string | null;
  demoAlias: string | null;
}

export interface DraftFields {
  category: Category | null;
  scheduledAt: string | null;
  durationHours: number | null;
  locality: string | null;
  workDescription: string | null;
  constraints: string | null;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

