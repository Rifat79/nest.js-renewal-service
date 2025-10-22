import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('app', () => {
  return {
    nodeEnv: validatedEnv.NODE_ENV,
    port: validatedEnv.PORT,
    corsOrigin: validatedEnv.CORS_ORIGIN,
    serviceName: validatedEnv.SERVICE_NAME,
  };
});
