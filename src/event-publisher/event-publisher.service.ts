import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { RabbitMQProducerService } from 'src/common/rabbitmq/rabbitmq.service';
import { RedisService } from 'src/common/redis/redis.service';

export interface NotificationPayload {
  id: string;
  source: 'dcb-renewal-service';
  subscriptionId: string;
  merchantTransactionId: string;
  keyword: string;
  msisdn: string;
  paymentProvider: string; // 'ROBI' | 'GP';
  eventType:
    | 'renew.success'
    | 'renew.fail'
    | 'subscription.success'
    | 'subscription.fail'
    | 'subscription.cancel'
    | 'subscription.suspend'
    | 'pre.renewal.alert'
    | 'test';
  amount: number;
  currency: string;
  billingCycleDays: number;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface FallbackMessage extends NotificationPayload {
  failedAt: number;
  retryCount: number;
}

@Injectable()
export class EventPublisherService {
  private fallbackStorage: Map<string, FallbackMessage> = new Map();
  private readonly maxFallbackRetries = 5;

  constructor(
    private readonly rabbitmqService: RabbitMQProducerService,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
  ) {
    this.logger.setContext(EventPublisherService.name);
  }

  async sendRenewalNotification(
    payload: NotificationPayload,
  ): Promise<{ success: boolean; message: string }> {
    const id = crypto.randomUUID();
    return await this.sendNotification({ ...payload, id });
  }

  async sendNotification(
    notification: NotificationPayload,
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.rabbitmqService.isConnected()) {
        this.logger.warn(
          `RabbitMQ is not connected. Storing message ${notification.id} in fallback storage.`,
        );
        this.storeFallback(notification);
        return {
          success: false,
          message: 'Message stored in fallback storage. Will retry later.',
        };
      }

      await this.rabbitmqService.publishMessage(notification);

      this.logger.info(`Notification queued successfully: ${notification.id}`);
      return {
        success: true,
        message: 'Notification queued successfully',
      };
    } catch (error) {
      this.logger.error(
        `Failed to send notification: ${notification.id}`,
        error,
      );
      this.storeFallback(notification);
      return {
        success: false,
        message: 'Failed to send notification. Stored in fallback storage.',
      };
    }
  }

  /**
   * Sends a batch of renewal notifications efficiently with concurrency control.
   * Falls back to Redis storage when RabbitMQ is unavailable or an error occurs.
   */
  async sendNotificationsBatch(messages: NotificationPayload[]): Promise<void> {
    if (!messages.length) return;

    this.logger.info(`Sending ${messages.length} renewal notifications...`);

    try {
      const isConnected = this.rabbitmqService.isConnected();

      if (!isConnected) {
        this.logger.warn(
          'RabbitMQ not connected, storing all notifications in Redis fallback...',
        );
        await Promise.all(messages.map((msg) => this.storeFallback(msg)));
        return;
      }

      // Limit concurrency to avoid overwhelming RabbitMQ
      const concurrency = 10;
      const chunks = this.chunkArray(messages, concurrency);

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (msg) => {
            try {
              await this.sendNotification(msg);
            } catch (err) {
              this.logger.error(
                { err, id: msg.id },
                'Failed to send notification, storing in fallback...',
              );
              await this.storeFallback(msg);
            }
          }),
        );
      }

      this.logger.info(
        `✅ All ${messages.length} notifications processed successfully.`,
      );
    } catch (err) {
      this.logger.error(
        { err },
        'Unexpected error while sending batch notifications',
      );
    }
  }

  /**
   * Helper: Splits an array into smaller chunks for concurrency control.
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  }

  private async storeFallback(
    notification: NotificationPayload,
  ): Promise<void> {
    const redisKey = `notification:fallback:${notification.id}`;

    // Get existing message from Redis (returns object directly)
    const existingMessage = await this.redis.get<FallbackMessage>(redisKey);
    const retryCount = existingMessage?.retryCount || 0;

    const fallbackMessage: FallbackMessage = {
      ...notification,
      failedAt: Date.now(),
      retryCount,
    };

    // Store object directly (your helper handles serialization)
    await this.redis.set(redisKey, fallbackMessage);

    this.logger.info(
      `Notification stored in fallback (Redis): ${notification.id}`,
    );
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processFallbackStorage(): Promise<void> {
    // Get all fallback keys from Redis
    const keys = await this.redis.getKeys('notification:fallback:*');

    if (keys.length === 0) {
      return;
    }

    this.logger.info(
      `Processing ${keys.length} fallback notifications from Redis`,
    );

    for (const key of keys) {
      try {
        const message = await this.redis.get<FallbackMessage>(key);
        if (!message) continue;

        if (!this.rabbitmqService.isConnected()) {
          this.logger.warn(
            'RabbitMQ still not connected. Skipping fallback processing.',
          );
          break; // Stop processing if RabbitMQ is down
        }

        if (message.retryCount >= this.maxFallbackRetries) {
          this.logger.error(
            `Max retries reached for message: ${message.id}. Moving to permanent failure storage.`,
          );
          // In production: move to permanent storage / alert ops
          await this.redis.del(key);
          continue;
        }

        // Try to publish
        await this.rabbitmqService.publishMessage(message);
        await this.redis.del(key);
        this.logger.info(`Fallback notification sent: ${message.id}`);
      } catch (error) {
        this.logger.error(
          `Failed to send fallback notification for key: ${key}`,
          error,
        );

        // Increment retry count and update Redis
        const message = await this.redis.get<FallbackMessage>(key);
        if (message) {
          message.retryCount++;
          await this.redis.set(key, message);
        }
      }
    }

    // Check remaining messages in fallback
    const remainingKeys = await this.redis.getKeys('notification:fallback:*');
    if (remainingKeys.length > 0) {
      this.logger.warn(
        `${remainingKeys.length} notifications remain in fallback storage`,
      );
    }
  }

  getFallbackStorageCount(): number {
    return this.fallbackStorage.size;
  }

  getFallbackMessages(): FallbackMessage[] {
    return Array.from(this.fallbackStorage.values());
  }

  clearFallbackStorage(): void {
    this.fallbackStorage.clear();
    this.logger.info('Fallback storage cleared');
  }

  async retryFailedMessage(
    messageId: string,
  ): Promise<{ success: boolean; message: string }> {
    const failedMessage = this.fallbackStorage.get(messageId);

    if (!failedMessage) {
      return {
        success: false,
        message: 'Message not found in fallback storage',
      };
    }

    try {
      await this.rabbitmqService.publishMessage(failedMessage);
      this.fallbackStorage.delete(messageId);
      return {
        success: true,
        message: 'Message retried successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to retry message',
      };
    }
  }
}
