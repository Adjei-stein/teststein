import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { SignedUp, createApp, ownerClient, signup } from './helpers';

describe('Organisations and projects (e2e)', () => {
  let app: INestApplication<App>;
  let alice: SignedUp; // owner of org A
  let bob: SignedUp; // owner of org B, outsider to org A
  const http = () => request(app.getHttpServer());
  const as = (user: SignedUp) => ({
    get: (url: string) => http().get(url).set('Authorization', `Bearer ${user.token}`),
    post: (url: string, body?: object) => http().post(url).set('Authorization', `Bearer ${user.token}`).send(body),
    patch: (url: string, body: object) => http().patch(url).set('Authorization', `Bearer ${user.token}`).send(body),
  });
  const projectsUrl = (org: { id: string }) => `/api/orgs/${org.id}/projects`;
  const newProject = (overrides: object = {}) => ({
    key: 'SHOP',
    name: 'ShopInn Mobile App',
    description: 'Checkout and payments',
    appType: 'mobile',
    startDate: '2026-01-05',
    endDate: '2026-06-30',
    stakeholders: ['PM@Example.com', 'pm@example.com ', 'qa@example.com'],
    ...overrides,
  });

  beforeAll(async () => {
    app = await createApp();
    alice = await signup(app, 'Alice', 'Acme');
    bob = await signup(app, 'Bob', 'Globex');
  });
  afterAll(async () => {
    await app.close();
  });

  describe('projects', () => {
    let projectId: string;

    it('creates a project, normalising stakeholder emails', async () => {
      const res = await as(alice).post(projectsUrl(alice.organization), newProject()).expect(201);
      projectId = res.body.id;
      expect(res.body).toMatchObject({
        key: 'SHOP',
        name: 'ShopInn Mobile App',
        appType: 'mobile',
        startDate: '2026-01-05',
        endDate: '2026-06-30',
        stakeholders: ['pm@example.com', 'qa@example.com'],
        archivedAt: null,
      });
    });

    it('rejects a duplicate key in the same organisation', async () => {
      const res = await as(alice).post(projectsUrl(alice.organization), newProject({ name: 'Other' })).expect(409);
      expect(res.body.message).toBe('A project with this key already exists in this organisation.');
    });

    it('allows the same key in another organisation', async () => {
      await as(bob).post(projectsUrl(bob.organization), newProject()).expect(201);
    });

    it('validates the key and dates', async () => {
      const badKey = await as(alice).post(projectsUrl(alice.organization), newProject({ key: 'shop 1' })).expect(400);
      expect(badKey.body.message).toEqual([expect.stringContaining('key must be 2–10 characters')]);

      const badDates = await as(alice)
        .post(projectsUrl(alice.organization), newProject({ key: 'DATES', startDate: '2026-05-01', endDate: '2026-04-01' }))
        .expect(400);
      expect(badDates.body.message).toBe("End date can't be before the start date.");
    });

    it('lists and fetches projects', async () => {
      const list = await as(alice).get(projectsUrl(alice.organization)).expect(200);
      expect(list.body.map((p: { key: string }) => p.key)).toEqual(['SHOP']);
      await as(alice).get(`${projectsUrl(alice.organization)}/${projectId}`).expect(200);
    });

    it('updates fields and replaces stakeholders', async () => {
      const res = await as(alice)
        .patch(`${projectsUrl(alice.organization)}/${projectId}`, { name: 'ShopInn App', endDate: null, stakeholders: ['lead@example.com'] })
        .expect(200);
      expect(res.body).toMatchObject({ name: 'ShopInn App', endDate: null, stakeholders: ['lead@example.com'], key: 'SHOP' });
    });

    it('does not allow changing the key', async () => {
      await as(alice).patch(`${projectsUrl(alice.organization)}/${projectId}`, { key: 'NEW' }).expect(400);
    });

    it('archives and restores, hiding archived projects by default', async () => {
      const url = `${projectsUrl(alice.organization)}/${projectId}`;
      const archived = await as(alice).post(`${url}/archive`).expect(200);
      expect(archived.body.archivedAt).toEqual(expect.any(String));
      expect((await as(alice).get(projectsUrl(alice.organization)).expect(200)).body).toEqual([]);
      expect((await as(alice).get(`${projectsUrl(alice.organization)}?archived=true`).expect(200)).body).toHaveLength(1);

      const restored = await as(alice).post(`${url}/restore`).expect(200);
      expect(restored.body.archivedAt).toBeNull();
    });

    it('records an audit trail', async () => {
      const db = ownerClient();
      await db.connect();
      const { rows } = await db.query(
        `select action from audit_log where org_id = $1 order by id`,
        [alice.organization.id],
      );
      await db.end();
      expect(rows.map(r => r.action)).toEqual([
        'organization.created',
        'project.created',
        'project.updated',
        'project.archived',
        'project.restored',
      ]);
    });

    describe('tenant isolation', () => {
      it('hides another organisation entirely (404, not 403)', async () => {
        await as(bob).get(projectsUrl(alice.organization)).expect(404);
        await as(bob).get(`/api/orgs/${alice.organization.id}`).expect(404);
        await as(bob).post(projectsUrl(alice.organization), newProject({ key: 'HACK' })).expect(404);
        await as(bob).get(`/api/orgs/00000000-0000-0000-0000-000000000000/projects`).expect(404);
        await as(bob).get(`/api/orgs/not-a-uuid/projects`).expect(404);
      });

      it("can't reach another org's project through your own org's URL", async () => {
        // Row-level security hides Alice's project even though Bob is legitimately in org B.
        await as(bob).get(`${projectsUrl(bob.organization)}/${projectId}`).expect(404);
        await as(bob).patch(`${projectsUrl(bob.organization)}/${projectId}`, { name: 'pwned' }).expect(404);
        await as(bob).post(`${projectsUrl(bob.organization)}/${projectId}/archive`).expect(404);
        const list = await as(bob).get(projectsUrl(bob.organization)).expect(200);
        expect(list.body.every((p: { id: string }) => p.id !== projectId)).toBe(true);
      });
    });

    describe('roles', () => {
      beforeAll(async () => {
        // No invitation endpoint yet, so add Bob to org A as a viewer directly.
        const db = ownerClient();
        await db.connect();
        await db.query(`insert into org_members (org_id, user_id, role) values ($1, $2, 'viewer')`, [
          alice.organization.id,
          bob.user.id,
        ]);
        await db.end();
      });

      it('lets a viewer read but not write', async () => {
        await as(bob).get(projectsUrl(alice.organization)).expect(200);
        const res = await as(bob).post(projectsUrl(alice.organization), newProject({ key: 'VIEW' })).expect(403);
        expect(res.body.message).toBe('This needs the member role or higher.');
        await as(bob).patch(`${projectsUrl(alice.organization)}/${projectId}`, { name: 'x' }).expect(403);
        await as(bob).post(`${projectsUrl(alice.organization)}/${projectId}/archive`).expect(403);
      });

      it('shows the new membership in the org list', async () => {
        const res = await as(bob).get('/api/orgs').expect(200);
        expect(res.body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: alice.organization.id, role: 'viewer' }),
            expect.objectContaining({ id: bob.organization.id, role: 'owner' }),
          ]),
        );
      });
    });
  });

  describe('organisations', () => {
    it('creates more organisations, finding a free slug automatically', async () => {
      const res = await as(alice).post('/api/orgs', { name: 'Acme' }).expect(201);
      expect(res.body.slug).toMatch(/^acme(-[a-f0-9]{4})?$/);
      expect(res.body.id).not.toBe(alice.organization.id);
      expect(res.body.role).toBe('owner');
    });

    it('rejects a slug that is already taken', async () => {
      const res = await as(bob).post('/api/orgs', { name: 'Copycat', slug: alice.organization.slug }).expect(409);
      expect(res.body.message).toBe(`The address "${alice.organization.slug}" is already taken.`);
    });
  });
});
