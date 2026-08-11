import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppLogger } from './common/logger/app-logger.service';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = await app.resolve(AppLogger);
  logger.setContext('Bootstrap');
  app.useLogger(logger);

  const config = app.get(ConfigService);
  const port = config.get<AppConfig['port']>('port') ?? 3000;
  const webUrl = config.get<AppConfig['webUrl']>('webUrl');
  const isProduction = config.get<AppConfig['isProduction']>('isProduction');

  // Shared with the test harness so the two can never drift - see bootstrap.ts.
  configureApp(app, { corsOrigin: webUrl });

  app.enableShutdownHooks();

  if (!isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ExpenseIQ API')
        .setDescription(
          'AI-powered expense tracker. Every AI-parsed entry lands in the ' +
            'review queue before it reaches the ledger.',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);

  logger.log(`ExpenseIQ API listening on http://localhost:${port}/api`);
  if (!isProduction) {
    logger.log(`OpenAPI docs at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
