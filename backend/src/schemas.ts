import { z } from 'zod';
import { categories, orderStatuses } from './types.js';

export const textDraftSchema = z.object({ text: z.string().trim().min(10).max(2000) });

export const draftFieldsSchema = z.object({
  category: z.enum(categories),
  scheduledAt: z.string().datetime(),
  durationHours: z.number().int().min(1).max(168),
  locality: z.string().trim().min(2).max(120),
  workDescription: z.string().trim().min(10).max(1000),
  constraints: z.string().trim().max(500).nullable().optional()
});

export const createOrderSchema = z.object({
  draftId: z.string().uuid(),
  equipmentId: z.string().uuid(),
  idempotencyKey: z.string().uuid()
});

export const statusSchema = z.object({
  status: z.enum(orderStatuses),
  reason: z.string().trim().min(3).max(500).optional()
});

export const rollbackSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(3).max(500)
});

export const supplierApplicationSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  region: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(3).max(160),
  categories: z.array(z.enum(categories)).min(1).max(4)
});
