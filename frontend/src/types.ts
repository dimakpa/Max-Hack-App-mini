export type Role = 'CUSTOMER' | 'DISPATCHER' | 'ADMIN';
export type Category = 'MOBILE_CRANE' | 'TRACTOR' | 'DUMP_TRUCK' | 'BACKHOE_LOADER';
export type OrderStatus = 'NEW' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED' | 'CANCELLED';

export interface User { id: string; displayName: string; role: Role; supplierId: string | null; demoAlias: string | null }
export interface DemoUser { alias: string; name: string; role: Role; supplierId: string | null }
export interface Meta { categories: Array<{ value: Category; label: string }>; localities: string[]; demoMode: boolean; syntheticData: boolean }
export interface Draft {
  id: string;
  sourceText: string | null;
  category: Category | null;
  scheduledAt: string | null;
  durationHours: number | null;
  locality: string | null;
  workDescription: string | null;
  constraints: string | null;
  parserProvider: string;
  status: string;
}
export interface Proposal {
  id: string;
  title: string;
  description: string;
  category: Category;
  pricePerShift: number;
  responseMinutes: number;
  imagePath: string;
  specifications: Record<string, string>;
  available: boolean;
  explanation: string;
  supplier: { id: string; name: string; description: string; rating: number; reviewCount: number };
}
export interface Order {
  id: string;
  publicNumber: string;
  status: OrderStatus;
  category: Category;
  scheduledAt: string;
  durationHours: number;
  locality: string;
  workDescription: string;
  constraints: string | null;
  pricePerShift: number;
  declineReason: string | null;
  createdAt: string;
  equipment: { id: string; title: string; imagePath: string };
  supplier: { id: string; name: string; rating: number };
  customer: { id: string; name: string };
  review: { id: string; rating: number; text: string } | null;
  allowedTransitions?: OrderStatus[];
  allowedRollback?: { target: OrderStatus } | null;
  canRequestCallback?: boolean;
  callbackRequestStatus?: 'REQUESTED' | 'ACKNOWLEDGED' | null;
  incomingCallbackRequestStatus?: 'REQUESTED' | 'ACKNOWLEDGED' | null;
  events?: Array<{ fromStatus: OrderStatus | null; toStatus: OrderStatus; note: string | null; createdAt: string }>;
}
export interface Notification {
  id: string;
  type: string;
  orderId: string | null;
  text: string;
  status: string;
  createdAt: string;
}
