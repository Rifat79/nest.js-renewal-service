import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import { HttpCallError } from 'src/common/http-client/http-client.service';
import { RedisService } from 'src/common/redis/redis.service';
import { RenewableSubscriptionPayload } from 'src/database/subscription.repository';
import { RENEWAL_QUEUES } from './renewal.module';
import { RESULTS_REDIS_KEY } from './result-consumer.scheduler';

export interface RenewalJobData {
  subscriptionId: string;
  data: RenewableSubscriptionPayload;
}

export interface ChargeResult {
  subscriptionId: string;
  data: RenewableSubscriptionPayload;
  timestamp: number;
  success: boolean;
  message?: string;
  paymentReferenceId?: string;
  error?: HttpCallError;
  httpStatus: number;
  requestPayload: object;
  responsePayload?: any;
  responseDuration: number;
}

@Injectable()
export class RenewalService {
  private readonly operatorQueues: Record<string, Queue<RenewalJobData>>;

  constructor(
    @InjectQueue(RENEWAL_QUEUES.GP)
    private readonly renewalQueueGp: Queue<RenewalJobData>,
    @InjectQueue(RENEWAL_QUEUES.ROBI)
    private readonly renewalQueueRobi: Queue<RenewalJobData>,
    @InjectQueue(RENEWAL_QUEUES.ROBI_MIFE)
    private readonly renewalQueueRobiMife: Queue<RenewalJobData>,
    private readonly logger: PinoLogger,
    private readonly redis: RedisService,
  ) {
    this.logger.setContext(RenewalService.name);

    this.operatorQueues = {
      GP: this.renewalQueueGp,
      ROBI: this.renewalQueueRobi,
      ROBI_MIFE: this.renewalQueueRobiMife,
    };
  }

  async dispatchRenewalJob(data: RenewalJobData, delayMs: number) {
    const operator = data.data.payment_channels.code;

    const queue = this.operatorQueues[operator];
    if (!queue) {
      this.logger.error({
        msg: 'Unknown operator. Cannot dispatch job.',
        operator,
        subscriptionId: data.subscriptionId,
      });
      return;
    }

    const jobName = 'renewal-attempt';

    const job = await queue.add(jobName, data, {
      delay: delayMs,
      jobId: data.subscriptionId,
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.debug({
      msg: 'Renewal job dispatched',
      queue: queue.name,
      subscriptionId: data.subscriptionId,
      delaySeconds: Math.round(delayMs / 1000),
      jobId: job.id,
    });
  }

  async publishChargeResult(result: ChargeResult) {
    await this.redis.rpush(RESULTS_REDIS_KEY, JSON.stringify(result));

    this.logger.info({
      msg: 'Published charging result',
      subscriptionId: result.subscriptionId,
      success: result.success,
      timestamp: result.timestamp,
    });
  }
}
