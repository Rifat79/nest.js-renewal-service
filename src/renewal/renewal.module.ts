import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventPublisherModule } from 'src/event-publisher/event-publisher.module';
import { PaymentModule } from 'src/payment/payment.module';
import { RenewalGpProcessor } from './renewal-gp.processor';
import { RenewalRobiProcessor } from './renewal-robi.processor';
import { RenewalScheduler } from './renewal.schedular';
import { RenewalService } from './renewal.service';

export const RENEWAL_QUEUES = {
  GP: 'renewal_gp',
  ROBI: 'renewal_robi',
  ROBI_MIFE: 'renewal_robi_mife',
};

@Module({
  imports: [
    BullModule.registerQueue(
      { name: RENEWAL_QUEUES.GP },
      { name: RENEWAL_QUEUES.ROBI },
      { name: RENEWAL_QUEUES.ROBI_MIFE },
    ),
    ScheduleModule.forRoot(),
    PaymentModule,
    EventPublisherModule,
  ],
  providers: [
    RenewalService,
    RenewalGpProcessor,
    RenewalRobiProcessor,
    RenewalScheduler,
  ],
  exports: [RenewalService],
})
export class RenewalModule {}
