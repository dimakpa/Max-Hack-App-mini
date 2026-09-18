import { pool } from './db.js';
import { readSqlFiles } from './sql-files.js';

async function migrate(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name varchar(255) PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const file of readSqlFiles('migrations')) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file.name]);
    if (applied.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(file.sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file.name]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

migrate().finally(() => pool.end());

