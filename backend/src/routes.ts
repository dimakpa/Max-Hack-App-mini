import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type pg from 'pg';
import { parseRequestText } from './ai.js';
import { requireRole } from './auth.js';
import { config } from './config.js';
import { inTransaction, pool } from './db.js';
import { ApiError, assertFound } from './errors.js';
import { rankEquipment } from './ranking.js';
import {
  createOrderSchema,
  draftFieldsSchema,
  reviewSchema,
  rollbackSchema,
  statusSchema,
  supplierApplicationSchema,
  textDraftSchema
} from './schemas.js';
import { orderSelect, serializeDraft, serializeOrder } from './serializers.js';
import { allowedTransitions, rollbackTarget, validateTransition } from './state-machine.js';
import type { OrderStatus } from './types.js';

export const apiRouter = Router();

const categoryLabels = {
  MOBILE_CRANE: 'Автокран',
  TRACTOR: 'Трактор с навесным оборудованием',
  DUMP_TRUCK: 'Самосвал КамАЗ',
  BACKHOE_LOADER: 'Экскаватор-погрузчик'
};

const contactableStatuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'IN_PROGRESS'];

function user(req: Parameters<Parameters<typeof apiRouter.get>[1]>[0]) {
  return assertFound(req.authUser, 'Пользователь не авторизован');
}

async function enqueue(
  client: pg.PoolClient,
  recipientUserId: string,
  type: string,
  text: string,
  orderId: string | null,
  payload: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO notifications(id, recipient_user_id, type, order_id, text, deep_link_payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), recipientUserId, type, orderId, text, payload]
  );
}

apiRouter.get('/meta', async (_req, res) => {
  res.json({
    categories: Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
    localities: ['Чебоксары', 'Новочебоксарск', 'Кугеси', 'Цивильск'],
    demoMode: config.DEMO_AUTH,
    syntheticData: true
  });
});

apiRouter.get('/me', async (req, res) => res.json({ user: user(req) }));

apiRouter.get('/demo-users', async (_req, res) => {
  if (!config.DEMO_AUTH) throw new ApiError(404, 'NOT_FOUND', 'Демонстрационные роли отключены');
  const result = await pool.query(
    `SELECT demo_alias, display_name, role, supplier_id FROM users
     WHERE demo_alias IS NOT NULL ORDER BY role, demo_alias`
  );
  res.json({ users: result.rows.map((row) => ({ alias: row.demo_alias, name: row.display_name, role: row.role, supplierId: row.supplier_id })) });
});

