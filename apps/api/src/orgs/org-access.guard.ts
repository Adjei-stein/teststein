import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { AppRequest } from '../common/request-context';
import type { OrgRole } from '../database/database.types';
import { OrgsService } from './orgs.service';

const RANK: Record<OrgRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
const MIN_ROLE = 'minOrgRole';

/** Lowest org role allowed on a route. Without it, any member (including viewers) may access. */
export const MinRole = (role: OrgRole) => SetMetadata(MIN_ROLE, role);

/**
 * For routes under /orgs/:orgId. Confirms the signed-in user belongs to the org and
 * sets request.org. Non-members get 404, so the API doesn't reveal which orgs exist.
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(
    private readonly orgs: OrgsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequest>();
    const orgId = request.params.orgId;
    if (!request.user || typeof orgId !== 'string' || !isUUID(orgId)) {
      throw new NotFoundException('Organisation not found.');
    }
    const role = await this.orgs.roleOf(request.user.id, orgId);
    if (!role) {
      throw new NotFoundException('Organisation not found.');
    }
    const required = this.reflector.getAllAndOverride<OrgRole | undefined>(MIN_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && RANK[role] < RANK[required]) {
      throw new ForbiddenException(`This needs the ${required} role or higher.`);
    }
    request.org = { id: orgId, role };
    return true;
  }
}
