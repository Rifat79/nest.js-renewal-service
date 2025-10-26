import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import rabbitmqConfig from '../../config/rmq.config';
import { RabbitMQProducerService } from './rabbitmq.service';

@Global()
@Module({
  imports: [ConfigModule.forFeature(rabbitmqConfig)],
  providers: [RabbitMQProducerService],
  exports: [RabbitMQProducerService],
})
export class RabbitMQModule {}
