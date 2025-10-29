import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import {
  RobiChargeConfig,
  RobiPaymentService,
} from 'src/payment/robi.payment.service';
import { v4 as uuidv4 } from 'uuid';
import { RENEWAL_QUEUES } from './renewal.constants';
import { RenewalJobData, RenewalService } from './renewal.service';

@Processor(RENEWAL_QUEUES.ROBI, { concurrency: 10 })
export class RenewalRobiProcessor extends WorkerHost {
  constructor(
    private readonly renewalService: RenewalService,
    private readonly logger: PinoLogger,
    private readonly robiPaymentService: RobiPaymentService,
  ) {
    super();
  }

  /**
   * Worker logic for attempting subscription charging via OP_A API.
   */
  async process(job: Job<RenewalJobData>): Promise<void> {
    const { subscriptionId, data } = job.data;
    const queueName = RENEWAL_QUEUES.ROBI;

    this.logger.info(
      `[START] ${queueName} processing Sub ID: ${subscriptionId}.`,
    );

    const config = data.charging_configurations?.config as
      | RobiChargeConfig
      | undefined;
    const paymentReferenceId = uuidv4();

    if (!config) {
      this.logger.warn(
        `[SKIP] ${queueName} Sub ID: ${subscriptionId} has no RobiChargeConfig.`,
      );
      return;
    }

    const chargePayload = {
      amount: data.plan_pricing?.base_amount?.toNumber() ?? 0,
      currency: data.plan_pricing?.currency ?? 'BDT',
      description: data.products.description ?? '',
      referenceCode: paymentReferenceId,
      msisdn: data.msisdn,
      unSubURL: data.products.unsubscription_url,
      config,
    };

    // --- Core Logic: Simulate Charging Attempt (OP_A) ---
    const chargeResult =
      await this.robiPaymentService.renewSubscription(chargePayload);

    // High success rate (80%)
    const isSuccess = chargeResult.success === true;

    const message = isSuccess
      ? `ROBI: Successfully charged subscription.`
      : `ROBI: Charging failed due to temporary gateway issue.`;

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
      `Job ${job.id} for Sub ID ${job.data.subscriptionId} failed in ${RENEWAL_QUEUES.ROBI} with error: ${error.message}`,
    );
  }
}
