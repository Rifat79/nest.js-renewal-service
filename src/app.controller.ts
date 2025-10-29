import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import {
  EventPublisherService,
  NotificationPayload,
} from './event-publisher/event-publisher.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('event')
  async testEvent() {
    const payload: NotificationPayload = {
      id: crypto.randomUUID(),
      source: 'dcb-renewal-service',
      subscriptionId: 'sub_123456789',
      merchantTransactionId: 'MTXN-20251026-0001',
      keyword: 'MUSIC_PLUS',
      msisdn: '8801712345678',
      paymentProvider: 'GP',
      eventType: 'subscription.success',
      amount: 50,
      currency: 'BDT',
      billingCycleDays: 1,
      metadata: { planName: 'Music+ Monthly Plan', autoRenew: true },
      timestamp: Date.now(),
    };

    const res = await this.eventPublisher.sendNotification(payload);

    return res;
  }
}
