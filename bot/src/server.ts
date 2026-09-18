import express from 'express';
import pg from 'pg';
import { z } from 'zod';
import { deliver } from './delivery.js';

const env = z.object({
  PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().url(),
  MAX_BOT_TOKEN: z.string().optional().default(''),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:8080'),
  PUBLIC_API_URL: z.string().url().default('http://localhost:3001')
}).parse(process.env);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 4 });
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/health', async (_req, res) => {
  const pending = await pool.query("SELECT count(*)::int AS count FROM notifications WHERE status='PENDING'");
  res.json({ status: 'ok', deliveryMode: env.MAX_BOT_TOKEN ? 'max' : 'dry-run', pending: pending.rows[0].count });
});

const webhookSchema = z.object({
  update_type: z.string(),
  user: z.object({ user_id: z.number() }).optional(),
  chat_id: z.number().optional(),
  payload: z.string().nullable().optional()
});

app.post('/webhook', async (req, res) => {
  const event = webhookSchema.parse(req.body);
  if (event.update_type === 'bot_started' && event.user?.user_id) {
    await deliver({
      maxUserId: String(event.user.user_id),
      text: 'Добро пожаловать в ТехЗаказ. Опишите задачу или заполните короткую заявку на технику с экипажем.',
      deepLinkPayload: null
    }, { token: env.MAX_BOT_TOKEN, publicAppUrl: env.PUBLIC_APP_URL });
  }
  res.status(200).json({ ok: true });
});

let processing = false;
async function processOutbox(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const claimed = await pool.query(
      `WITH next AS (
         SELECT id FROM notifications WHERE status='PENDING' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE notifications n SET status='PROCESSING', attempts=attempts+1
       FROM next, users u WHERE n.id=next.id AND u.id=n.recipient_user_id
       RETURNING n.*, u.max_user_id`
    );
    const notification = claimed.rows[0];
    if (!notification) return;
    try {
      const result = await deliver({
        maxUserId: notification.max_user_id ? String(notification.max_user_id) : null,
        text: notification.text,
        deepLinkPayload: notification.deep_link_payload
      }, { token: env.MAX_BOT_TOKEN, publicAppUrl: env.PUBLIC_APP_URL });
      await pool.query(
        `UPDATE notifications SET status=$1, delivered_at=now(), last_error=NULL WHERE id=$2`,
        [result.mode === 'MAX' ? 'DELIVERED_MAX' : 'DELIVERED_DRY_RUN', notification.id]
      );
    } catch (error) {
      const retry = notification.attempts < 3;
      await pool.query(
        `UPDATE notifications SET status=$1, last_error=$2 WHERE id=$3`,
        [retry ? 'PENDING' : 'FAILED', error instanceof Error ? error.message.slice(0, 500) : 'delivery failed', notification.id]
      );
    }
  } finally {
    processing = false;
  }
}

const timer = setInterval(() => void processOutbox(), 750);
const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`bot adapter listening on ${env.PORT}; mode=${env.MAX_BOT_TOKEN ? 'max' : 'dry-run'}`);
});

async function shutdown(): Promise<void> {
  clearInterval(timer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

