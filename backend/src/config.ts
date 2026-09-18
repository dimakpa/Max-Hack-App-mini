import { z } from 'zod';

const booleanString = z.string().optional().transform((value) => value === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url().default('postgres://techzakaz:techzakaz_local@localhost:5434/techzakaz'),
  DEMO_AUTH: booleanString,
  FRONTEND_ORIGIN: z.string().default('http://localhost:8080'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  MAX_BOT_TOKEN: z.string().optional().default(''),
  AI_PROVIDER: z.enum(['mock', 'ollama']).default('mock'),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('qwen3:4b')
});

export type AppConfig = z.infer<typeof schema>;
export const config = schema.parse(process.env);
