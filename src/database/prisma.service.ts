import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly serviceName: string;
  private prismaClient: PrismaClient;
  public client: PrismaClient; // Extended client with all extensions

  constructor(
    private readonly configService: ConfigService,
    private readonly pinoLogger: PinoLogger,
  ) {
    this.serviceName = configService.get<string>(
      'app.serviceName',
      'dcb-renewal-service',
    );
    this.initializePrismaClient();
  }

  private initializePrismaClient() {
    const logLevels: Prisma.LogLevel[] = ['query', 'error', 'info', 'warn'];

    const datasourceUrl = new URL(this.configService.get<string>('db.url')!);

    // Microservice-specific connection pool configuration
    const connectionLimit = this.configService.get<string>(
      'db.connectionLimit',
      '5',
    );
    const poolTimeout = this.configService.get<string>('db.poolTimeout', '20');
    const connectTimeout = this.configService.get<string>(
      'db.connectionTimeout',
      '10',
    );
    const statementTimeout = this.configService.get<string>(
      'db.statementTimeout',
      '30000',
    );

    datasourceUrl.searchParams.set('connection_limit', connectionLimit);
    datasourceUrl.searchParams.set('pool_timeout', poolTimeout);
    datasourceUrl.searchParams.set('connect_timeout', connectTimeout);
    datasourceUrl.searchParams.set('statement_timeout', statementTimeout);

    // Add pgbouncer support if enabled
    if (this.configService.get<boolean>('USE_PGBOUNCER', false)) {
      datasourceUrl.searchParams.set('pgbouncer', 'true');
    }

    this.prismaClient = new PrismaClient({
      datasources: {
        db: {
          url: datasourceUrl.toString(),
        },
      },
      log: logLevels.map((level) => ({
        emit: 'event',
        level,
      })),
      errorFormat: 'minimal',
    });

    this.setupLogging();

    // FIX: Assign the base client to 'this.client'
    // so connection methods can be called.
    this.client = this.prismaClient;

    // this.applyExtensions();
  }

  private setupLogging() {
    this.prismaClient.$on('query' as never, (e: Prisma.QueryEvent) => {
      this.pinoLogger.debug(
        {
          service: this.serviceName,
          query: e.query,
          params: e.params,
          duration: e.duration,
          target: e.target,
        },
        'Database query executed',
      );
    });

    this.prismaClient.$on('error' as never, (e: Prisma.LogEvent) => {
      this.pinoLogger.error(
        {
          service: this.serviceName,
          message: e.message,
          target: e.target,
          timestamp: e.timestamp,
        },
        'Prisma error occurred',
      );
    });

    this.prismaClient.$on('info' as never, (e: Prisma.LogEvent) => {
      this.pinoLogger.info(
        {
          service: this.serviceName,
          message: e.message,
          target: e.target,
          timestamp: e.timestamp,
        },
        'Prisma info',
      );
    });

    this.prismaClient.$on('warn' as never, (e: Prisma.LogEvent) => {
      this.pinoLogger.warn(
        {
          service: this.serviceName,
          message: e.message,
          target: e.target,
          timestamp: e.timestamp,
        },
        'Prisma warning',
      );
    });
  }

  // private applyExtensions() {
  //   const slowQueryThreshold = this.configService.get<number>(
  //     'SLOW_QUERY_THRESHOLD',
  //     1000,
  //   );
  //   const auditModels = [
  //     'Transaction',
  //     'Subscription',
  //     'Payment',
  //     'Refund',
  //     'Charge',
  //   ];

  //   this.client = this.prismaClient
  //     .$extends({
  //       name: 'performanceLogging',
  //       query: {
  //         $allModels: {
  //           async $allOperations({ model, operation, args, query }) {
  //             const before = Date.now();
  //             const result = await query(args);
  //             const after = Date.now();
  //             const duration = after - before;

  //             if (duration > slowQueryThreshold) {
  //               this.pinoLogger.warn(
  //                 {
  //                   service: this.serviceName,
  //                   model,
  //                   operation,
  //                   duration,
  //                 },
  //                 'Slow query detected',
  //               );
  //             }

  //             return result;
  //           },
  //         },
  //       },
  //     })
  //     .$extends({
  //       name: 'auditTrail',
  //       query: {
  //         $allModels: {
  //           async create({ model, operation, args, query }) {
  //             const result = await query(args);

  //             if (auditModels.includes(model)) {
  //               this.pinoLogger.info(
  //                 {
  //                   service: this.serviceName,
  //                   model,
  //                   operation: 'create',
  //                   id: (result as any)?.id,
  //                   timestamp: new Date().toISOString(),
  //                 },
  //                 'Audit: Critical operation',
  //               );
  //             }

  //             return result;
  //           },
  //           async update({ model, operation, args, query }) {
  //             const result = await query(args);

  //             if (auditModels.includes(model)) {
  //               this.pinoLogger.info(
  //                 {
  //                   service: this.serviceName,
  //                   model,
  //                   operation: 'update',
  //                   id: (result as any)?.id,
  //                   timestamp: new Date().toISOString(),
  //                 },
  //                 'Audit: Critical operation',
  //               );
  //             }

  //             return result;
  //           },
  //           async delete({ model, operation, args, query }) {
  //             const result = await query(args);

  //             if (auditModels.includes(model)) {
  //               this.pinoLogger.info(
  //                 {
  //                   service: this.serviceName,
  //                   model,
  //                   operation: 'delete',
  //                   id: (result as any)?.id,
  //                   timestamp: new Date().toISOString(),
  //                 },
  //                 'Audit: Critical operation',
  //               );
  //             }

  //             return result;
  //           },
  //           async upsert({ model, operation, args, query }) {
  //             const result = await query(args);

  //             if (auditModels.includes(model)) {
  //               this.pinoLogger.info(
  //                 {
  //                   service: this.serviceName,
  //                   model,
  //                   operation: 'upsert',
  //                   id: (result as any)?.id,
  //                   timestamp: new Date().toISOString(),
  //                 },
  //                 'Audit: Critical operation',
  //               );
  //             }

  //             return result;
  //           },
  //         },
  //       },
  //     })
  //     .$extends({
  //       name: 'timestamps',
  //       query: {
  //         $allModels: {
  //           async create({ args, query }) {
  //             args.data = {
  //               ...args.data,
  //               createdAt: new Date(),
  //               updatedAt: new Date(),
  //             };
  //             return query(args);
  //           },
  //           async update({ args, query }) {
  //             args.data = {
  //               ...args.data,
  //               updatedAt: new Date(),
  //             };
  //             return query(args);
  //           },
  //           async updateMany({ args, query }) {
  //             args.data = {
  //               ...args.data,
  //               updatedAt: new Date(),
  //             };
  //             return query(args);
  //           },
  //           async upsert({ args, query }) {
  //             args.create = {
  //               ...args.create,
  //               createdAt: new Date(),
  //               updatedAt: new Date(),
  //             };
  //             args.update = {
  //               ...args.update,
  //               updatedAt: new Date(),
  //             };
  //             return query(args);
  //           },
  //         },
  //       },
  //     });
  // }

  async onModuleInit() {
    try {
      await this.client.$connect();
      this.logger.log(
        `[${this.serviceName}] Database connection established successfully`,
      );
    } catch (error) {
      this.logger.error(
        `[${this.serviceName}] Failed to connect to database`,
        error,
      );
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
    this.logger.log(`[${this.serviceName}] Database connection closed`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(`[${this.serviceName}] Health check failed`, error);
      return false;
    }
  }

  async cleanConnection(): Promise<void> {
    await this.client.$disconnect();
    await this.client.$connect();
    this.logger.log(`[${this.serviceName}] Connection pool cleaned`);
  }

  // Simple metrics: Check database connectivity status
  async getMetrics() {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return {
        service: this.serviceName,
        timestamp: new Date().toISOString(),
        status: 'healthy',
      };
    } catch (error) {
      this.logger.error('Failed to fetch metrics', error);
      return {
        service: this.serviceName,
        timestamp: new Date().toISOString(),
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Helper to get raw client without extensions (for special cases)
  getRawClient(): PrismaClient {
    return this.prismaClient;
  }
}
