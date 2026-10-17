import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely table types, camelCased (CamelCasePlugin maps them to snake_case SQL).
 * Hand-written for the tables the API uses so far; once there are more, generate
 * them from a migrated database with kysely-codegen instead.
 */

/** A timestamp the database fills in by default. */
type CreatedAt = ColumnType<Date, never, never>;
type UpdatedAt = ColumnType<Date, never, Date>;
/** `date` columns are returned as 'YYYY-MM-DD' strings (see DbService). */
type DateString = string;

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';
export type AppType = 'web' | 'mobile' | 'api' | 'desktop';

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  passwordHash: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface OrganizationsTable {
  id: string;
  name: string;
  slug: string;
  plan: Generated<string>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  deletedAt: Date | null;
}

export interface OrgMembersTable {
  orgId: string;
  userId: string;
  role: OrgRole;
  joinedAt: Generated<Date>;
}

export interface ProjectsTable {
  id: Generated<string>;
  orgId: string;
  key: string;
  name: string;
  description: Generated<string>;
  appType: AppType;
  startDate: DateString | null;
  endDate: DateString | null;
  caseSeq: Generated<number>;
  runSeq: Generated<number>;
  createdBy: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  archivedAt: Date | null;
}

export interface ProjectStakeholdersTable {
  orgId: string;
  projectId: string;
  email: string;
}

export interface AuditLogTable {
  id: Generated<string>;
  orgId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Generated<Record<string, unknown>>;
  createdAt: CreatedAt;
}

export interface UserSessionsTable {
  id: Generated<string>;
  userId: string;
  refreshTokenHash: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: CreatedAt;
  lastUsedAt: Generated<Date>;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: string | null;
}

export interface Database {
  users: UsersTable;
  organizations: OrganizationsTable;
  orgMembers: OrgMembersTable;
  projects: ProjectsTable;
  projectStakeholders: ProjectStakeholdersTable;
  auditLog: AuditLogTable;
  userSessions: UserSessionsTable;
}
