import { Module } from '@nestjs/common';
import { OrgAccessGuard } from './org-access.guard';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';

@Module({
  controllers: [OrgsController],
  providers: [OrgsService, OrgAccessGuard],
  exports: [OrgsService, OrgAccessGuard],
})
export class OrgsModule {}
