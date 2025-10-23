import { Injectable } from '@nestjs/common';
import { billing_events, Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

export type BillingEventsCreateManyInput = Prisma.billing_eventsCreateManyInput;

@Injectable()
export class BillingEventRepository extends BaseRepository<
  billing_events,
  Prisma.billing_eventsDelegate,
  Prisma.billing_eventsCreateInput,
  Prisma.billing_eventsUpdateInput,
  Prisma.billing_eventsWhereInput,
  Prisma.billing_eventsWhereUniqueInput
> {
  protected readonly modelName = 'billing_events';

  constructor(prisma: PrismaService, logger: PinoLogger) {
    super(prisma, logger);
  }

  protected getDelegate(
    client?: PrismaService | Prisma.TransactionClient,
  ): Prisma.billing_eventsDelegate {
    const prismaClient =
      client instanceof PrismaService
        ? client.client
        : (client ?? this.prisma.client);
    return prismaClient.billing_events;
  }

  /**
   * Performs a high-performance bulk insert using Prisma.createMany().
   * All rows are inserted in a single SQL query for maximum efficiency.
   */
  async createMany(
    data: Prisma.billing_eventsCreateManyInput[],
  ): Promise<void> {
    if (!data.length) return;
    try {
      await this.getDelegate().createMany({ data });
      this.logger.debug(
        { model: this.modelName, count: data.length },
        'Bulk createMany operation completed.',
      );
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Bulk createMany operation failed.',
      );
      throw error;
    }
  }
}
