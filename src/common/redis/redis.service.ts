import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { REDIS_CLIENT } from './redis.constants';

// Define the expected return types for the rate limit pipeline for explicit safety
// [zremrangebyscore, zadd, zcard, expire]
type RateLimitPipelineResult = [
  [Error | null, number],
  [Error | null, number],
  [Error | null, number], // ZCARD result
  [Error | null, 0 | 1],
];

@Injectable()
export class RedisService implements OnModuleDestroy {
  // Use a dedicated Logger instance for robust logging
  private readonly logger: PinoLogger;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly pinoLoggerInstance: PinoLogger, // Renaming argument for clarity
  ) {
    // FIX: Removed the .child() call, which caused the TS error.
    // The injected PinoLogger instance is now assigned directly. NestJS/Pino
    // will typically handle setting the context (RedisService.name) automatically.
    this.logger = this.pinoLoggerInstance;
  }

  async onModuleDestroy() {
    try {
      this.logger.info('Shutting down Redis client connection...');
      await this.redis.quit();
    } catch (error) {
      this.logger.error(
        { error: String(error) },
        'Error while redis shut down',
      );
    }
  }

  // ============================================
  // CACHING METHODS (Strongly Typed)
  // ============================================

  /**
   * Retrieves a JSON object from Redis and deserializes it.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(
        { error, key },
        'Failed to get or parse value from Redis.',
      );
      return null;
    }
  }

  /**
   * Serializes and sets a value in Redis.
   * @param ttl Time-to-live in seconds.
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    try {
      if (ttl) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      this.logger.error({ error, key }, 'Failed to set value in Redis.');
    }
  }

  /**
   * Deletes a key from Redis.
   */
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Deletes all keys matching a pattern (use with caution in production).
   */
  async delPattern(pattern: string): Promise<void> {
    // Production note: Using KEYS is blocking. For high load, use SCAN.
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      try {
        await this.redis.del(...keys);
      } catch (error) {
        this.logger.error(
          { error, pattern, keys },
          'Failed to delete keys using pattern.',
        );
      }
    }
  }

  // ============================================
  // DISTRIBUTED LOCKING (Atomic)
  // ============================================

  /**
   * Tries to acquire a lock using SET NX EX.
   */
  async acquireLock(
    lockKey: string,
    ttl: number = 30,
    retries: number = 3,
  ): Promise<boolean> {
    // Production note: Using a UUID for the token is better practice.
    const token = Math.random().toString(36).substring(7);

    for (let i = 0; i < retries; i++) {
      try {
        // Atomic operation: Set only if the key does not exist, with an expiration.
        const result = await this.redis.set(lockKey, token, 'EX', ttl, 'NX');

        if (result === 'OK') {
          this.logger.debug({ lockKey, token }, 'Acquired lock successfully.');
          return true;
        }

        // Wait with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
      } catch (error) {
        this.logger.error({ error, lockKey }, 'Error acquiring lock.');
        return false;
      }
    }

    return false;
  }

  /**
   * Releases a lock (simple DEL for this example, Lua script recommended for token check).
   */
  async releaseLock(lockKey: string): Promise<void> {
    try {
      await this.redis.del(lockKey);
      this.logger.debug({ lockKey }, 'Released lock.');
    } catch (error) {
      this.logger.error({ error, lockKey }, 'Error releasing lock.');
    }
  }

  // ============================================
  // RATE LIMITING (Null-Safe Pipeline)
  // ============================================

  /**
   * Checks the rate limit using a ZSET and a Redis pipeline for atomicity.
   */
  async checkRateLimit(
    key: string,
    limit: number,
    window: number, // in seconds
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const windowStart = now - window * 1000;

    const pipeline = this.redis.pipeline();
    // 1. Remove old requests (score < windowStart)
    pipeline.zremrangebyscore(key, 0, windowStart);
    // 2. Add current request (score=now, member=unique)
    pipeline.zadd(
      key,
      now,
      `${now}-${Math.random().toString(36).substring(2)}`,
    );
    // 3. Count total elements in the ZSET (the current count)
    pipeline.zcard(key);
    // 4. Set/Reset the TTL for the whole key
    pipeline.expire(key, window);

    // FIX: Await the execution and cast to the known result type (or null on failure)
    const results = (await pipeline.exec()) as RateLimitPipelineResult | null;

    // FIX: Explicitly check for null results (connection failure)
    if (results === null) {
      this.logger.error(
        { key },
        'Redis pipeline execution failed (null results). Connection down?',
      );
      // Default to disallowed for safety
      return { allowed: false, remaining: 0 };
    }

    // FIX: Safely access the ZCARD result (index 2, result value at index 1 of the tuple)
    const [err, count] = results[2];

    if (err) {
      this.logger.error(
        { err, key },
        'Redis ZCARD command failed in rate limit pipeline.',
      );
      // Default to disallowed for safety
      return { allowed: false, remaining: 0 };
    }

    // The count is safely retrieved as a number via the PipelineResult type

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
    };
  }

  // ============================================
  // IDEMPOTENCY
  // ============================================

  async isOperationProcessed(idempotencyKey: string): Promise<boolean> {
    const exists = await this.redis.exists(`idempotency:${idempotencyKey}`);
    return exists === 1;
  }

  async markOperationProcessed(
    idempotencyKey: string,
    result: unknown, // Use unknown
    ttl: number = 86400,
  ): Promise<void> {
    await this.redis.setex(
      `idempotency:${idempotencyKey}`,
      ttl,
      JSON.stringify(result),
    );
  }

  async getOperationResult<T>(idempotencyKey: string): Promise<T | null> {
    return this.get<T>(`idempotency:${idempotencyKey}`);
  }

  /**
   * Appends one or more values to the end of a Redis list.
   * Useful for task queues, logs, etc.
   */
  async rpush(key: string, ...values: string[]): Promise<number | null> {
    try {
      const result = await this.redis.rpush(key, ...values);
      this.logger.debug(
        { key, values, result },
        'Values pushed to Redis list.',
      );
      return result; // Returns new length of the list
    } catch (error) {
      this.logger.error(
        { error, key, values },
        'Failed to push values to Redis list.',
      );
      return null;
    }
  }

  /**
   * Removes and returns the first element of a Redis list.
   * Useful for consuming items from the head of a queue.
   */
  async lpop(key: string): Promise<string | null> {
    try {
      const result = await this.redis.lpop(key);
      this.logger.debug({ key, result }, 'Value popped from Redis list.');
      return result; // Returns the popped value, or null if list is empty
    } catch (error) {
      this.logger.error({ error, key }, 'Failed to pop value from Redis list.');
      return null;
    }
  }

  /**
   * Returns all keys matching a pattern.
   * In production, prefer SCAN over KEYS for performance on large datasets.
   */
  async getKeys(pattern: string): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      this.logger.error({ error, pattern }, 'Failed to get keys from Redis.');
      return [];
    }
  }
}
