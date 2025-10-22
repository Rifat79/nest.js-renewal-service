import { Injectable } from '@nestjs/common';
import { Prisma, subscriptions } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

export type RenewableSubscriptionPayload = Prisma.subscriptionsGetPayload<{
  include: {
    payment_channels: true;
    charging_configurations: true;
    product_plans: true;
    plan_pricing: true;
    products: true;
  };
}>;

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

  async findRenewableSubscriptions(
    take: number = 10000,
    cursor?: bigint,
  ): Promise<RenewableSubscriptionPayload[]> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const whereClause: Prisma.subscriptionsWhereInput = {
      auto_renew: true,
      status: {
        in: ['ACTIVE', 'SUSPENDED_PAYMENT_FAILED'],
      },
      next_billing_at: {
        gte: todayStart,
        lte: todayEnd,
      },
      ...(cursor && {
        id: {
          gt: cursor,
        },
      }),
    };

    return this.getDelegate(this.prisma).findMany({
      where: whereClause,
      orderBy: {
        id: 'asc',
      },
      take,
      include: {
        payment_channels: true,
        charging_configurations: true,
        product_plans: true,
        plan_pricing: true,
        products: true,
      },
    });
  }
}
