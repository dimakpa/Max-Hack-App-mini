import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export interface MaxBotUser {
  userId: number;
  firstName?: string;
  lastName?: string;
  username?: string;
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim().slice(0, 120);
  return trimmed || null;
}

export function maxBotDisplayName(user: MaxBotUser): string {
  const name = [optionalText(user.firstName), optionalText(user.lastName)].filter(Boolean).join(' ');
  return name || optionalText(user.username) || 'Пользователь MAX';
}

export async function registerMaxBotUser(pool: Pick<pg.Pool, 'query'>, user: MaxBotUser): Promise<void> {
  const firstName = optionalText(user.firstName);
  const lastName = optionalText(user.lastName);
  const username = optionalText(user.username);
  await pool.query(
    `INSERT INTO users(id, max_user_id, max_first_name, max_last_name, max_username, display_name, role)
     VALUES ($1,$2,$3,$4,$5,$6,'CUSTOMER')
     ON CONFLICT (max_user_id) DO UPDATE SET
       max_first_name=COALESCE(EXCLUDED.max_first_name, users.max_first_name),
       max_last_name=COALESCE(EXCLUDED.max_last_name, users.max_last_name),
       max_username=COALESCE(EXCLUDED.max_username, users.max_username),
       display_name=CASE
         WHEN EXCLUDED.max_first_name IS NOT NULL OR EXCLUDED.max_username IS NOT NULL THEN EXCLUDED.display_name
         ELSE users.display_name
       END`,
    [randomUUID(), user.userId, firstName, lastName, username, maxBotDisplayName(user)]
  );
}
