import pg from 'pg';

export default async function globalSetup(): Promise<void> {
  const pool = new pg.Pool({
    connectionString: process.env.E2E_DATABASE_URL ?? 'postgres://techzakaz:techzakaz_local@localhost:5434/techzakaz'
  });
  await pool.query('TRUNCATE reviews, callback_requests, notifications, order_events, orders, supplier_applications, request_drafts RESTART IDENTITY CASCADE');
  await pool.end();
}
