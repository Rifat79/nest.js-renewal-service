import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaBatchService {
  constructor(
    private readonly prisma: PrismaService,
    // @InjectPinoLogger(PrismaBatchService.name)
    private readonly logger: PinoLogger,
  ) {}

  async batchCreate<T>(
    model: string,
    data: any[],
    batchSize: number = 1000,
  ): Promise<void> {
    const totalBatches = Math.ceil(data.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const batch = data.slice(i * batchSize, (i + 1) * batchSize);

      try {
        await (this.prisma.client as any)[model].createMany({
          data: batch,
          skipDuplicates: true,
        });

        this.logger.info(
          {
            model,
            batchNumber: i + 1,
            totalBatches,
            recordsProcessed: batch.length,
          },
          'Batch insert completed',
        );
      } catch (error) {
        this.logger.error(
          {
            model,
            batchNumber: i + 1,
            error,
          },
          'Batch insert failed',
        );
        throw error;
      }
    }
  }

  async batchUpdate<T>(
    model: string,
    updates: Array<{ where: any; data: any }>,
    batchSize: number = 100,
  ): Promise<void> {
    const totalBatches = Math.ceil(updates.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const batch = updates.slice(i * batchSize, (i + 1) * batchSize);

      try {
        await this.prisma.client.$transaction(
          batch.map((update) =>
            (this.prisma.client as any)[model].update({
              where: update.where,
              data: update.data,
            }),
          ),
        );

        this.logger.info(
          {
            model,
            batchNumber: i + 1,
            totalBatches,
            recordsProcessed: batch.length,
          },
          'Batch update completed',
        );
      } catch (error) {
        this.logger.error(
          {
            model,
            batchNumber: i + 1,
            error,
          },
          'Batch update failed',
        );
        throw error;
      }
    }
  }

  async batchDelete(
    model: string,
    ids: string[],
    batchSize: number = 1000,
    hardDelete: boolean = false,
  ): Promise<void> {
    const totalBatches = Math.ceil(ids.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const batch = ids.slice(i * batchSize, (i + 1) * batchSize);

      try {
        const client = hardDelete
          ? this.prisma.getRawClient()
          : this.prisma.client;

        await (client as any)[model].deleteMany({
          where: {
            id: {
              in: batch,
            },
          },
        });

        this.logger.info(
          {
            model,
            batchNumber: i + 1,
            totalBatches,
            recordsProcessed: batch.length,
            hardDelete,
          },
          'Batch delete completed',
        );
      } catch (error) {
        this.logger.error(
          {
            model,
            batchNumber: i + 1,
            error,
          },
          'Batch delete failed',
        );
        throw error;
      }
    }
  }
}