apiRouter.post('/drafts/parse', requireRole('CUSTOMER'), async (req, res) => {
  const body = textDraftSchema.parse(req.body);
  const parsed = await parseRequestText(body.text);
  const id = randomUUID();
  const fields = parsed.fields;
  const result = await pool.query(
    `INSERT INTO request_drafts(
       id, customer_id, source_text, category, scheduled_at, duration_hours, locality,
       work_description, constraints_text, parser_provider
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id, user(req).id, body.text, fields.category, fields.scheduledAt, fields.durationHours,
      fields.locality, fields.workDescription, fields.constraints, parsed.provider]
  );
  res.status(201).json({ draft: serializeDraft(result.rows[0]), fallback: parsed.fallback, notice: parsed.notice });
});

apiRouter.post('/drafts', requireRole('CUSTOMER'), async (req, res) => {
  const fields = draftFieldsSchema.parse(req.body);
  const result = await pool.query(
    `INSERT INTO request_drafts(
       id, customer_id, category, scheduled_at, duration_hours, locality,
       work_description, constraints_text, parser_provider, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual','READY') RETURNING *`,
    [randomUUID(), user(req).id, fields.category, fields.scheduledAt, fields.durationHours,
      fields.locality, fields.workDescription, fields.constraints ?? null]
  );
  res.status(201).json({ draft: serializeDraft(result.rows[0]) });
});

apiRouter.put('/drafts/:id', requireRole('CUSTOMER'), async (req, res) => {
  const fields = draftFieldsSchema.parse(req.body);
  const result = await pool.query(
    `UPDATE request_drafts SET category=$1, scheduled_at=$2, duration_hours=$3, locality=$4,
       work_description=$5, constraints_text=$6, status='READY', updated_at=now()
     WHERE id=$7 AND customer_id=$8 AND status <> 'ORDERED' RETURNING *`,
    [fields.category, fields.scheduledAt, fields.durationHours, fields.locality,
      fields.workDescription, fields.constraints ?? null, req.params.id, user(req).id]
  );
  res.json({ draft: serializeDraft(assertFound(result.rows[0], 'Черновик не найден или уже отправлен')) });
});

apiRouter.get('/drafts/:id/proposals', requireRole('CUSTOMER'), async (req, res) => {
  const draftResult = await pool.query('SELECT * FROM request_drafts WHERE id=$1 AND customer_id=$2', [req.params.id, user(req).id]);
  const draft = assertFound(draftResult.rows[0], 'Черновик не найден');
  if (draft.status !== 'READY') throw new ApiError(409, 'DRAFT_NOT_READY', 'Сначала заполните обязательные поля');
  const isPilotLocality = /чебоксары|новочебоксарск|кугеси|цивильск/i.test(draft.locality);
  if (!isPilotLocality) {
    res.json({ proposals: [], reason: 'Пока работаем только в Чебоксарах и ближайших населённых пунктах Чувашии.' });
    return;
  }
  const result = await pool.query(
    `SELECT e.*, s.name AS supplier_name, s.description AS supplier_description,
       s.rating AS supplier_rating, s.review_count
     FROM equipment e
     JOIN suppliers s ON s.id=e.supplier_id
     WHERE e.category=$1 AND e.region='Чувашская Республика' AND e.is_available=true AND s.is_active=true
       AND EXISTS (
         SELECT 1 FROM equipment_availability a
         WHERE a.equipment_id=e.id AND a.is_available=true AND $2::timestamptz >= a.available_from AND $2::timestamptz < a.available_to
       )
       AND NOT EXISTS (
         SELECT 1 FROM orders o
         WHERE o.equipment_id=e.id AND o.status NOT IN ('DECLINED','CANCELLED')
           AND o.scheduled_at < ($2::timestamptz + ($3 * interval '1 hour'))
           AND (o.scheduled_at + (o.duration_hours * interval '1 hour')) > $2::timestamptz
       )`,
    [draft.category, draft.scheduled_at, draft.duration_hours]
  );
  const ranked = rankEquipment(result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    pricePerShift: row.price_per_shift,
    responseMinutes: row.response_minutes,
    supplierRating: Number(row.supplier_rating)
  })));
  const rankMap = new Map(ranked.map((item) => [item.id, item]));
  const proposals = ranked.slice(0, 5).map((rankedItem) => {
    const row = result.rows.find((candidate) => candidate.id === rankedItem.id)!;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      pricePerShift: row.price_per_shift,
      responseMinutes: row.response_minutes,
      imagePath: row.image_path,
      specifications: row.specifications,
      available: row.is_available,
      supplier: { id: row.supplier_id, name: row.supplier_name, description: row.supplier_description, rating: Number(row.supplier_rating), reviewCount: row.review_count },
      score: rankMap.get(row.id)?.score,
      explanation: rankMap.get(row.id)?.explanation
    };
  });
  res.json({ proposals, reason: proposals.length ? null : 'На выбранное время свободной техники нет.' });
});

