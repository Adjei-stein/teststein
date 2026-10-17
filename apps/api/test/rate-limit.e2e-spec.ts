import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createApp } from './helpers';

describe('Sign-in rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Each test file gets a fresh module registry, so this applies only here.
    process.env.AUTH_RATE_LIMIT = '3';
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('limits sign-in attempts per IP but not other routes', async () => {
    const attempt = () =>
      request(app.getHttpServer()).post('/api/auth/login').send({ email: 'brute@example.com', password: 'guess-guess' });
    for (let i = 0; i < 3; i++) {
      await attempt().expect(401);
    }
    await attempt().expect(429);
    // Health and other routes use the general limit.
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
