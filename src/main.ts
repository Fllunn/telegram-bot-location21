import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    Logger.overrideLogger(false);
  }

  const app = await NestFactory.create(AppModule, {
    logger: isProd ? false : ['log', 'error', 'warn', 'debug'],
  });
  const logger = new Logger('Bootstrap');

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  if (!isProd) {
    logger.log(`HTTP server listening on port ${port}`);
  }
}

bootstrap().catch((err) => {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('Failed to bootstrap application', err);
  }
  process.exit(1);
});