apiRouter.post('/orders', requireRole('CUSTOMER'), async (req, res) => {
  const body = createOrderSchema.parse(req.body);
  const authUser = user(req);
  const existing = await pool.query(`${orderSelect} WHERE o.customer_id=$1 AND o.client_request_id=$2`, [authUser.id, body.idempotencyKey]);
  if (existing.rows[0]) {
    res.json({ order: serializeOrder(existing.rows[0]), replayed: true });
    return;
  }

  const orderId = randomUUID();
  await inTransaction(async (client) => {
    const draftResult = await client.query('SELECT * FROM request_drafts WHERE id=$1 AND customer_id=$2 FOR UPDATE', [body.draftId, authUser.id]);
    const draft = assertFound(draftResult.rows[0], 'Черновик не найден');
    if (draft.status !== 'READY') throw new ApiError(409, 'DRAFT_NOT_READY', 'Черновик уже отправлен или не заполнен');
    const equipmentResult = await client.query(
      `SELECT e.*, s.name AS supplier_name FROM equipment e JOIN suppliers s ON s.id=e.supplier_id WHERE e.id=$1 FOR UPDATE`,
      [body.equipmentId]
    );
    const equipment = assertFound(equipmentResult.rows[0], 'Техника не найдена');
    if (!equipment.is_available || equipment.category !== draft.category || equipment.region !== 'Чувашская Республика') {
      throw new ApiError(409, 'EQUIPMENT_UNAVAILABLE', 'Техника больше недоступна для этой заявки');
    }
    const availability = await client.query(
      `SELECT 1 FROM equipment_availability a
       WHERE a.equipment_id=$1 AND a.is_available=true AND $2::timestamptz >= a.available_from AND $2::timestamptz < a.available_to
       AND NOT EXISTS (
         SELECT 1 FROM orders o WHERE o.equipment_id=$1 AND o.status NOT IN ('DECLINED','CANCELLED')
           AND o.scheduled_at < ($2::timestamptz + ($3 * interval '1 hour'))
           AND (o.scheduled_at + (o.duration_hours * interval '1 hour')) > $2::timestamptz
       )`,
      [equipment.id, draft.scheduled_at, draft.duration_hours]
    );
    if (!availability.rowCount) throw new ApiError(409, 'EQUIPMENT_UNAVAILABLE', 'Техника уже занята на выбранное время');
    const publicNumber = `TZ-${orderId.slice(0, 8).toUpperCase()}`;
    await client.query(
      `INSERT INTO orders(id, public_number, customer_id, supplier_id, equipment_id, draft_id,
        client_request_id, status, category, scheduled_at, duration_hours, locality,
        work_description, constraints_text, price_per_shift)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'NEW',$8,$9,$10,$11,$12,$13,$14)`,
      [orderId, publicNumber, authUser.id, equipment.supplier_id, equipment.id, draft.id,
        body.idempotencyKey, draft.category, draft.scheduled_at, draft.duration_hours,
        draft.locality, draft.work_description, draft.constraints_text, equipment.price_per_shift]
    );
    await client.query('UPDATE request_drafts SET status=\'ORDERED\', updated_at=now() WHERE id=$1', [draft.id]);
    await client.query(
      `INSERT INTO order_events(id, order_id, actor_user_id, from_status, to_status, note)
       VALUES ($1,$2,$3,NULL,'NEW','Заявка отправлена поставщику')`,
      [randomUUID(), orderId, authUser.id]
    );
    const dispatchers = await client.query("SELECT id FROM users WHERE role='DISPATCHER' AND supplier_id=$1", [equipment.supplier_id]);
    for (const dispatcher of dispatchers.rows) {
      await enqueue(client, dispatcher.id, 'NEW_ORDER', `Новая заявка ${publicNumber}: ${equipment.title}`, orderId, `order_${orderId}`);
    }
  });
  const created = await pool.query(`${orderSelect} WHERE o.id=$1`, [orderId]);
  res.status(201).json({ order: serializeOrder(created.rows[0]), replayed: false });
});

apiRouter.get('/orders', async (req, res) => {
  const authUser = user(req);
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const values: unknown[] = [authUser.role === 'CUSTOMER' ? authUser.id : authUser.supplierId];
  let where = authUser.role === 'CUSTOMER' ? 'o.customer_id=$1' : 'o.supplier_id=$1';
  if (status) {
    values.push(status);
    where += ` AND o.status=$${values.length}`;
  }
  const result = await pool.query(`${orderSelect} WHERE ${where} ORDER BY o.created_at DESC`, values);
  res.json({ orders: result.rows.map(serializeOrder) });
});

