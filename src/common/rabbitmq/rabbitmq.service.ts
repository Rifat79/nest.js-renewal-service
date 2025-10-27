import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class RabbitMQProducerService implements OnModuleInit, OnModuleDestroy {
  private connection: amqp.Connection;
  private channel: amqp.Channel;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 5000;
  private isConnecting = false;

  constructor(
    private configService: ConfigService,
    private logger: PinoLogger,
  ) {
    this.logger.setContext(RabbitMQProducerService.name);
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      const url = this.configService.get<string>('rmq.url');

      this.connection = await amqp.connect(url, {
        heartbeat: 60,
      });

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error:', err);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.logger.warn(
          'RabbitMQ connection closed. Attempting to reconnect...',
        );
        this.handleConnectionError();
      });

      this.channel = await this.connection.createConfirmChannel();

      this.channel.on('error', (err) => {
        this.logger.error('RabbitMQ channel error:', err);
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
      });

      await this.setupQueuesAndExchanges();

      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.logger.info('Successfully connected to RabbitMQ');
    } catch (error) {
      this.isConnecting = false;
      this.logger.error({ error }, 'Failed to connect to RabbitMQ');
      await this.handleConnectionError();
    }
  }

  private async handleConnectionError() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.logger.info(
        `Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
      );

      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      this.logger.error(
        'Max reconnection attempts reached. Manual intervention required.',
      );
    }
  }

  private async setupQueuesAndExchanges() {
    const notificationsQueue = this.configService.get<string>(
      'rmq.queues.notifications',
    );
    const notificationsDlq = this.configService.get<string>(
      'rmq.queues.notificationsDlq',
    );
    const notificationsExchange = this.configService.get<string>(
      'rmq.exchanges.notifications',
    );
    const notificationsDlqExchange = this.configService.get<string>(
      'rmq.exchanges.notificationsDlq',
    );
    const notificationRoutingKey = this.configService.get<string>(
      'rmq.routingKeys.notification',
    );
    const notificationDlqRoutingKey = this.configService.get<string>(
      'rmq.routingKeys.notificationDlq',
    );

    // Create DLQ exchange
    await this.channel.assertExchange(notificationsDlqExchange, 'topic', {
      durable: true,
    });

    // Create DLQ
    await this.channel.assertQueue(notificationsDlq, {
      durable: true,
      arguments: {
        'x-message-ttl': 86400000, // 24 hours
        'x-max-length': 10000, // Max 10k messages in DLQ
      },
    });

    await this.channel.bindQueue(
      notificationsDlq,
      notificationsDlqExchange,
      notificationDlqRoutingKey,
    );

    // Create main exchange
    await this.channel.assertExchange(notificationsExchange, 'topic', {
      durable: true,
    });

    // Create main queue with DLQ configuration
    await this.channel.assertQueue(notificationsQueue, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': notificationsDlqExchange,
        'x-dead-letter-routing-key': notificationDlqRoutingKey,
        'x-max-length': 1_000_000, // Max queue length
        'x-overflow': 'reject-publish', // Reject new messages if queue is full
      },
    });

    await this.channel.bindQueue(
      notificationsQueue,
      notificationsExchange,
      notificationRoutingKey,
    );

    this.logger.info('RabbitMQ queues and exchanges set up successfully');
  }

  async publishMessage(message: any, retryCount = 0): Promise<boolean> {
    const maxRetries = this.configService.get<number>('rmq.retryAttempts', 3);

    if (!this.channel) {
      this.logger.error('Channel is not available');

      if (retryCount < maxRetries) {
        this.logger.info(`Retry attempt ${retryCount + 1}/${maxRetries}`);
        await this.delay(
          this.configService.get<number>('rmq.retryDelay', 5000),
        );
        return this.publishMessage(message, retryCount + 1);
      }

      throw new Error(
        'Failed to publish message: Channel unavailable after retries',
      );
    }

    try {
      const notificationsExchange = this.configService.get<string>(
        'rmq.exchanges.notifications',
      );
      const notificationRoutingKey = this.configService.get<string>(
        'rmq.routingKeys.notification',
      );

      const messageBuffer = Buffer.from(JSON.stringify(message));

      return new Promise((resolve, reject) => {
        this.channel.publish(
          notificationsExchange,
          notificationRoutingKey,
          messageBuffer,
          {
            persistent: true,
            contentType: 'application/json',
            timestamp: Date.now(),
            messageId: message.id,
            headers: {
              'x-retry-count': retryCount,
              'x-original-timestamp': message.timestamp || Date.now(),
              'x-source': 'renewal-service',
            },
          },
          (err) => {
            if (err) {
              this.logger.error('Failed to publish message:', err);
              reject(err);
            } else {
              this.logger.info(`Message published successfully: ${message.id}`);
              resolve(true);
            }
          },
        );
      });
    } catch (error) {
      this.logger.error('Error publishing message:', error);

      if (retryCount < maxRetries) {
        this.logger.info(`Retry attempt ${retryCount + 1}/${maxRetries}`);
        await this.delay(
          this.configService.get<number>('rmq.retryDelay', 5000),
        );
        return this.publishMessage(message, retryCount + 1);
      }

      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async disconnect() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.info('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ:', error);
    }
  }

  isConnected(): boolean {
    return !!this.connection && !!this.channel;
  }

  async healthCheck(): Promise<{
    connected: boolean;
    reconnectAttempts: number;
  }> {
    return {
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}
