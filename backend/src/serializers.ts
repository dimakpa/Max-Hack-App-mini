import type { QueryResultRow } from 'pg';

export function serializeDraft(row: QueryResultRow): Record<string, unknown> {
  return {
    id: row.id,
    sourceText: row.source_text,
    category: row.category,
    scheduledAt: row.scheduled_at?.toISOString?.() ?? row.scheduled_at,
    durationHours: row.duration_hours,
    locality: row.locality,
    workDescription: row.work_description,
    constraints: row.constraints_text,
    parserProvider: row.parser_provider,
    status: row.status
  };
}

export function serializeOrder(row: QueryResultRow): Record<string, unknown> {
  return {
    id: row.id,
    publicNumber: row.public_number,
    status: row.status,
    category: row.category,
    scheduledAt: row.scheduled_at?.toISOString?.() ?? row.scheduled_at,
    durationHours: row.duration_hours,
    locality: row.locality,
    workDescription: row.work_description,
    constraints: row.constraints_text,
    pricePerShift: row.price_per_shift,
    declineReason: row.decline_reason,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
    equipment: row.equipment_id ? {
      id: row.equipment_id,
      title: row.equipment_title,
      imagePath: row.image_path
    } : undefined,
    supplier: row.supplier_id ? {
      id: row.supplier_id,
      name: row.supplier_name,
      rating: Number(row.supplier_rating)
    } : undefined,
    customer: row.customer_id ? { id: row.customer_id, name: row.customer_name } : undefined,
    review: row.review_id ? { id: row.review_id, rating: row.review_rating, text: row.review_text } : null
  };
}

export const orderSelect = `
  SELECT o.*, e.title AS equipment_title, e.image_path,
    s.name AS supplier_name, s.rating AS supplier_rating,
    u.display_name AS customer_name,
    r.id AS review_id, r.rating AS review_rating, r.text AS review_text
  FROM orders o
  JOIN equipment e ON e.id = o.equipment_id
  JOIN suppliers s ON s.id = o.supplier_id
  JOIN users u ON u.id = o.customer_id
  LEFT JOIN reviews r ON r.order_id = o.id`;

