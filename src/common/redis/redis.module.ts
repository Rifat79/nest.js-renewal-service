import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';
import { RedisService } from './redis.service';

// Type definition for Redis configuration properties for better type safety
interface RedisConfig {
  host: string;
  port: number;
  password?: string; // Password can be undefined
  db: number;
  keyPrefix: string;
  tlsEnabled: boolean;
}

interface TLS {
  rejectUnauthorized: boolean;
  // You might add other properties from Node.js 'tls' module like 'ca', 'key', 'cert' if needed
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): RedisClient => {
        // Helper function to extract and type-check Redis config
        const getRedisConfig = (): RedisConfig => ({
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db', 0),
          keyPrefix: configService.get<string>(
            'redis.keyPrefix',
            'dcb_billing:',
          ),
          // Ensure tlsEnabled is strictly a boolean
          tlsEnabled: configService.get<string>('redis.tlsEnabled') === 'true',
        });

        const config = getRedisConfig();

        // Define TLS options separately for type clarity
        const tlsOptions: { tls?: TLS } = config.tlsEnabled
          ? {
              tls: {
                rejectUnauthorized: true,
              },
            }
          : {};

        const redisOptions: RedisOptions = {
          host: config.host,
          port: config.port,
          password: config.password,
          db: config.db,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number): number => {
            // TypeScript issue fixed by ensuring the return type is number
            return Math.min(times * 50, 2000);
          },
          enableReadyCheck: true,
          enableOfflineQueue: false,
          connectTimeout: 10_000,
          keepAlive: 30_000,
          family: 4,
          lazyConnect: false,
          connectionName: 'dcb-billing--main',
          ...tlsOptions, // Spread the typed TLS options
        };

        const redis: RedisClient = new Redis(redisOptions);

        // Type the error parameter explicitly as Error or unknown
        redis.on('error', (err: Error) => {
          console.error('Redis Client Error:', err);
        });

        redis.on('connect', () => {
          console.log('Redis Client Connected');
        });

        redis.on('ready', () => {
          console.log('Redis Client Ready');
        });

        return redis;
      },
      inject: [ConfigService],
    },
    {
      provide: REDIS_SUBSCRIBER,
      useFactory: (configService: ConfigService): RedisClient => {
        const password = configService.get<string>('redis.password');

        // Subscriber client options - generally simpler, but still needs correct types
        const subscriberOptions: RedisOptions = {
          host: configService.get<string>('redis.host', 'localhost'),
          port: configService.get<number>('redis.port', 6379),
          password: password, // Use the typed password variable
          db: configService.get<number>('redis.db', 0),
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number): number => Math.min(times * 50, 2000),
          connectionName: 'dcb-billing-subscriber',
        };

        return new Redis(subscriberOptions);
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, REDIS_SUBSCRIBER, RedisService],
})
export class RedisModule {}