apiRouter.get('/orders/:id', async (req, res) => {
  const authUser = user(req);
  const result = await pool.query(`${orderSelect} WHERE o.id=$1`, [req.params.id]);
  const order = assertFound(result.rows[0], 'Заявка не найдена');
  const allowed = authUser.role === 'CUSTOMER' ? order.customer_id === authUser.id : order.supplier_id === authUser.supplierId;
  if (!allowed) throw new ApiError(403, 'FORBIDDEN', 'Нет доступа к этой заявке');
  const events = await pool.query(
    `SELECT from_status AS "fromStatus", to_status AS "toStatus", note, created_at AS "createdAt"
     FROM order_events WHERE order_id=$1 ORDER BY created_at`, [order.id]
  );
  const callback = await pool.query(
    'SELECT requester_role AS "requesterRole", status FROM callback_requests WHERE order_id=$1',
    [order.id]
  );
  const outgoingCallback = callback.rows.find((item) => item.requesterRole === authUser.role);
  const incomingCallback = callback.rows.find((item) => item.requesterRole !== authUser.role);
  const target = authUser.role === 'DISPATCHER' ? rollbackTarget(order.status) : null;
  const allowedRollback = target && !(order.status === 'COMPLETED' && order.review_id)
    ? { target }
    : null;
  res.json({
    order: {
      ...serializeOrder(order),
      allowedTransitions: allowedTransitions(order.status, authUser.role),
      allowedRollback,
      canRequestCallback: contactableStatuses.includes(order.status),
      callbackRequestStatus: outgoingCallback?.status ?? null,
      incomingCallbackRequestStatus: incomingCallback?.status ?? null,
      events: events.rows
    }
  });
});

apiRouter.post('/orders/:id/status', async (req, res) => {
  const body = statusSchema.parse(req.body);
  const authUser = user(req);
  await inTransaction(async (client) => {
    const result = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const order = assertFound(result.rows[0], 'Заявка не найдена');
    const owns = authUser.role === 'CUSTOMER' ? order.customer_id === authUser.id : order.supplier_id === authUser.supplierId;
    if (!owns) throw new ApiError(403, 'FORBIDDEN', 'Нет доступа к этой заявке');
    if (order.status === body.status) return;
    validateTransition(order.status, body.status, authUser.role);
    if (body.status === 'DECLINED' && !body.reason) throw new ApiError(422, 'DECLINE_REASON_REQUIRED', 'Укажите причину отклонения');
    await client.query(
      'UPDATE orders SET status=$1, decline_reason=$2, updated_at=now() WHERE id=$3',
      [body.status, body.status === 'DECLINED' ? body.reason : null, order.id]
    );
    await client.query(
      `INSERT INTO order_events(id, order_id, actor_user_id, from_status, to_status, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), order.id, authUser.id, order.status, body.status, body.reason ?? null]
    );
    if (['CONFIRMED', 'DECLINED', 'COMPLETED'].includes(body.status)) {
      const messages: Record<string, string> = {
        CONFIRMED: `Заявка ${order.public_number} подтверждена поставщиком`,
        DECLINED: `Заявка ${order.public_number} отклонена: ${body.reason}`,
        COMPLETED: `Работы по заявке ${order.public_number} завершены. Оставьте отзыв.`
      };
      await enqueue(client, order.customer_id, `ORDER_${body.status}`, messages[body.status]!, order.id,
        `${body.status === 'COMPLETED' ? 'review' : 'order'}_${order.id}`);
    }
  });
  const updated = await pool.query(`${orderSelect} WHERE o.id=$1`, [req.params.id]);
  res.json({ order: serializeOrder(updated.rows[0]) });
});

apiRouter.post('/orders/:id/status/rollback', requireRole('DISPATCHER'), async (req, res) => {
  const body = rollbackSchema.parse(req.body);
  const authUser = user(req);
  await inTransaction(async (client) => {
    const result = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const order = assertFound(result.rows[0], 'Заявка не найдена');
    if (order.supplier_id !== authUser.supplierId) throw new ApiError(403, 'FORBIDDEN', 'Нет доступа к этой заявке');
    const target = rollbackTarget(order.status);
    if (!target) throw new ApiError(409, 'ROLLBACK_UNAVAILABLE', 'Этот статус нельзя вернуть назад');
    if (order.status === 'COMPLETED') {
      const review = await client.query('SELECT 1 FROM reviews WHERE order_id=$1', [order.id]);
      if (review.rowCount) throw new ApiError(409, 'ROLLBACK_BLOCKED_BY_REVIEW', 'После отзыва завершённую заявку нельзя вернуть в работу');
    }
    await client.query('UPDATE orders SET status=$1, updated_at=now() WHERE id=$2', [target, order.id]);
    await client.query(
      `INSERT INTO order_events(id, order_id, actor_user_id, from_status, to_status, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), order.id, authUser.id, order.status, target, `Статус возвращён: ${body.reason}`]
    );
    await enqueue(
      client,
      order.customer_id,
      'ORDER_STATUS_ROLLED_BACK',
      `Поставщик уточнил статус заявки ${order.public_number}: ${target === 'NEW' ? 'снова ожидает подтверждения' : target === 'CONFIRMED' ? 'работы ещё не начаты' : 'работы ещё идут'}.`,
      order.id,
      `order_${order.id}`
    );
  });
  const updated = await pool.query(`${orderSelect} WHERE o.id=$1`, [req.params.id]);
  res.json({ order: serializeOrder(updated.rows[0]) });
});

