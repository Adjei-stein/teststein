// Defaults for e2e runs. DATABASE_URL (the non-owner app role) and MIGRATION_DATABASE_URL
// (the owner, used only for test fixtures) must point at a migrated database.
process.env.JWT_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
process.env.AUTH_RATE_LIMIT ??= '1000';
process.env.NODE_ENV ??= 'test';

for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
  if (!process.env[key]) {
    throw new Error(`${key} must be set for e2e tests (see apps/api/README.md).`);
  }
}
