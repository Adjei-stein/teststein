import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentOrg, CurrentUser } from '../common/request-context';
import type { AuthUser, OrgContext } from '../common/request-context';
import { CreateOrgDto } from './dto/create-org.dto';
import { OrgAccessGuard } from './org-access.guard';
import { OrgsService } from './orgs.service';

@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orgs.listForUser(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgDto) {
    return this.orgs.create(user.id, dto.name, dto.slug);
  }

  @Get(':orgId')
  @UseGuards(OrgAccessGuard)
  async get(@CurrentUser() user: AuthUser, @CurrentOrg() org: OrgContext) {
    return { ...(await this.orgs.get(user.id, org.id)), role: org.role };
  }
}
