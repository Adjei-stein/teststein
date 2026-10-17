# Teststein API

NestJS 12 REST API. All routes are under `/api`.

## Running

From the repository root (see the [root README](../../README.md) for first-time setup):

```bash
npm run api                           # watch mode: recompiles and restarts on change
npm run build -w @teststein/api       # production build into dist/
npm start -w @teststein/api           # run the production build
```

Configuration comes from environment variables, or `apps/api/.env` in development
(copy [`.env.example`](.env.example)). The server refuses to start if something is missing or invalid.

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | required | Connects as the **non-owner** app role (`teststein_app`). The API refuses to start with a superuser or `BYPASSRLS` role, because that would switch off tenant isolation. |
| `JWT_SECRET` | required | At least 32 characters. |
| `PORT` | `3000` | |
| `CORS_ORIGIN` | `http://localhost:4200` | Comma-separated list. |
| `ACCESS_TOKEN_TTL_SECONDS` | `900` | Access token lifetime. |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Sign-in session lifetime. |
| `COOKIE_SECURE` | `true` in production | Set the `Secure` flag on the refresh cookie. |
| `AUTH_RATE_LIMIT` | `10` | Sign-in and sign-up attempts per minute per IP. |

`MIGRATION_DATABASE_URL` and `APP_DB_ROLE` in `.env` are used by `npm run db:migrate`, not by the API.

## Endpoints

| Method | Path | Who | |
|---|---|---|---|
| `GET` | `/api/health` | anyone | Database connectivity check |
| `POST` | `/api/auth/signup` | anyone | Create account + first organisation; signs in |
| `POST` | `/api/auth/login` | anyone | Sign in |
| `POST` | `/api/auth/refresh` | refresh cookie | New access token; rotates the refresh cookie |
| `POST` | `/api/auth/logout` | refresh cookie | Revoke this session |
| `GET` | `/api/auth/me` | signed in | Current user and their organisations |
| `GET` | `/api/orgs` | signed in | My organisations, with my role |
| `POST` | `/api/orgs` | signed in | Create an organisation (I become owner) |
| `GET` | `/api/orgs/:orgId` | member | |
| `GET` | `/api/orgs/:orgId/projects` | member | `?archived=true` includes archived |
| `GET` | `/api/orgs/:orgId/projects/:projectId` | member | |
| `POST` | `/api/orgs/:orgId/projects` | member+ | |
| `PATCH` | `/api/orgs/:orgId/projects/:projectId` | member+ | The project `key` can't change |
| `POST` | `/api/orgs/:orgId/projects/:projectId/archive` | admin+ | `/restore` to undo |

Roles, lowest to highest: `viewer`, `member`, `admin`, `owner`.

## How it works

**Authentication.** Sign-in returns a short-lived JWT access token in the body; send it as
`Authorization: Bearer <token>`. A refresh token is set as an `HttpOnly`, `SameSite=Strict`
cookie scoped to `/api/auth`, so page scripts can never read it. Each refresh rotates it. If an
old refresh token is replayed after it was rotated, the API assumes it was stolen and revokes
every session for that user. Passwords are hashed with scrypt.

**Tenant isolation.** Every route under `/orgs/:orgId` goes through `OrgAccessGuard`, which
checks membership and role. Non-members get `404`, so the API doesn't reveal which
organisations exist. Database work then runs through `DbService.tx({ userId, orgId }, …)`,
which sets `app.user_id` / `app.org_id` for PostgreSQL row-level security. Queries are
limited to the current organisation even if a `where` clause is forgotten.

**Errors.** Request bodies are validated with `class-validator`; unknown fields are rejected.
Database constraint violations become `400`/`409` responses with readable messages
([`pg-exception.filter.ts`](src/common/pg-exception.filter.ts)).

## Adding a feature module

1. Create `src/<feature>/` with a module, controller, service and DTOs. Add the module to `AppModule`.
   (`npx @nestjs/cli generate resource <name>` scaffolds this, but it needs Node 22.22+.)
2. Put org-scoped routes under `orgs/:orgId/...` with `@UseGuards(OrgAccessGuard)`, and use
   `@MinRole('member')` (or higher) on anything that writes.
3. Do database work inside `this.dbs.tx({ userId, orgId }, trx => …)` and record changes with `audit(trx, …)`.
4. Add the tables to [`database.types.ts`](src/database/database.types.ts).
5. Add e2e tests, including one proving another organisation can't reach the data.

## Tests

```bash
npm test -w @teststein/api              # unit tests
npm run test:e2e -w @teststein/api      # end-to-end tests
```

End-to-end tests boot the real app and need a migrated database. They read `DATABASE_URL`
(app role) and `MIGRATION_DATABASE_URL` (owner, used only to set up fixtures) from the
environment or `.env`. Tests need **Node 24.9+**, because Jest loads the ES-module NestJS packages with `require()`.
