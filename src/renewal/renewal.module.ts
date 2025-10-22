import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { RenewalGpProcessor } from './renewal-gp.processor';
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
  ],
  providers: [RenewalService, RenewalGpProcessor, RenewalScheduler],
  exports: [RenewalService],
})
export class RenewalModule {}
