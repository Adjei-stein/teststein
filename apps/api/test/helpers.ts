import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types';

/** Boots the real AppModule with the same setup as main.ts. Import lazily so tests can set env first. */
export async function createApp(): Promise<INestApplication<App>> {
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/app.setup');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
  await app.init();
  return app;
}

/** Owner connection for setting up fixtures the API can't create yet (e.g. extra memberships). */
export function ownerClient(): pg.Client {
  return new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
}

export const uniqueEmail = (name: string) => `${name}-${randomUUID().slice(0, 8)}@example.com`;

export function refreshCookie(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find(c => c.startsWith('ts_refresh='))?.split(';')[0];
}

export interface SignedUp {
  token: string;
  cookie: string;
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; slug: string; role: string };
}

export async function signup(app: INestApplication<App>, name: string, organizationName = `${name}'s team`): Promise<SignedUp> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .send({ name, email: uniqueEmail(name.toLowerCase()), password: 'a-long-password', organizationName })
    .expect(201);
  return { token: res.body.accessToken, cookie: refreshCookie(res)!, user: res.body.user, organization: res.body.organization };
}
