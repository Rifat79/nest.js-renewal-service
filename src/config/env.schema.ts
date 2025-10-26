import { z } from 'zod';

export const envSchema = z.object({
  // app
  NODE_ENV: z.enum(['development', 'production', 'test', 'staging']),
  PORT: z.coerce.number().int().positive(),
  CORS_ORIGIN: z.string().optional().default('*'),
  SERVICE_NAME: z.string().default('billing-service'),

  // Database
  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL must be a valid URL' })
    .refine((url) => url.startsWith('postgres://'), {
      message: 'DATABASE_URL must start with "postgres://"',
    }),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive(),
  DB_POOL_TIMEOUT: z.coerce.number().int().positive(),
  DB_CONNECT_TIMEOUT: z.coerce.number().int().positive(),

  // redis
  REDIS_HOST: z.string().min(1, 'REDIS_HOST cannot be empty'),
  REDIS_PORT: z.coerce.number().int().positive(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().optional(),
  REDIS_KEY_PREFIX: z.string().optional().default('cache:'),
  CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .default(300000), // 5 minutes

  // RabbitMQ
  RMQ_HOST: z.string().min(1),
  RMQ_PORT: z.coerce.number().int().positive(),
  RMQ_USER: z.string().min(1),
  RMQ_PASS: z.string().min(1),

  // log
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional()
    .default('info'),
});

export type EnvVars = z.infer<typeof envSchema>;
