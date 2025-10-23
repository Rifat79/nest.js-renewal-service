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
    merchants: true;
  };
}>;

export interface SubscriptionBulkUpdate {
  subscriptionId: string;
  success: boolean;
  nextBillingAt: Date;
}

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
    client?: PrismaService | Prisma.TransactionClient,
  ): Prisma.subscriptionsDelegate {
    const prismaClient =
      client instanceof PrismaService
        ? client.client
        : (client ?? this.prisma.client);

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
        merchants: true,
      },
    });
  }

  /**
   * Performs an efficient bulk update using a single raw SQL statement.
   * Updates status, billing timestamps, and next billing date in one query.
   */
  async bulkUpdateStatus(updates: SubscriptionBulkUpdate[]): Promise<void> {
    if (!updates.length) return;

    const now = new Date();

    const statusCases = Prisma.sql`CASE subscription_id
    ${Prisma.join(
      updates.map(
        (u) =>
          Prisma.sql`WHEN ${u.subscriptionId} THEN ${u.success ? 'ACTIVE' : 'SUSPENDED_PAYMENT_FAILED'}`,
      ),
      ' ',
    )}
  END`;

    const succeedAtCases = Prisma.sql`CASE subscription_id
    ${Prisma.join(
      updates.map(
        (u) =>
          Prisma.sql`WHEN ${u.subscriptionId} THEN ${u.success ? now : null}`,
      ),
      ' ',
    )}
  END`;

    const failedAtCases = Prisma.sql`CASE subscription_id
    ${Prisma.join(
      updates.map(
        (u) =>
          Prisma.sql`WHEN ${u.subscriptionId} THEN ${u.success ? null : now}`,
      ),
      ' ',
    )}
  END`;

    const nextBillingCases = Prisma.sql`CASE subscription_id
    ${Prisma.join(
      updates.map(
        (u) => Prisma.sql`WHEN ${u.subscriptionId} THEN ${u.nextBillingAt}`,
      ),
      ' ',
    )}
  END`;

    const subscriptionIds = updates.map((u) => u.subscriptionId);

    const query = Prisma.sql`
    UPDATE subscriptions
    SET
      status = ${statusCases},
      last_payment_succeed_at = ${succeedAtCases},
      last_payment_failed_at = ${failedAtCases},
      next_billing_at = ${nextBillingCases}
    WHERE subscription_id IN (${Prisma.join(subscriptionIds)});
  `;

    try {
      await this.executeRaw(query);
      this.logger.debug(
        { model: this.modelName, count: updates.length },
        'Bulk subscription update completed.',
      );
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Bulk subscription update failed.',
      );
      throw error;
    }
  }
}
