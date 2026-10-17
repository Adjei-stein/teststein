import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { notAuthRateLimited } from './auth/auth-rate-limit';
import { AuthModule } from './auth/auth.module';
import { Env, validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { OrgsModule } from './orgs/orgs.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // In-memory counters: fine for one instance. Use a shared store (Redis) when scaling out.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        { name: 'default', ttl: 60_000, limit: 300 },
        { name: 'auth', ttl: 60_000, limit: config.get('AUTH_RATE_LIMIT', { infer: true }), skipIf: notAuthRateLimited },
      ],
    }),
    DatabaseModule,
    AuthModule,
    OrgsModule,
    ProjectsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
