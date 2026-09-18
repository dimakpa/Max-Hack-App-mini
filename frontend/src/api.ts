import type { DemoUser, Draft, Meta, Notification, Order, Proposal, User } from './types';

const base = import.meta.env.VITE_API_BASE ?? '/api';
const demoEnabled = import.meta.env.VITE_DEMO_AUTH === 'true';

let demoAlias = localStorage.getItem('techzakaz-demo-role') ?? 'customer';

export class ApiClientError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function setDemoAlias(alias: string): void {
  demoAlias = alias;
  localStorage.setItem('techzakaz-demo-role', alias);
}

export function getDemoAlias(): string { return demoAlias; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');
  if (demoEnabled) headers.set('x-demo-user', demoAlias);
  else if (window.WebApp?.initData) headers.set('x-max-init-data', window.WebApp.initData);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
  if (!response.ok) throw new ApiClientError(response.status, body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? 'Не удалось выполнить запрос');
  return body as T;
}

export const api = {
  meta: () => request<Meta>('/meta'),
  me: () => request<{ user: User }>('/me'),
  demoUsers: () => request<{ users: DemoUser[] }>('/demo-users'),
  parseDraft: (text: string) => request<{ draft: Draft; fallback: boolean; notice: string | null }>('/drafts/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  createDraft: (fields: DraftFields) => request<{ draft: Draft }>('/drafts', { method: 'POST', body: JSON.stringify(fields) }),
  updateDraft: (id: string, fields: DraftFields) => request<{ draft: Draft }>(`/drafts/${id}`, { method: 'PUT', body: JSON.stringify(fields) }),
  proposals: (id: string) => request<{ proposals: Proposal[]; reason: string | null }>(`/drafts/${id}/proposals`),
  createOrder: (draftId: string, equipmentId: string, idempotencyKey: string) => request<{ order: Order; replayed: boolean }>('/orders', { method: 'POST', body: JSON.stringify({ draftId, equipmentId, idempotencyKey }) }),
  orders: (status?: string) => request<{ orders: Order[] }>(`/orders${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  order: (id: string) => request<{ order: Order }>(`/orders/${id}`),
  setStatus: (id: string, status: string, reason?: string) => request<{ order: Order }>(`/orders/${id}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) }),
  rollbackStatus: (id: string, reason: string) => request<{ order: Order }>(`/orders/${id}/status/rollback`, { method: 'POST', body: JSON.stringify({ reason }) }),
  callback: (id: string) => request<{ status: string; replayed: boolean }>(`/orders/${id}/callback`, { method: 'POST' }),
  acknowledgeCallback: (id: string) => request<{ status: string; replayed: boolean }>(`/orders/${id}/callback/acknowledge`, { method: 'POST' }),
  review: (id: string, rating: number, text: string) => request<{ review: unknown }>(`/orders/${id}/review`, { method: 'POST', body: JSON.stringify({ rating, text }) }),
  supplierApplication: (body: { companyName: string; region: string; contact: string; categories: string[] }) => request<{ application: { id: string; status: string; companyName: string } }>('/supplier-applications', { method: 'POST', body: JSON.stringify(body) }),
  notifications: () => request<{ notifications: Notification[] }>('/notifications')
};

export interface DraftFields {
  category: string;
  scheduledAt: string;
  durationHours: number;
  locality: string;
  workDescription: string;
  constraints: string | null;
}
