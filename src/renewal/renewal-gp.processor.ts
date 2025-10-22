import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { GpPaymentService } from 'src/payment/gp.payment.service';
import { v4 as uuidv4 } from 'uuid';
import { RENEWAL_QUEUES } from './renewal.module';
import { RenewalJobData, RenewalService } from './renewal.service';

@Processor(RENEWAL_QUEUES.GP, { concurrency: 18 })
export class RenewalGpProcessor extends WorkerHost {
  constructor(
    private readonly renewalService: RenewalService,
    private readonly logger: PinoLogger,
    private readonly gpPaymentService: GpPaymentService,
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

    const chargePayload = {
      amount: data.plan_pricing?.base_amount?.toNumber() ?? 0,
      endUserId: data.payment_channel_reference,
      currency: data.plan_pricing?.currency,
      description: data.products.description,
      consentId: data.consent_id,
      validityInDays: data.product_plans.billing_cycle_days,
      referenceCode: uuidv4(),
      productId,
    };

    // --- Core Logic: Simulate Charging Attempt (OP_A) ---
    const chargeResult = await this.gpPaymentService.charge(chargePayload);

    // High success rate (80%)
    const isSuccess = chargeResult.success === true;

    const message = isSuccess
      ? `GP: Successfully charged subscription.`
      : `GP: Charging failed due to temporary gateway issue.`;

    // --- Reporting Logic: Publish result ---
    await this.renewalService.publishChargeResult({
      subscriptionId,
      data,
      timestamp: Date.now(),
      success: isSuccess,
      message,
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
