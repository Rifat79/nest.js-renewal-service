import { registerAs } from '@nestjs/config';
import { validatedEnv } from './validate-env';

export default registerAs('rmq', () => {
  return {
    host: validatedEnv.RMQ_HOST,
    port: validatedEnv.RMQ_PORT,
    user: validatedEnv.RMQ_USER,
    password: validatedEnv.RMQ_PASS,
    queues: {
      notifications: 'notifications.renewal.queue',
      notificationsDlq: 'notifications.renewal.dlq',
    },
    exchanges: {
      notifications: 'notifications.renewal.exchange',
      notificationsDlq: 'notifications.renewal.dlq.exchange',
    },
    routingKeys: {
      notification: 'notifications.renewal.send',
      notificationDlq: 'notifications.renewal.dlq',
    },
    retryAttempts: 3,
    retryDelay: 5000,

    get url() {
      const user = encodeURIComponent(this.user); // Encode username
      const password = encodeURIComponent(this.password); // Encode password
      return `amqp://${user}:${password}@${this.host}:${this.port}`;
    },
  };
});
