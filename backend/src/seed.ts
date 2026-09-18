import { pool } from './db.js';
import { readSqlFiles } from './sql-files.js';

async function seed(): Promise<void> {
  for (const file of readSqlFiles('seeds')) await pool.query(file.sql);
}

seed().finally(() => pool.end());