apiRouter.post('/orders/:id/callback', requireRole('CUSTOMER', 'DISPATCHER'), async (req, res) => {
  const authUser = user(req);
  const callbackId = randomUUID();
  let replayed = false;
  await inTransaction(async (client) => {
    const result = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const order = assertFound(result.rows[0], 'Заявка не найдена');
    const owns = authUser.role === 'CUSTOMER'
      ? order.customer_id === authUser.id
      : order.supplier_id === authUser.supplierId;
    if (!owns) throw new ApiError(403, 'FORBIDDEN', 'Нет доступа к этой заявке');
    if (!contactableStatuses.includes(order.status)) {
      throw new ApiError(409, 'CALLBACK_UNAVAILABLE', 'Связаться можно только по активной заявке');
    }
    const existing = await client.query(
      'SELECT id, status FROM callback_requests WHERE order_id=$1 AND requester_role=$2 FOR UPDATE',
      [order.id, authUser.role]
    );
    if (existing.rows[0]?.status === 'REQUESTED') { replayed = true; return; }
    if (existing.rows[0]) {
      await client.query(
        `UPDATE callback_requests SET requester_user_id=$1, status='REQUESTED', created_at=now() WHERE id=$2`,
        [authUser.id, existing.rows[0].id]
      );
    } else {
      await client.query(
        'INSERT INTO callback_requests(id, order_id, requester_user_id, requester_role) VALUES ($1,$2,$3,$4)',
        [callbackId, order.id, authUser.id, authUser.role]
      );
    }
    if (authUser.role === 'CUSTOMER') {
      const dispatchers = await client.query("SELECT id FROM users WHERE role='DISPATCHER' AND supplier_id=$1", [order.supplier_id]);
      for (const dispatcher of dispatchers.rows) {
        await enqueue(client, dispatcher.id, 'CALLBACK_REQUEST', `Заказчик просит связаться по заявке ${order.public_number}`, order.id, `order_${order.id}`);
      }
    } else {
      await enqueue(
        client,
        order.customer_id,
        'CALLBACK_REQUEST',
        `Поставщик хочет уточнить детали заявки ${order.public_number}. Свяжитесь с ним в MAX.`,
        order.id,
        `order_${order.id}`
      );
    }
  });
  res.status(replayed ? 200 : 201).json({ status: 'REQUESTED', replayed });
});

