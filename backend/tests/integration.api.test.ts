import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';

const app = createApp();
const customer = { 'x-demo-user': 'customer' };
const dispatcher = { 'x-demo-user': 'dispatcher-a' };

async function readyDraft(category = 'MOBILE_CRANE', locality = 'Чебоксары') {
  const response = await request(app).post('/api/drafts').set(customer).send({
    category,
    scheduledAt: '2028-05-16T06:00:00.000Z',
    durationHours: 8,
    locality,
    workDescription: 'Поднять строительные материалы на площадке',
    constraints: 'Узкий въезд'
  });
  expect(response.status).toBe(201);
  return response.body.draft;
}

beforeEach(async () => {
  await pool.query('TRUNCATE reviews, callback_requests, notifications, order_events, orders, supplier_applications, request_drafts RESTART IDENTITY CASCADE');
});
afterAll(async () => { await pool.end(); });

describe('API customer and dispatcher flow', () => {
  it('completes the order once, preserves idempotency, and accepts exactly one review', async () => {
    const draft = await readyDraft();
    const proposals = await request(app).get(`/api/drafts/${draft.id}/proposals`).set(customer);
    expect(proposals.status).toBe(200);
    expect(proposals.body.proposals).toHaveLength(3);
    expect(proposals.body.proposals[0].supplier.name).toBe('Поставщик А');

    const payload = { draftId: draft.id, equipmentId: proposals.body.proposals[0].id, idempotencyKey: randomUUID() };
    const created = await request(app).post('/api/orders').set(customer).send(payload);
    expect(created.status).toBe(201);
    const replay = await request(app).post('/api/orders').set(customer).send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.order.id).toBe(created.body.order.id);

    const orderId = created.body.order.id;
    expect((await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect((await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect((await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status: 'IN_PROGRESS' })).status).toBe(200);
    expect((await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status: 'COMPLETED' })).status).toBe(200);

    const review = await request(app).post(`/api/orders/${orderId}/review`).set(customer).send({ rating: 5, text: 'Выполнено вовремя' });
    expect(review.status).toBe(201);
    const duplicate = await request(app).post(`/api/orders/${orderId}/review`).set(customer).send({ rating: 4, text: 'Ещё отзыв' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('REVIEW_EXISTS');
  });

  it('rejects unavailable equipment, foreign dispatcher and invalid transitions', async () => {
    const draft = await readyDraft('BACKHOE_LOADER');
    const unavailable = await request(app).post('/api/orders').set(customer).send({
      draftId: draft.id,
      equipmentId: '10000000-0000-4000-8000-000000000009',
      idempotencyKey: randomUUID()
    });
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error.code).toBe('EQUIPMENT_UNAVAILABLE');

    const craneDraft = await readyDraft();
    const proposals = await request(app).get(`/api/drafts/${craneDraft.id}/proposals`).set(customer);
    const created = await request(app).post('/api/orders').set(customer).send({ draftId: craneDraft.id, equipmentId: proposals.body.proposals[0].id, idempotencyKey: randomUUID() });
    const orderId = created.body.order.id;
    expect((await request(app).post(`/api/orders/${orderId}/status`).set({ 'x-demo-user': 'dispatcher-b' }).send({ status: 'CONFIRMED' })).status).toBe(403);
    expect((await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status: 'COMPLETED' })).status).toBe(409);
    expect((await request(app).post(`/api/orders/${orderId}/review`).set(customer).send({ rating: 5, text: 'Рано' })).status).toBe(409);
  });

  it('supports contact requests from both sides and audited one-step rollbacks', async () => {
    const draft = await readyDraft();
    const proposals = await request(app).get(`/api/drafts/${draft.id}/proposals`).set(customer);
    const created = await request(app).post('/api/orders').set(customer).send({
      draftId: draft.id,
      equipmentId: proposals.body.proposals[0].id,
      idempotencyKey: randomUUID()
    });
    const orderId = created.body.order.id;

    const dispatcherContact = await request(app).post(`/api/orders/${orderId}/callback`).set(dispatcher);
    expect(dispatcherContact.status).toBe(201);
    expect((await request(app).post(`/api/orders/${orderId}/callback`).set(dispatcher)).body.replayed).toBe(true);
    const customerBeforeAcknowledge = await request(app).get(`/api/orders/${orderId}`).set(customer);
    expect(customerBeforeAcknowledge.body.order.incomingCallbackRequestStatus).toBe('REQUESTED');
    expect((await request(app).post(`/api/orders/${orderId}/callback/acknowledge`).set(customer)).body.status).toBe('ACKNOWLEDGED');
    expect((await request(app).post(`/api/orders/${orderId}/callback`).set(dispatcher)).status).toBe(201);
    const customerContact = await request(app).post(`/api/orders/${orderId}/callback`).set(customer);
    expect(customerContact.status).toBe(201);
    expect((await request(app).post(`/api/orders/${orderId}/callback/acknowledge`).set(dispatcher)).body.status).toBe('ACKNOWLEDGED');
    const contactNotifications = await pool.query("SELECT type FROM notifications WHERE order_id=$1 AND type='CALLBACK_REQUEST'", [orderId]);
    expect(contactNotifications.rowCount).toBe(3);

    await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status: 'CONFIRMED' });
    expect((await request(app).post(`/api/orders/${orderId}/status/rollback`).set(dispatcher).send({ reason: 'Подтвердил по ошибке' })).body.order.status).toBe('NEW');
    await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status: 'CONFIRMED' });
    await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status: 'IN_PROGRESS' });
    expect((await request(app).post(`/api/orders/${orderId}/status/rollback`).set(dispatcher).send({ reason: 'Работы ещё не начались' })).body.order.status).toBe('CONFIRMED');

    const detail = await request(app).get(`/api/orders/${orderId}`).set(dispatcher);
    expect(detail.body.order.allowedRollback).toEqual({ target: 'NEW' });
    expect(detail.body.order.callbackRequestStatus).toBe('REQUESTED');
    expect(detail.body.order.incomingCallbackRequestStatus).toBe('ACKNOWLEDGED');
    expect(detail.body.order.events.at(-1).note).toMatch(/Работы ещё не начались/);
  });

  it('does not reopen a completed order after a review', async () => {
    const draft = await readyDraft();
    const proposals = await request(app).get(`/api/drafts/${draft.id}/proposals`).set(customer);
    const created = await request(app).post('/api/orders').set(customer).send({
      draftId: draft.id,
      equipmentId: proposals.body.proposals[0].id,
      idempotencyKey: randomUUID()
    });
    const orderId = created.body.order.id;
    for (const status of ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED']) {
      await request(app).post(`/api/orders/${orderId}/status`).set(dispatcher).send({ status });
    }
    await request(app).post(`/api/orders/${orderId}/review`).set(customer).send({ rating: 5, text: 'Всё хорошо' });
    const rollback = await request(app).post(`/api/orders/${orderId}/status/rollback`).set(dispatcher).send({ reason: 'Хотим вернуть' });
    expect(rollback.status).toBe(409);
    expect(rollback.body.error.code).toBe('ROLLBACK_BLOCKED_BY_REVIEW');
  });

  it('returns no proposals outside the pilot and stores supplier applications as submitted', async () => {
    const draft = await readyDraft('TRACTOR', 'Казань');
    const proposals = await request(app).get(`/api/drafts/${draft.id}/proposals`).set(customer);
    expect(proposals.body.proposals).toEqual([]);
    expect(proposals.body.reason).toMatch(/Чебоксар/);

    const application = await request(app).post('/api/supplier-applications').set(customer).send({
      companyName: 'Тестовая механизация',
      region: 'Чувашская Республика',
      contact: 'demo@example.test',
      categories: ['TRACTOR']
    });
    expect(application.status).toBe(201);
    expect(application.body.application.status).toBe('SUBMITTED');
    const suppliers = await pool.query("SELECT count(*)::int AS count FROM suppliers WHERE name='Тестовая механизация'");
    expect(suppliers.rows[0].count).toBe(0);
  });
});
