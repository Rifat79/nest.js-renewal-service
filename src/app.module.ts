import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './common/redis/redis.module';
import appConfig from './config/app.config';
import dbConfig from './config/db.config';
import redisConfig from './config/redis.config';
import rmqConfig from './config/rmq.config';
import { PrismaModule } from './database/prisma.module';
import { EventPublisherModule } from './event-publisher/event-publisher.module';
import { RenewalModule } from './renewal/renewal.module';

@Module({
  imports: [
    // Configurations
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, dbConfig, redisConfig, rmqConfig],
    }),

    // Logger
    LoggerModule,

    // Cache
    RedisModule,

    // Prisma
    PrismaModule.forRoot({
      isGlobal: true,
      serviceName: 'dcb-renewal-service',
    }),

    // BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
        },
      }),
    }),

    // Event Publisher
    EventPublisherModule,

    // Renewal Module
    RenewalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
