import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import type { Env } from './config/env';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`Teststein API listening on http://localhost:${port}/api`, 'Bootstrap');
}
void bootstrap();
