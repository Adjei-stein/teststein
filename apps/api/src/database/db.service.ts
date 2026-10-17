import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CamelCasePlugin, Kysely, PostgresDialect, Transaction, sql } from 'kysely';
import pg from 'pg';
import type { Env } from '../config/env';
import type { Database } from './database.types';

// Return `date` columns as plain 'YYYY-MM-DD' strings instead of midnight-UTC Date objects.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, value => value);

/** Who is acting, and in which organisation. Drives row-level security. */
export interface TenantContext {
  userId: string;
  orgId?: string;
}

export type Trx = Transaction<Database>;

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  /**
   * Use only for tables without row-level security (users, user_sessions) or for
   * health checks. Everything tenant-owned goes through `tx`.
   */
  readonly db: Kysely<Database>;

  constructor(config: ConfigService<Env, true>) {
    this.db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: config.get('DATABASE_URL', { infer: true }), max: 10 }),
      }),
      plugins: [new CamelCasePlugin()],
    });
  }

  /**
   * Runs `fn` in a transaction with the RLS context set, so every query inside is
   * limited to what this user may see in this organisation.
   */
  tx<T>(ctx: TenantContext, fn: (trx: Trx) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(async trx => {
      // set_config(..., true) is SET LOCAL: it ends with the transaction and can take bind parameters.
      await sql`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.org_id', ${ctx.orgId ?? ''}, true)`.execute(trx);
      return fn(trx);
    });
  }

  /**
   * Tenant isolation depends on row-level security, which superusers and BYPASSRLS
   * roles skip. Refuse to start rather than silently serve every org's data.
   */
  async onModuleInit() {
    const { rows } = await sql<{ role: string; rolsuper: boolean; rolbypassrls: boolean }>`
      select current_user as role, rolsuper, rolbypassrls from pg_roles where rolname = current_user`.execute(this.db);
    const role = rows[0];
    if (role && (role.rolsuper || role.rolbypassrls)) {
      throw new Error(
        `DATABASE_URL connects as "${role.role}", which bypasses row-level security. ` +
          'Use the non-owner app role (e.g. teststein_app) so tenants stay isolated.',
      );
    }
  }

  async onModuleDestroy() {
    await this.db.destroy();
  }
}
