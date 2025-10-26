import { Module } from '@nestjs/common';
import { RabbitMQModule } from 'src/common/rabbitmq/rabbitmq.module';
import { EventPublisherService } from './event-publisher.service';

@Module({
  imports: [RabbitMQModule],
  providers: [EventPublisherService],
  exports: [EventPublisherService],
})
export class EventPublisherModule {}
