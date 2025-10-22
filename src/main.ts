import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use pino logger
  const pinoLogger = app.get(Logger);
  app.useLogger(pinoLogger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port');

  // Graceful shutdown
  app.enableShutdownHooks();

  // Handle process signals
  const gracefulShutdown = () => {
    void (async () => {
      pinoLogger.log('Shutdown signal received, shutting down gracefully');
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        pinoLogger.error('Error during shutdown', err);
        process.exit(1);
      }
    })();
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  await app.listen(port ?? 3090);

  pinoLogger.log(
    `🚀 DCB-Renewal-Service is running on: http://localhost:${port}`,
  );
}

bootstrap().catch((error) => {
  console.error('Failed to start DCB-Renewal-Service:', error);
  process.exit(1);
});
