import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from './prisma.service';

export interface TransactionMetadata {
  transactionId: string;
  serviceName: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  correlationId?: string;
}

@Injectable()
export class TransactionService {
  private readonly serviceName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService,
  ) {
    this.serviceName = configService.get<string>(
      'SERVICE_NAME',
      'unknown-service',
    );
  }

  async executeInTransaction<T>(
    callback: (tx: any, metadata: TransactionMetadata) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
      traceId?: string;
      spanId?: string;
      userId?: string;
      correlationId?: string;
    },
  ): Promise<T> {
    const transactionId = this.generateTransactionId();
    const metadata: TransactionMetadata = {
      transactionId,
      serviceName: this.serviceName,
      traceId: options?.traceId,
      spanId: options?.spanId,
      userId: options?.userId,
      correlationId: options?.correlationId,
    };

    try {
      this.logger.info({ ...metadata }, 'Transaction started');

      const result = await this.prisma.client.$transaction(
        (tx: any) => callback(tx, metadata),
        {
          maxWait: options?.maxWait || 5000,
          timeout: options?.timeout || 10000,
          isolationLevel:
            options?.isolationLevel ||
            Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );

      this.logger.info({ ...metadata }, 'Transaction committed successfully');

      return result;
    } catch (error) {
      this.logger.error(
        { ...metadata, error },
        'Transaction rolled back due to error',
      );

      throw error;
    }
  }

  private generateTransactionId(): string {
    return `${this.serviceName}_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
