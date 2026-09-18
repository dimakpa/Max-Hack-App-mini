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
    const result = await pool.query('SELECT * FROM users WHERE max_user_id = $1', [launchUser.id]);
    if (!result.rows[0]) throw new ApiError(403, 'USER_NOT_REGISTERED', 'Пользователь MAX не зарегистрирован в пилоте');
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

