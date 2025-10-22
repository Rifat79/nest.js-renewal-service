import { Injectable } from '@nestjs/common';
import { Prisma, payment_channels } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { BaseRepository } from './base.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PaymentChannelRepository extends BaseRepository<
  payment_channels,
  Prisma.payment_channelsDelegate,
  Prisma.payment_channelsCreateInput,
  Prisma.payment_channelsUpdateInput,
  Prisma.payment_channelsWhereInput,
  Prisma.payment_channelsWhereUniqueInput
> {
  protected readonly modelName = 'payment_channels';

  constructor(
    prisma: PrismaService,
    // @InjectPinoLogger(PaymentChannelRepository.name)
    logger: PinoLogger,
  ) {
    super(prisma, logger);
  }

  protected getDelegate(
    client: PrismaService | Prisma.TransactionClient,
  ): Prisma.payment_channelsDelegate {
    const prismaClient =
      client instanceof PrismaService ? client.client : client;

    return prismaClient.payment_channels;
  }

  async findByChannelCode(code: string): Promise<payment_channels | null> {
    return this.findUnique({ code });
  }
}
