import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'kysely';
import { Public } from '../common/request-context';
import { DbService } from '../database/db.service';

@Controller('health')
@Public()
@SkipThrottle()
export class HealthController {
  constructor(private readonly dbs: DbService) {}

  /** For load balancers and container health checks. */
  @Get()
  async check() {
    try {
      await sql`select 1`.execute(this.dbs.db);
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
    return { status: 'ok', database: 'ok' };
  }
}
