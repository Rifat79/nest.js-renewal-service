import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './common/logger/logger.module';
import { RabbitMQModule } from './common/rabbitmq/rabbitmq.module';
import { RedisModule } from './common/redis/redis.module';
import appConfig from './config/app.config';
import dbConfig from './config/db.config';
import { PrismaModule } from './database/prisma.module';

@Module({
  imports: [
    // Configurations
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, dbConfig],
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

    // Message Queue
    RabbitMQModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
