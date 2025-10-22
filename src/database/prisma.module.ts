import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentChannelRepository } from './payment-channel.repository';
import { PlanPricingRepository } from './plan-pricing.repository';
import { PlanRepository } from './plan.repository';
import { PrismaBatchService } from './prisma-batch.service';
import { PrismaService } from './prisma.service';
import { ProductRepository } from './product.repository';
import { TransactionService } from './transaction.service';
export interface PrismaModuleOptions {
  isGlobal?: boolean;
  serviceName?: string;
}

@Global()
@Module({})
export class PrismaModule {
  static forRoot(options?: PrismaModuleOptions): DynamicModule {
    return {
      module: PrismaModule,
      global: options?.isGlobal ?? true,
      imports: [ConfigModule],
      providers: [
        PrismaService,
        // PrismaHealthIndicator,
        TransactionService,
        PrismaBatchService,
        {
          provide: 'SERVICE_NAME',
          useValue: options?.serviceName || 'renewal-service',
        },
        // Repositories
        ProductRepository,
        PaymentChannelRepository,
        PlanRepository,
        PlanPricingRepository,
      ],
      exports: [
        PrismaService,
        // PrismaHealthIndicator,
        TransactionService,
        PrismaBatchService,
        ProductRepository,
        // Repositories
        ProductRepository,
        PaymentChannelRepository,
        PlanRepository,
        PlanPricingRepository,
      ],
    };
  }

  static forFeature(): DynamicModule {
    return {
      module: PrismaModule,
      imports: [ConfigModule],
      providers: [
        PrismaService,
        TransactionService,
        PrismaBatchService,
        // Repositories
        ProductRepository,
        PaymentChannelRepository,
        PlanRepository,
        PlanPricingRepository,
      ],
      exports: [
        PrismaService,
        ProductRepository,
        TransactionService,
        PrismaBatchService,
        // Repositories
        ProductRepository,
        PaymentChannelRepository,
        PlanRepository,
        PlanPricingRepository,
      ],
    };
  }
}
