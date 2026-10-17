import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createApp, ownerClient, refreshCookie, signup, uniqueEmail } from './helpers';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('reports health', async () => {
    await http().get('/api/health').expect(200, { status: 'ok', database: 'ok' });
  });

  describe('sign-up', () => {
    it('creates the user and their organisation, and signs them in', async () => {
      const email = uniqueEmail('ada');
      const res = await http()
        .post('/api/auth/signup')
        .send({ name: ' Ada Lovelace ', email: email.toUpperCase(), password: 'a-long-password', organizationName: 'Analytical Engines' })
        .expect(201);

      expect(res.body.user).toEqual({ id: expect.any(String), name: 'Ada Lovelace', email });
      expect(res.body.organization).toMatchObject({ name: 'Analytical Engines', role: 'owner', plan: 'free' });
      expect(res.body.organization.slug).toMatch(/^analytical-engines(-[a-f0-9]{4})?$/);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toBeUndefined(); // only ever in the cookie

      const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith('ts_refresh='));
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/Path=\/api\/auth/);
      expect(cookie).toMatch(/SameSite=Strict/);
    });

    it('rejects a duplicate email (case-insensitive)', async () => {
      const email = uniqueEmail('dup');
      const body = { name: 'Dup', email, password: 'a-long-password', organizationName: 'Dup' };
      await http().post('/api/auth/signup').send(body).expect(201);
      const res = await http().post('/api/auth/signup').send({ ...body, email: email.toUpperCase() }).expect(409);
      expect(res.body.message).toBe('An account with this email already exists.');
    });

    it('validates input and rejects unknown fields', async () => {
      const res = await http()
        .post('/api/auth/signup')
        .send({ name: 'X', email: 'not-an-email', password: 'short', organizationName: 'X', isAdmin: true })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'property isAdmin should not exist',
          'email must be an email',
          'Password must be at least 10 characters.',
        ]),
      );
    });
  });

  describe('sign-in', () => {
    it('signs in with the right password and returns the same error for a wrong password or unknown email', async () => {
      const email = uniqueEmail('grace');
      await http().post('/api/auth/signup').send({ name: 'Grace', email, password: 'a-long-password', organizationName: 'Navy' }).expect(201);

      const wrong = await http().post('/api/auth/login').send({ email, password: 'wrong-password' }).expect(401);
      const unknown = await http().post('/api/auth/login').send({ email: uniqueEmail('nobody'), password: 'whatever-123' }).expect(401);
      expect(wrong.body.message).toBe('Incorrect email or password.');
      expect(unknown.body.message).toBe(wrong.body.message);

      const ok = await http().post('/api/auth/login').send({ email: email.toUpperCase(), password: 'a-long-password' }).expect(200);
      expect(ok.body.user.email).toBe(email);
      expect(refreshCookie(ok)).toBeDefined();
    });

    it('protects routes without a valid access token', async () => {
      await http().get('/api/auth/me').expect(401);
      await http().get('/api/auth/me').set('Authorization', 'Bearer not-a-token').expect(401);
    });

    it('returns the current user and their organisations', async () => {
      const alice = await signup(app, 'Alice');
      const res = await http().get('/api/auth/me').set('Authorization', `Bearer ${alice.token}`).expect(200);
      expect(res.body.user).toEqual(alice.user);
      expect(res.body.organizations).toEqual([expect.objectContaining({ id: alice.organization.id, role: 'owner' })]);
    });
  });

  describe('refresh tokens', () => {
    it('rotates the refresh token on every use', async () => {
      const user = await signup(app, 'Rotator');
      const first = await http().post('/api/auth/refresh').set('Cookie', user.cookie).expect(200);
      const next = refreshCookie(first);
      expect(first.body.accessToken).toEqual(expect.any(String));
      expect(next).toBeDefined();
      expect(next).not.toEqual(user.cookie);
      await http().post('/api/auth/refresh').set('Cookie', next!).expect(200);
    });

    it('treats a quick second use of the old token as a race, not theft', async () => {
      const user = await signup(app, 'Racer');
      const rotated = await http().post('/api/auth/refresh').set('Cookie', user.cookie).expect(200);
      await http().post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);
      // The new token from the first refresh still works.
      await http().post('/api/auth/refresh').set('Cookie', refreshCookie(rotated)!).expect(200);
    });

    it('revokes every session when an old token is replayed later', async () => {
      const user = await signup(app, 'Victim');
      const rotated = await http().post('/api/auth/refresh').set('Cookie', user.cookie).expect(200);

      // Pretend the rotation happened a minute ago, then replay the old token (as a thief would).
      const db = ownerClient();
      await db.connect();
      await db.query(`update user_sessions set revoked_at = now() - interval '1 minute' where user_id = $1 and revoked_at is not null`, [user.user.id]);
      await db.end();

      await http().post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);
      // The legitimate user's current session was revoked too, forcing a fresh sign-in.
      await http().post('/api/auth/refresh').set('Cookie', refreshCookie(rotated)!).expect(401);
    });

    it('signs out by revoking the session', async () => {
      const user = await signup(app, 'Leaver');
      const res = await http().post('/api/auth/logout').set('Cookie', user.cookie).expect(204);
      expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).join()).toMatch(/ts_refresh=;/);
      await http().post('/api/auth/refresh').set('Cookie', user.cookie).expect(401);
    });

    it('rejects refresh without a cookie', async () => {
      await http().post('/api/auth/refresh').expect(401);
    });
  });
});
