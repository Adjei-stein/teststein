# Teststein

Open-source test management with remote test execution and API testing.

- **Test management:** projects, suites, test cases, manual and automated runs.
- **Script repository:** upload test scripts or connect a Git repo.
- **Remote execution:** run Selenium, Appium, Playwright, Cypress, pytest, Mocha, JUnit/TestNG and Locust jobs on runners.
- **API testing:** functional request collections and load tests.

> Early development. The web UI uses mock data; the API currently covers sign-in, organisations and projects.

## Repository layout

| Path | What |
|---|---|
| [`apps/web`](apps/web) | Angular 19 web app |
| [`apps/api`](apps/api) | NestJS 12 REST API ([README](apps/api/README.md)) |
| [`db`](db) | PostgreSQL migrations, migration runner and schema tests ([README](db/README.md)) |
| [`packages/spec`](packages/spec) | The `teststein.yml` job format: [reference](packages/spec/teststein-yml.md), JSON Schema, examples |
| [`deploy`](deploy) | Local services (docker-compose) |

It's an npm workspace: run `npm install` once at the root.

## Getting started

Prerequisites: **Node.js 24** (see [`.nvmrc`](.nvmrc); `nvm use` picks it up) and Docker, for PostgreSQL.

```bash
npm install
docker compose -f deploy/docker-compose.yml up -d    # PostgreSQL 16 on localhost:5432
cp apps/api/.env.example apps/api/.env              # then set JWT_SECRET
npm run db:migrate                                   # apply db/migrations
npm run api                                          # API on http://localhost:3000/api
npm run web                                          # web app on http://localhost:4200
```

## Tests

| Command | What it checks |
|---|---|
| `npm test -w @teststein/api` | API unit tests |
| `npm run test:e2e -w @teststein/api` | API end-to-end tests against PostgreSQL (needs the database running and migrated) |
| `npm test -w @teststein/db` | Migrations, constraints and row-level security, in an in-process Postgres |
| `npm test -w @teststein/spec` | `teststein.yml` examples against the JSON Schema |
| `npm run build -w @teststein/web` | Web app compiles |

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of these on every push and pull request.

## License

To be decided.
