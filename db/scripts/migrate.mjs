// Applies db/migrations/*.sql in name order, each in its own transaction, and records
// them in schema_migrations. Run as the database owner:
//
//   MIGRATION_DATABASE_URL=postgres://owner@host/db APP_DB_ROLE=teststein_app npm run db:migrate
//
// After migrating, the API role (APP_DB_ROLE) is granted access to every table so it
// can work under row-level security without owning anything.
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('Set MIGRATION_DATABASE_URL (database owner) to run migrations.');
  process.exit(1);
}
const appRole = process.env.APP_DB_ROLE;
const dir = fileURLToPath(new URL('../migrations', import.meta.url));
const files = readdirSync(dir).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // Only one migrator at a time, e.g. when several API instances start together.
  await client.query(`select pg_advisory_lock(hashtext('teststein_migrations'))`);
  await client.query(`
    create table if not exists schema_migrations (
      name        text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )`);
  const applied = new Map(
    (await client.query('select name, checksum from schema_migrations')).rows.map(r => [r.name, r.checksum]),
  );

  let count = 0;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (applied.has(file)) {
      if (applied.get(file) !== checksum) {
        throw new Error(
          `${file} has changed since it was applied. Migrations are append-only once applied; ` +
          'add a new migration instead (or, before the first release, reset your development database).',
        );
      }
      continue;
    }
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [file, checksum]);
      await client.query('commit');
      console.log(`applied  ${file}`);
      count++;
    } catch (err) {
      await client.query('rollback');
      throw new Error(`${file} failed: ${err.message}`);
    }
  }

  if (appRole) {
    const role = client.escapeIdentifier(appRole);
    await client.query(`
      grant usage on schema public to ${role};
      grant select, insert, update, delete on all tables in schema public to ${role};
      grant usage, select on all sequences in schema public to ${role};
      revoke all on schema_migrations from ${role};`);
  }
  console.log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
} finally {
  await client.query(`select pg_advisory_unlock(hashtext('teststein_migrations'))`).catch(() => {});
  await client.end();
}