apiRouter.post('/orders/:id/callback/acknowledge', requireRole('CUSTOMER', 'DISPATCHER'), async (req, res) => {
  const authUser = user(req);
  let replayed = false;
  await inTransaction(async (client) => {
    const result = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const order = assertFound(result.rows[0], 'Заявка не найдена');
    const owns = authUser.role === 'CUSTOMER'
      ? order.customer_id === authUser.id
      : order.supplier_id === authUser.supplierId;
    if (!owns) throw new ApiError(403, 'FORBIDDEN', 'Нет доступа к этой заявке');
    const requesterRole = authUser.role === 'CUSTOMER' ? 'DISPATCHER' : 'CUSTOMER';
    const callback = await client.query(
      'SELECT * FROM callback_requests WHERE order_id=$1 AND requester_role=$2 FOR UPDATE',
      [order.id, requesterRole]
    );
    const requestRow = assertFound(callback.rows[0], 'Активный запрос на связь не найден');
    if (requestRow.status === 'ACKNOWLEDGED') { replayed = true; return; }
    await client.query("UPDATE callback_requests SET status='ACKNOWLEDGED' WHERE id=$1", [requestRow.id]);
    await enqueue(
      client,
      requestRow.requester_user_id,
      'CALLBACK_ACKNOWLEDGED',
      `${authUser.role === 'CUSTOMER' ? 'Заказчик' : 'Поставщик'} подтвердил связь по заявке ${order.public_number}.`,
      order.id,
      `order_${order.id}`
    );
  });
  res.json({ status: 'ACKNOWLEDGED', replayed });
});

apiRouter.post('/orders/:id/review', requireRole('CUSTOMER'), async (req, res) => {
  const body = reviewSchema.parse(req.body);
  const authUser = user(req);
  const review = await inTransaction(async (client) => {
    const orderResult = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id]);
    const order = assertFound(orderResult.rows[0], 'Заявка не найдена');
    if (order.customer_id !== authUser.id) throw new ApiError(403, 'FORBIDDEN', 'Нет доступа к этой заявке');
    if (order.status !== 'COMPLETED') throw new ApiError(409, 'ORDER_NOT_COMPLETED', 'Отзыв доступен только после завершения');
    const existing = await client.query('SELECT id FROM reviews WHERE order_id=$1', [order.id]);
    if (existing.rowCount) throw new ApiError(409, 'REVIEW_EXISTS', 'Отзыв по этой заявке уже оставлен');
    const inserted = await client.query(
      `INSERT INTO reviews(id, order_id, customer_id, supplier_id, rating, text)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [randomUUID(), order.id, authUser.id, order.supplier_id, body.rating, body.text]
    );
    await client.query(
      `UPDATE suppliers SET rating=round(((rating * review_count + $1)::numeric / (review_count + 1)), 1), review_count=review_count+1 WHERE id=$2`,
      [body.rating, order.supplier_id]
    );
    return inserted.rows[0];
  });
  res.status(201).json({ review: { id: review.id, rating: review.rating, text: review.text } });
});

apiRouter.post('/supplier-applications', requireRole('CUSTOMER'), async (req, res) => {
  const body = supplierApplicationSchema.parse(req.body);
  const result = await pool.query(
    `INSERT INTO supplier_applications(id, applicant_user_id, company_name, region, contact, categories)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
    [randomUUID(), user(req).id, body.companyName, body.region, body.contact, JSON.stringify(body.categories)]
  );
  res.status(201).json({ application: { id: result.rows[0].id, status: result.rows[0].status, companyName: result.rows[0].company_name } });
});

apiRouter.get('/notifications', async (req, res) => {
  const result = await pool.query(
    `SELECT id, type, order_id AS "orderId", text, deep_link_payload AS "deepLinkPayload",
       status, created_at AS "createdAt" FROM notifications
     WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 30`,
    [user(req).id]
  );
  res.json({ notifications: result.rows });
});
