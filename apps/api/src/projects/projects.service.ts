import { Injectable, NotFoundException } from '@nestjs/common';
import { audit } from '../database/audit';
import { DbService, TenantContext, Trx } from '../database/db.service';
import type { AppType } from '../database/database.types';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string;
  appType: AppType;
  startDate: string | null;
  endDate: string | null;
  stakeholders: string[];
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

const COLUMNS = [
  'id', 'key', 'name', 'description', 'appType', 'startDate', 'endDate', 'createdAt', 'updatedAt', 'archivedAt',
] as const;

/** All queries run under row-level security for ctx.orgId, so no explicit org filter can be forgotten. */
@Injectable()
export class ProjectsService {
  constructor(private readonly dbs: DbService) {}

  list(ctx: Required<TenantContext>, includeArchived: boolean): Promise<Project[]> {
    return this.dbs.tx(ctx, async trx => {
      let query = trx.selectFrom('projects').select(COLUMNS).orderBy('name');
      if (!includeArchived) {
        query = query.where('archivedAt', 'is', null);
      }
      const projects = await query.execute();
      const stakeholders = await this.stakeholdersFor(trx, projects.map(p => p.id));
      return projects.map(p => ({ ...p, stakeholders: stakeholders.get(p.id) ?? [] }));
    });
  }

  get(ctx: Required<TenantContext>, projectId: string): Promise<Project> {
    return this.dbs.tx(ctx, trx => this.load(trx, projectId));
  }

  create(ctx: Required<TenantContext>, dto: CreateProjectDto): Promise<Project> {
    return this.dbs.tx(ctx, async trx => {
      const { id } = await trx
        .insertInto('projects')
        .values({
          orgId: ctx.orgId,
          key: dto.key,
          name: dto.name,
          description: dto.description ?? '',
          appType: dto.appType,
          startDate: dto.startDate ?? null,
          endDate: dto.endDate ?? null,
          createdBy: ctx.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await this.replaceStakeholders(trx, ctx.orgId, id, dto.stakeholders ?? []);
      await audit(trx, { orgId: ctx.orgId, actorId: ctx.userId, action: 'project.created', entityType: 'project', entityId: id });
      return this.load(trx, id);
    });
  }

  update(ctx: Required<TenantContext>, projectId: string, dto: UpdateProjectDto): Promise<Project> {
    return this.dbs.tx(ctx, async trx => {
      const { stakeholders, ...fields } = dto;
      const changes = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (Object.keys(changes).length) {
        const updated = await trx.updateTable('projects').set(changes).where('id', '=', projectId).returning('id').executeTakeFirst();
        if (!updated) {
          throw new NotFoundException('Project not found.');
        }
      }
      if (stakeholders) {
        await this.load(trx, projectId); // 404 before touching stakeholders of a missing project
        await this.replaceStakeholders(trx, ctx.orgId, projectId, stakeholders);
      }
      await audit(trx, {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: 'project.updated',
        entityType: 'project',
        entityId: projectId,
        metadata: { fields: Object.keys(dto) },
      });
      return this.load(trx, projectId);
    });
  }

  /** Archive rather than delete: runs and results keep pointing at the project. */
  archive(ctx: Required<TenantContext>, projectId: string, archived: boolean): Promise<Project> {
    return this.dbs.tx(ctx, async trx => {
      const updated = await trx
        .updateTable('projects')
        .set({ archivedAt: archived ? new Date() : null })
        .where('id', '=', projectId)
        .returning('id')
        .executeTakeFirst();
      if (!updated) {
        throw new NotFoundException('Project not found.');
      }
      await audit(trx, {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: archived ? 'project.archived' : 'project.restored',
        entityType: 'project',
        entityId: projectId,
      });
      return this.load(trx, projectId);
    });
  }

  private async load(trx: Trx, projectId: string): Promise<Project> {
    const project = await trx.selectFrom('projects').select(COLUMNS).where('id', '=', projectId).executeTakeFirst();
    if (!project) {
      throw new NotFoundException('Project not found.');
    }
    const stakeholders = await this.stakeholdersFor(trx, [projectId]);
    return { ...project, stakeholders: stakeholders.get(projectId) ?? [] };
  }

  private async stakeholdersFor(trx: Trx, projectIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (!projectIds.length) {
      return result;
    }
    const rows = await trx
      .selectFrom('projectStakeholders')
      .select(['projectId', 'email'])
      .where('projectId', 'in', projectIds)
      .orderBy('email')
      .execute();
    for (const row of rows) {
      result.set(row.projectId, [...(result.get(row.projectId) ?? []), row.email]);
    }
    return result;
  }

  private async replaceStakeholders(trx: Trx, orgId: string, projectId: string, emails: string[]) {
    await trx.deleteFrom('projectStakeholders').where('projectId', '=', projectId).execute();
    if (emails.length) {
      await trx
        .insertInto('projectStakeholders')
        .values(emails.map(email => ({ orgId, projectId, email })))
        .execute();
    }
  }
}
