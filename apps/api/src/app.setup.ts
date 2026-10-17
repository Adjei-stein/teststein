import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env';
import { PgExceptionFilter } from './common/pg-exception.filter';

/** Shared by main.ts and the e2e tests, so tests exercise the real configuration. */
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PgExceptionFilter());
  app.enableShutdownHooks();
  return app;
}
