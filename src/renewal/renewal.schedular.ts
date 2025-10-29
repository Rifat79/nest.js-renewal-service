import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { SubscriptionRepository } from 'src/database/subscription.repository';
import { RenewalService } from './renewal.service';

@Injectable()
export class RenewalScheduler {
  private cursor: bigint | undefined = undefined;
  private readonly BATCH_SIZE = 10000;

  constructor(
    private readonly renewalService: RenewalService,
    private readonly logger: PinoLogger,
    private readonly subscriptionRepo: SubscriptionRepository,
  ) {
    this.logger.setContext(RenewalScheduler.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'daily_renewal_fetch',
    timeZone: 'Asia/Dhaka',
  })
  async handleCron() {
    this.logger.info(
      '--- STARTING DAILY RENEWAL DISPATCH (1:00 AM Asia/Dhaka) ---',
    );

    let batchNumber = 0;

    while (true) {
      const subscriptions =
        await this.subscriptionRepo.findRenewableSubscriptions(
          this.BATCH_SIZE,
          this.cursor,
        );

      if (subscriptions.length === 0) {
        this.logger.info('✅ All renewable subscriptions processed.');
        this.cursor = undefined;
        break;
      }

      batchNumber++;
      this.logger.info({
        msg: `Processing batch`,
        batchNumber,
        count: subscriptions.length,
        cursor: this.cursor?.toString(),
      });

      await this.dispatchJobs(subscriptions);

      this.cursor = subscriptions[subscriptions.length - 1].id;

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    this.logger.info('--- DAILY RENEWAL DISPATCH COMPLETE ---');
  }

  private async dispatchJobs(
    subscriptions: Awaited<
      ReturnType<SubscriptionRepository['findRenewableSubscriptions']>
    >,
  ) {
    const now = Date.now();

    for (const sub of subscriptions) {
      if (!sub.next_billing_at) continue;

      let delayMs = new Date(sub.next_billing_at).getTime() - now;

      if (delayMs < 0) {
        delayMs = 0;
        this.logger.warn({
          msg: 'Overdue subscription scheduled immediately',
          subscriptionId: sub.subscription_id,
        });
      }

      await this.renewalService.dispatchRenewalJob(
        {
          subscriptionId: sub.subscription_id,
          data: sub,
        },
        delayMs,
      );

      this.logger.debug({
        msg: 'Renewal job scheduled',
        subscriptionId: sub.subscription_id,
        delaySeconds: Math.round(delayMs / 1000),
        scheduledAt: new Date(Date.now() + delayMs).toISOString(),
      });
    }
  }
}
