import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { ApiError } from './errors.js';
import { validateMaxInitData } from './max-auth.js';
import type { AuthUser } from './types.js';

function mapUser(row: Record<string, unknown>): AuthUser {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    role: row.role as AuthUser['role'],
    supplierId: row.supplier_id ? String(row.supplier_id) : null,
    demoAlias: row.demo_alias ? String(row.demo_alias) : null
  };
}

function maxProfile(launchUser: ReturnType<typeof validateMaxInitData>) {
  const firstName = launchUser.first_name.trim().slice(0, 120);
  const lastName = launchUser.last_name?.trim().slice(0, 120) || null;
  const username = launchUser.username?.trim().slice(0, 120) || null;
  return {
    firstName,
    lastName,
    username,
    displayName: [firstName, lastName].filter(Boolean).join(' ').slice(0, 120)
  };
}

async function findOrRegisterMaxUser(launchUser: ReturnType<typeof validateMaxInitData>) {
  const profile = maxProfile(launchUser);
  return pool.query(
    `INSERT INTO users(id, max_user_id, max_first_name, max_last_name, max_username, display_name, role)
     VALUES ($1,$2,$3,$4,$5,$6,'CUSTOMER')
     ON CONFLICT (max_user_id) DO UPDATE SET
       max_first_name=EXCLUDED.max_first_name,
       max_last_name=EXCLUDED.max_last_name,
       max_username=EXCLUDED.max_username,
       display_name=EXCLUDED.display_name
     RETURNING *`,
    [randomUUID(), launchUser.id, profile.firstName, profile.lastName, profile.username, profile.displayName]
  );
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const demoAlias = req.header('x-demo-user');
    if (demoAlias) {
      if (!config.DEMO_AUTH) throw new ApiError(401, 'DEMO_AUTH_DISABLED', 'Демонстрационный вход отключён');
      const result = await pool.query('SELECT * FROM users WHERE demo_alias = $1', [demoAlias]);
      if (!result.rows[0]) throw new ApiError(401, 'UNKNOWN_DEMO_USER', 'Неизвестная тестовая роль');
      req.authUser = mapUser(result.rows[0]);
      next();
      return;
    }

    const initData = req.header('x-max-init-data');
    if (!initData) throw new ApiError(401, 'AUTH_REQUIRED', 'Откройте приложение в MAX или выберите тестовую роль');
    const launchUser = validateMaxInitData(initData, config.MAX_BOT_TOKEN);
    const result = await findOrRegisterMaxUser(launchUser);
    req.authUser = mapUser(result.rows[0]);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: AuthUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      next(new ApiError(403, 'FORBIDDEN', 'Недостаточно прав для действия'));
      return;
    }
    next();
  };
}
