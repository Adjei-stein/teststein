import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { audit } from '../database/audit';
import { DbService, Trx } from '../database/db.service';
import type { OrgRole } from '../database/database.types';
import { slugify, withSuffix } from './slug';

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: OrgRole;
}

@Injectable()
export class OrgsService {
  constructor(private readonly dbs: DbService) {}

  /** Creates an organisation with the user as owner. */
  create(userId: string, name: string, slug?: string): Promise<OrgSummary> {
    const orgId = randomUUID();
    return this.dbs.tx({ userId, orgId }, trx => this.createInTx(trx, { orgId, userId, name, slug }));
  }

  /**
   * For callers that already hold a transaction (sign-up). The transaction's
   * app.org_id must already be `orgId`, or row-level security rejects the insert.
   */
  async createInTx(
    trx: Trx,
    input: { orgId: string; userId: string; name: string; slug?: string },
  ): Promise<OrgSummary> {
    let slug = input.slug ?? slugify(input.name);
    for (let attempt = 0; ; attempt++) {
      // ON CONFLICT DO NOTHING instead of catching the error: an error would abort the transaction.
      const org = await trx
        .insertInto('organizations')
        .values({ id: input.orgId, name: input.name, slug })
        .onConflict(oc => oc.column('slug').doNothing())
        .returning(['id', 'name', 'slug', 'plan'])
        .executeTakeFirst();
      if (org) {
        await trx.insertInto('orgMembers').values({ orgId: org.id, userId: input.userId, role: 'owner' }).execute();
        await audit(trx, {
          orgId: org.id,
          actorId: input.userId,
          action: 'organization.created',
          entityType: 'organization',
          entityId: org.id,
        });
        return { ...org, role: 'owner' };
      }
      if (input.slug) {
        throw new ConflictException(`The address "${input.slug}" is already taken.`);
      }
      if (attempt >= 5) {
        throw new ConflictException('Could not find a free address for this organisation. Choose a slug.');
      }
      slug = withSuffix(slugify(input.name));
    }
  }

  /** Organisations the user belongs to (row-level security allows this with only app.user_id set). */
  listForUser(userId: string): Promise<OrgSummary[]> {
    return this.dbs.tx({ userId }, trx =>
      trx
        .selectFrom('orgMembers as m')
        .innerJoin('organizations as o', 'o.id', 'm.orgId')
        .select(['o.id', 'o.name', 'o.slug', 'o.plan', 'm.role'])
        .where('m.userId', '=', userId)
        .where('o.deletedAt', 'is', null)
        .orderBy('o.name')
        .execute(),
    );
  }

  /** The user's role in an org, or undefined if they aren't a member (or it doesn't exist). */
  async roleOf(userId: string, orgId: string): Promise<OrgRole | undefined> {
    const row = await this.dbs.tx({ userId }, trx =>
      trx
        .selectFrom('orgMembers as m')
        .innerJoin('organizations as o', 'o.id', 'm.orgId')
        .select('m.role')
        .where('m.userId', '=', userId)
        .where('m.orgId', '=', orgId)
        .where('o.deletedAt', 'is', null)
        .executeTakeFirst(),
    );
    return row?.role;
  }

  get(userId: string, orgId: string) {
    return this.dbs.tx({ userId, orgId }, trx =>
      trx
        .selectFrom('organizations')
        .select(['id', 'name', 'slug', 'plan', 'createdAt'])
        .where('id', '=', orgId)
        .executeTakeFirstOrThrow(),
    );
  }
}
