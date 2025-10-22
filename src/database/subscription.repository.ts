import { Injectable } from '@nestjs/common';
import { Prisma, subscriptions } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class SubscriptionRepository extends BaseRepository<
  subscriptions,
  Prisma.subscriptionsDelegate,
  Prisma.subscriptionsCreateInput,
  Prisma.subscriptionsUpdateInput,
  Prisma.subscriptionsWhereInput,
  Prisma.subscriptionsWhereUniqueInput
> {
  protected readonly modelName = 'subscriptions';

  constructor(
    prisma: PrismaService,
    // @InjectPinoLogger(SubscriptionRepository.name)
    logger: PinoLogger,
  ) {
    super(prisma, logger);
  }

  protected getDelegate(
    client: PrismaService | Prisma.TransactionClient,
  ): Prisma.subscriptionsDelegate {
    const prismaClient =
      client instanceof PrismaService ? client.client : client;

    return prismaClient.subscriptions;
  }

  async findByMsisdn(msisdn: string, paymentChannelId: number, planId: number) {
    return this.findFirst({
      msisdn: msisdn,
      payment_channel_id: paymentChannelId,
      plan_id: planId,
    });
  }
}
