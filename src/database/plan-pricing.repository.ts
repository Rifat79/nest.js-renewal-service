import { Injectable } from '@nestjs/common';
import { Prisma, plan_pricing } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PlanPricingRepository extends BaseRepository<
  plan_pricing,
  Prisma.plan_pricingDelegate,
  Prisma.plan_pricingCreateInput,
  Prisma.plan_pricingUpdateInput,
  Prisma.plan_pricingWhereInput,
  Prisma.plan_pricingWhereUniqueInput
> {
  protected readonly modelName = 'plan_pricing';

  constructor(
    prisma: PrismaService,
    // @InjectPinoLogger(PlanPricingRepository.name)
    logger: PinoLogger,
  ) {
    super(prisma, logger);
  }

  protected getDelegate(
    client: PrismaService | Prisma.TransactionClient,
  ): Prisma.plan_pricingDelegate {
    const prismaClient =
      client instanceof PrismaService ? client.client : client;

    return prismaClient.plan_pricing;
  }
}
