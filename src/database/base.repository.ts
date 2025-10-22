import { Prisma } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from './prisma.service';

/**
 * M extends Prisma.RejectOnNotFound is a placeholder to correctly infer the
 * model delegate type for the specific model being used in the subclass.
 * The M parameter represents the specific Model Delegate (e.g., Prisma.UserDelegate<any>).
 */
export abstract class BaseRepository<
  T, // The returned Model Type (e.g., User)
  M, // The Prisma Model Delegate Type (e.g., Prisma.UserDelegate<any>)
  CreateInput extends Prisma.Args<M, 'create'>['data'],
  UpdateInput extends Prisma.Args<M, 'update'>['data'],
  WhereInput extends Prisma.Args<M, 'findFirst'>['where'],
  WhereUniqueInput extends Prisma.Args<M, 'findUnique'>['where'],
> {
  protected abstract readonly modelName: string;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly logger: PinoLogger,
  ) {}

  /**
   * Returns the Prisma model delegate (e.g., prisma.user).
   * It is typed as M, the generic model delegate type, to ensure type safety
   * for all subsequent Prisma calls.
   *
   * @param client The PrismaService instance or a transaction client.
   */
  protected abstract getDelegate(
    client: PrismaService | Prisma.TransactionClient,
  ): M;

  async create(data: CreateInput, tx?: Prisma.TransactionClient): Promise<T> {
    const client = tx || this.prisma;
    try {
      // The delegate is now strongly typed as M
      const result = await (this.getDelegate(client) as any).create({ data });
      this.logger.info(
        { model: this.modelName, action: 'create' },
        'Record created',
      );
      return result as T; // Cast result to T, the expected model type
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Create operation failed',
      );
      throw error;
    }
  }

  async findUnique(
    where: WhereUniqueInput,
    tx?: Prisma.TransactionClient,
  ): Promise<T | null> {
    const client = tx || this.prisma;
    try {
      // The delegate is now strongly typed as M
      const result = await (this.getDelegate(client) as any).findUnique({
        where,
      });
      return result as T | null; // Cast result to T or null
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'FindUnique operation failed',
      );
      throw error;
    }
  }

  async findFirst(
    where: WhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<T | null> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).findFirst({
        where,
      });
      return result as T | null;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'FindFirst operation failed',
      );
      throw error;
    }
  }

  async findMany(
    where?: WhereInput,
    options?: {
      skip?: number;
      take?: number;
      // Use the correct type for orderBy from the delegate's findMany args
      orderBy?: Prisma.Args<M, 'findMany'>['orderBy'];
    },
    tx?: Prisma.TransactionClient,
  ): Promise<T[]> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).findMany({
        where,
        ...options,
      });
      return result as T[];
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'FindMany operation failed',
      );
      throw error;
    }
  }

  async update(
    where: WhereUniqueInput,
    data: UpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<T> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).update({
        where,
        data,
      });
      this.logger.info(
        { model: this.modelName, action: 'update' },
        'Record updated',
      );
      return result as T;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Update operation failed',
      );
      throw error;
    }
  }

  async delete(
    where: WhereUniqueInput,
    tx?: Prisma.TransactionClient,
  ): Promise<T> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).delete({ where });
      this.logger.info(
        { model: this.modelName, action: 'delete' },
        'Record deleted',
      );
      return result as T;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Delete operation failed',
      );
      throw error;
    }
  }

  async count(
    where?: WhereInput,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx || this.prisma;
    try {
      // Prisma count returns a number, so no cast is strictly needed, but kept for consistency
      const result: number = await (this.getDelegate(client) as any).count({
        where,
      });
      return result;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Count operation failed',
      );
      throw error;
    }
  }

  async upsert(
    where: WhereUniqueInput,
    create: CreateInput,
    update: UpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<T> {
    const client = tx || this.prisma;
    try {
      const result = await (this.getDelegate(client) as any).upsert({
        where,
        create,
        update,
      });
      this.logger.info(
        { model: this.modelName, action: 'upsert' },
        'Record upserted',
      );
      return result as T;
    } catch (error) {
      this.logger.error(
        { model: this.modelName, error },
        'Upsert operation failed',
      );
      throw error;
    }
  }
}
