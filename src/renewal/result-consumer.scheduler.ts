import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { RedisService } from 'src/common/redis/redis.service';
import {
  BillingEventRepository,
  BillingEventsCreateManyInput,
} from 'src/database/billing-event.repository';
import {
  SubscriptionBulkUpdate,
  SubscriptionRepository,
} from 'src/database/subscription.repository';
import {
  EventPublisherService,
  NotificationPayload,
} from 'src/event-publisher/event-publisher.service';
import { ChargeResult } from './renewal.service';

export const RESULTS_REDIS_KEY = 'renewal_status_report';
const MAX_BATCH_SIZE = 250;

@Injectable()
export class ResultConsumerScheduler {
  constructor(
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly billingEventRepo: BillingEventRepository,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  /**
   * CRON Job: Runs every 10 seconds to process pending renewal results.
   */
  @Cron(CronExpression.EVERY_10_SECONDS, {
    name: 'result_queue_consumer',
  })
  async handleResultQueue() {
    this.logger.info(
      `[START] Running result queue consumer. Checking ${RESULTS_REDIS_KEY}.`,
    );

    const batch: ChargeResult[] = [];
    const collectedResults: string[] = [];

    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      const serializedResult = await this.redis.lpop(RESULTS_REDIS_KEY);

      if (!serializedResult) {
        break; // List is empty, exit loop
      }
      collectedResults.push(serializedResult);
    }

    if (collectedResults.length === 0) {
      this.logger.warn({ msg: 'No new results to process.' });
      return;
    }

    for (const serializedResult of collectedResults) {
      try {
        const result: ChargeResult = JSON.parse(serializedResult);
        batch.push(result);
      } catch (error) {
        this.logger.error({
          msg: 'Failed to parse charging result JSON.',
          error: error.message,
          raw_data: serializedResult,
        });
      }
    }

    this.logger.info({
      msg: `Consumed and parsed ${batch.length} valid results.`,
      totalConsumed: collectedResults.length,
    });

    try {
      await this.processResultsBatch(batch);
      this.logger.info({
        msg: 'Successfully processed results batch.',
        count: batch.length,
      });
    } catch (error) {
      this.logger.error({
        msg: 'Error processing results batch.',
        error: error.message,
        batch_count: batch.length,
      });
      // Important: If processing fails (e.g., database is down), you need a recovery
      // mechanism, such as re-pushing the batch to the Redis list (LPUSH)
      // or saving them to a temporary error queue.
    }
  }

  /**
   * Placeholder for the actual business logic (e.g., updating database, sending notifications).
   * @param results An array of successfully parsed ChargeResult objects.
   */
  private async processResultsBatch(results: ChargeResult[]): Promise<void> {
    const subscriptionUpdateInputs: SubscriptionBulkUpdate[] = [];
    const billingEventsCreateManyInputs: BillingEventsCreateManyInput[] = [];
    const notificationMessages: NotificationPayload[] = [];

    for (const result of results) {
      const {
        responseDuration,
        requestPayload,
        responsePayload,
        httpStatus,
        subscriptionId,
        data,
        success,
        error,
        message,
        paymentReferenceId,
      } = result;
      const {
        payment_channels,
        merchant_transaction_id,
        msisdn,
        products,
        product_plans,
        plan_pricing,
        merchants,
      } = data;

      const billingCycleDays = product_plans.billing_cycle_days;
      const now = new Date();

      const nextBillingAt = new Date(
        now.getTime() + billingCycleDays * 24 * 60 * 60 * 1000,
      );

      const subscriptionUpdateInput = {
        subscriptionId,
        success,
        nextBillingAt,
      };
      subscriptionUpdateInputs.push(subscriptionUpdateInput);

      const billingEventCreateSingleInput: BillingEventsCreateManyInput = {
        subscription_id: subscriptionId,
        merchant_id: merchants.id,
        product_id: products.id,
        plan_id: product_plans.id,
        payment_channel_id: payment_channels.id,
        msisdn: msisdn,
        payment_reference_id: paymentReferenceId,
        event_type: 'RENEWAL',
        status: success ? 'SUCCESS' : 'FAILED',
        amount: plan_pricing?.base_amount.toNumber() ?? 0,
        currency: plan_pricing?.currency ?? 'BDT',
        request_payload: { requestPayload },
        response_payload: { responsePayload },
        response_message: message,
        duration: responseDuration,
        response_code: httpStatus.toString(),
      };
      billingEventsCreateManyInputs.push(billingEventCreateSingleInput);
      notificationMessages.push({
        id: crypto.randomUUID(),
        source: 'dcb-renewal-service',
        subscriptionId,
        merchantTransactionId: merchant_transaction_id,
        keyword: products.name,
        msisdn,
        paymentProvider: payment_channels.code,
        amount: plan_pricing?.base_amount.toNumber() ?? 0,
        currency: plan_pricing?.currency ?? 'BDT',
        billingCycleDays: product_plans.billing_cycle_days,
        eventType: success ? 'renew.success' : 'renew.fail',
        timestamp: Date.now(),
      });
    }

    await this.subscriptionRepo.bulkUpdateStatus(subscriptionUpdateInputs);
    await this.billingEventRepo.createMany(billingEventsCreateManyInputs);
    await this.eventPublisher.sendNotificationsBatch(notificationMessages);
  }
}
