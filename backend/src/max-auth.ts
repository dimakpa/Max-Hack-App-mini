import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

export interface MaxLaunchUser {
  id: number;
  first_name: string;
  last_name?: string;
}

export function validateMaxInitData(initData: string, botToken: string, now = Date.now()): MaxLaunchUser {
  if (!botToken) throw new ApiError(503, 'MAX_AUTH_NOT_CONFIGURED', 'MAX-аутентификация не настроена');
  const rawPairs = initData.split('&').map((pair) => {
    const separator = pair.indexOf('=');
    if (separator < 1) throw new ApiError(401, 'INVALID_MAX_DATA', 'Некорректные данные запуска MAX');
    return [pair.slice(0, separator), pair.slice(separator + 1)] as const;
  });

  const keys = rawPairs.map(([key]) => key);
  if (new Set(keys).size !== keys.length || keys.filter((key) => key === 'hash').length !== 1) {
    throw new ApiError(401, 'INVALID_MAX_DATA', 'Параметры запуска MAX повторяются');
  }

  const decoded = rawPairs.map(([key, value]) => [key, decodeURIComponent(value)] as const);
  const originalHash = decoded.find(([key]) => key === 'hash')?.[1];
  if (!originalHash || !/^[a-f0-9]{64}$/i.test(originalHash)) {
    throw new ApiError(401, 'INVALID_MAX_DATA', 'Подпись MAX отсутствует');
  }

  const launchParams = decoded
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', secret).update(launchParams).digest('hex');
  const left = Buffer.from(calculated, 'hex');
  const right = Buffer.from(originalHash, 'hex');
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ApiError(401, 'INVALID_MAX_SIGNATURE', 'Подпись запуска MAX не прошла проверку');
  }

  const params = Object.fromEntries(decoded);
  const authDate = Number(params.auth_date);
  if (!Number.isFinite(authDate) || authDate * 1000 > now + 5 * 60_000 || now - authDate * 1000 > 60 * 60_000) {
    throw new ApiError(401, 'EXPIRED_MAX_DATA', 'Данные запуска MAX устарели');
  }
  try {
    const user = JSON.parse(params.user ?? '') as MaxLaunchUser;
    if (!Number.isSafeInteger(user.id) || !user.first_name) throw new Error('invalid user');
    return user;
  } catch {
    throw new ApiError(401, 'INVALID_MAX_USER', 'В данных запуска MAX нет корректного пользователя');
  }
}

