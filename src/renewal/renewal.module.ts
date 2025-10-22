import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RenewalProcessor } from './renewal.processor';
import { RenewalScheduler } from './renewal.scheduler';
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
  ],
  providers: [RenewalService, RenewalProcessor, RenewalScheduler],
  exports: [RenewalService],
})
export class RenewalModule {}
