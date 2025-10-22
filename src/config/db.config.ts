import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('db', () => {
  return {
    url: validatedEnv.DATABASE_URL,
    connectionLimit: validatedEnv.DB_CONNECTION_LIMIT,
    connectionTimeout: validatedEnv.DB_CONNECT_TIMEOUT,
    poolTimeout: validatedEnv.DB_POOL_TIMEOUT,
  };
});
