export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export function assertFound<T>(value: T | null | undefined, message = 'Объект не найден'): T {
  if (value === null || value === undefined) throw new ApiError(404, 'NOT_FOUND', message);
  return value;
}

