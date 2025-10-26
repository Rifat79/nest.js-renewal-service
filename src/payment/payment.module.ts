import { Module } from '@nestjs/common';
import { HttpClientModule } from 'src/common/http-client/http-client.module';
import { GpPaymentService } from './gp.payment.service';

@Module({
  imports: [HttpClientModule],
  providers: [GpPaymentService],
  exports: [GpPaymentService],
})
export class PaymentModule {}
