import type { Trx } from './db.service';

export interface AuditEntry {
  orgId: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/** Records an action in the org's audit log, inside the caller's transaction. */
export async function audit(trx: Trx, entry: AuditEntry): Promise<void> {
  await trx
    .insertInto('auditLog')
    .values({
      orgId: entry.orgId,
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    })
    .execute();
}
