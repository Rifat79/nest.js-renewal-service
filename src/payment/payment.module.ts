import { Module } from '@nestjs/common';
import { HttpClientModule } from 'src/common/http-client/http-client.module';
import { GpPaymentService } from './gp.payment.service';
import { RobiPaymentService } from './robi.payment.service';

@Module({
  imports: [HttpClientModule],
  providers: [GpPaymentService, RobiPaymentService],
  exports: [GpPaymentService, RobiPaymentService],
})
export class PaymentModule {}
