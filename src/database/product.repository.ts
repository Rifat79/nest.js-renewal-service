import { Injectable } from '@nestjs/common';
import { Prisma, products } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

export type ProductWithPlanAndPricing = Prisma.productsGetPayload<{
  include: {
    product_plans: {
      include: {
        plan_pricing: true;
      };
    };
  };
}>;
@Injectable()
export class ProductRepository extends BaseRepository<
  products,
  Prisma.productsDelegate,
  Prisma.productsCreateInput,
  Prisma.productsUpdateInput,
  Prisma.productsWhereInput,
  Prisma.productsWhereUniqueInput
> {
  protected readonly modelName = 'products';

  constructor(
    prisma: PrismaService,
    // @InjectPinoLogger(ProductRepository.name)
    logger: PinoLogger,
  ) {
    super(prisma, logger);
  }

  /**
   * Returns the delegate for Prisma Product model.
   * Supports both normal and transactional Prisma clients.
   */
  protected getDelegate(
    client?: PrismaService | Prisma.TransactionClient,
  ): Prisma.productsDelegate {
    const prismaClient =
      client instanceof PrismaService
        ? client.client
        : (client ?? this.prisma.client);
    return prismaClient.products;
  }

  async findProductWithPlanAndPricing(
    name: string,
    paymentChannelId: number,
    pricingAmount: number,
  ): Promise<ProductWithPlanAndPricing | null> {
    return this.getDelegate().findFirst({
      where: {
        name,
        product_plans: {
          some: {
            plan_pricing: {
              some: {
                payment_channel_id: paymentChannelId,
                base_amount: pricingAmount,
              },
            },
          },
        },
      },
      include: {
        product_plans: {
          include: {
            plan_pricing: {
              where: {
                payment_channel_id: paymentChannelId,
                base_amount: pricingAmount,
              },
            },
          },
        },
      },
    });
  }
}
