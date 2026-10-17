import { Body, Controller, Get, HttpCode, Param, ParseBoolPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentOrg, CurrentUser } from '../common/request-context';
import type { AuthUser, OrgContext } from '../common/request-context';
import { MinRole, OrgAccessGuard } from '../orgs/org-access.guard';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectsService } from './projects.service';

@Controller('orgs/:orgId/projects')
@UseGuards(OrgAccessGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @CurrentOrg() org: OrgContext,
    @Query('archived', new ParseBoolPipe({ optional: true })) archived?: boolean,
  ) {
    return this.projects.list({ userId: user.id, orgId: org.id }, archived ?? false);
  }

  @Get(':projectId')
  get(@CurrentUser() user: AuthUser, @CurrentOrg() org: OrgContext, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.get({ userId: user.id, orgId: org.id }, projectId);
  }

  @Post()
  @MinRole('member')
  create(@CurrentUser() user: AuthUser, @CurrentOrg() org: OrgContext, @Body() dto: CreateProjectDto) {
    return this.projects.create({ userId: user.id, orgId: org.id }, dto);
  }

  @Patch(':projectId')
  @MinRole('member')
  update(
    @CurrentUser() user: AuthUser,
    @CurrentOrg() org: OrgContext,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update({ userId: user.id, orgId: org.id }, projectId, dto);
  }

  @Post(':projectId/archive')
  @HttpCode(200)
  @MinRole('admin')
  archive(@CurrentUser() user: AuthUser, @CurrentOrg() org: OrgContext, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.archive({ userId: user.id, orgId: org.id }, projectId, true);
  }

  @Post(':projectId/restore')
  @HttpCode(200)
  @MinRole('admin')
  restore(@CurrentUser() user: AuthUser, @CurrentOrg() org: OrgContext, @Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.projects.archive({ userId: user.id, orgId: org.id }, projectId, false);
  }
}
