import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { GpPaymentService } from 'src/payment/gp.payment.service';
import { v4 as uuidv4 } from 'uuid';
import { RENEWAL_QUEUES } from './renewal.constants';
import { RenewalJobData, RenewalService } from './renewal.service';

@Processor(RENEWAL_QUEUES.GP, { concurrency: 18 })
export class RenewalGpProcessor extends WorkerHost {
  constructor(
    private readonly renewalService: RenewalService,
    private readonly logger: PinoLogger,
    private readonly gpPaymentService: GpPaymentService,
    @InjectQueue(RENEWAL_QUEUES.GP)
    private readonly renewalQueueGp: Queue<RenewalJobData>,
  ) {
    super();
  }

  /**
   * Worker logic for attempting subscription charging via OP_A API.
   */
  async process(job: Job<RenewalJobData>): Promise<void> {
    const { subscriptionId, data } = job.data;
    const queueName = RENEWAL_QUEUES.GP;

    this.logger.info(
      `[START] ${queueName} processing Sub ID: ${subscriptionId}.`,
    );

    const config = data.charging_configurations?.config as
      | { keyword?: string }
      | undefined;
    const productId = config?.keyword ?? '';
    const paymentReferenceId = uuidv4();

    const chargePayload = {
      amount: data.plan_pricing?.base_amount?.toNumber() ?? 0,
      endUserId: data.payment_channel_reference,
      currency: data.plan_pricing?.currency,
      description: data.products.description,
      consentId: data.consent_id,
      validityInDays: data.product_plans.billing_cycle_days,
      referenceCode: paymentReferenceId,
      productId,
    };

    // --- Core Logic: Simulate Charging Attempt (OP_A) ---
    const chargeResult = await this.gpPaymentService.charge(chargePayload);

    // High success rate (80%)
    const isSuccess = chargeResult.success === true;

    const message = isSuccess
      ? `GP: Successfully charged subscription.`
      : `GP: Charging failed due to temporary gateway issue.`;

    // Requeue Logic
    if (!isSuccess) {
      const now = new Date();
      const retryTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours later

      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      midnight.setDate(midnight.getDate() + 1);

      const isBeforeMidnight = retryTime.getTime() < midnight.getTime();

      if (isBeforeMidnight) {
        const delayMs = retryTime.getTime() - now.getTime();

        await this.renewalQueueGp.add(queueName, job.data, {
          delay: delayMs,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        });

        this.logger.warn(
          `[REQUEUE] ${queueName} Sub ID: ${subscriptionId} will retry in 8h before midnight.`,
        );
      } else {
        this.logger.warn(
          `[SKIP REQUEUE] ${queueName} Sub ID: ${subscriptionId} will be picked by 00:30 scheduler.`,
        );
      }
    }

    // --- Reporting Logic: Publish result ---
    await this.renewalService.publishChargeResult({
      subscriptionId,
      paymentReferenceId,
      data,
      timestamp: Date.now(),
      success: isSuccess,
      error: chargeResult.error,
      requestPayload: chargeResult.requestPayload,
      responsePayload: chargeResult.responsePayload,
      responseDuration: chargeResult.responseDuration,
      message,
      httpStatus: chargeResult.httpStatus,
    });

    this.logger.info(
      `[END] ${queueName} finished Sub ID: ${subscriptionId}. Status: ${isSuccess ? 'SUCCESS' : 'FAILURE'}.`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<RenewalJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} for Sub ID ${job.data.subscriptionId} failed in ${RENEWAL_QUEUES.GP} with error: ${error.message}`,
    );
  }
}
