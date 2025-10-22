import { Injectable } from '@nestjs/common';
import { Prisma, product_plans } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PlanRepository extends BaseRepository<
  product_plans,
  Prisma.product_plansDelegate,
  Prisma.product_plansCreateInput,
  Prisma.product_plansUpdateInput,
  Prisma.product_plansWhereInput,
  Prisma.product_plansWhereUniqueInput
> {
  protected readonly modelName = 'product_plans';

  constructor(
    prisma: PrismaService,
    // @InjectPinoLogger(PlanRepository.name)
    logger: PinoLogger,
  ) {
    super(prisma, logger);
  }

  protected getDelegate(
    client: PrismaService | Prisma.TransactionClient,
  ): Prisma.product_plansDelegate {
    const prismaClient =
      client instanceof PrismaService ? client.client : client;

    return prismaClient?.product_plans;
  }
}
