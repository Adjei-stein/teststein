import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../config/env';
import { DbService } from '../database/db.service';
import { OrgSummary, OrgsService } from '../orgs/orgs.service';
import { LoginDto, SignupDto } from './dto/auth.dto';
import { getDummyHash, hashPassword, verifyPassword } from './password';

export interface ClientMeta {
  userAgent: string | null;
  ip: string | null;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
  /** Opaque; goes into the httpOnly cookie, never into the response body. */
  refreshToken: string;
}

/** A just-rotated token presented again within this window is treated as a race between
 *  two tabs, not as theft. */
const ROTATION_GRACE_MS = 10_000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly refreshTtlDays: number;

  constructor(
    private readonly dbs: DbService,
    private readonly orgs: OrgsService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtl = config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    this.refreshTtlDays = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }

  async signup(dto: SignupDto, meta: ClientMeta) {
    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();
    const orgId = randomUUID();
    const { user, organization } = await this.dbs.tx({ userId, orgId }, async trx => {
      const user = await trx
        .insertInto('users')
        .values({ id: userId, email: dto.email, name: dto.name, passwordHash, lastLoginAt: new Date() })
        .returning(['id', 'name', 'email'])
        .executeTakeFirstOrThrow();
      const organization = await this.orgs.createInTx(trx, { orgId, userId, name: dto.organizationName });
      return { user, organization };
    });
    return { user, organization, ...(await this.startSession(user, meta)) };
  }

  async login(dto: LoginDto, meta: ClientMeta) {
    const row = await this.dbs.db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'passwordHash'])
      .where('email', '=', dto.email)
      .executeTakeFirst();
    // Always run one hash verification so response time doesn't reveal whether the email exists.
    const valid = await verifyPassword(dto.password, row?.passwordHash ?? (await getDummyHash()));
    if (!row || !row.passwordHash || !valid) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    await this.dbs.db.updateTable('users').set({ lastLoginAt: new Date() }).where('id', '=', row.id).execute();
    const user: PublicUser = { id: row.id, name: row.name, email: row.email };
    return { user, ...(await this.startSession(user, meta)) };
  }

  /** Swaps a refresh token for a new access token and a new refresh token (rotation). */
  async refresh(refreshToken: string | undefined, meta: ClientMeta) {
    if (!refreshToken) {
      throw new UnauthorizedException('Sign in to continue.');
    }
    const session = await this.dbs.db
      .selectFrom('userSessions as s')
      .innerJoin('users as u', 'u.id', 's.userId')
      .select(['s.id', 's.userId', 's.expiresAt', 's.revokedAt', 'u.name', 'u.email'])
      .where('s.refreshTokenHash', '=', sha256(refreshToken))
      .executeTakeFirst();
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    if (session.revokedAt) {
      if (Date.now() - session.revokedAt.getTime() > ROTATION_GRACE_MS) {
        // A token that was rotated away long ago is being replayed: assume it was stolen.
        await this.revokeAllSessions(session.userId);
      }
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    // Conditional update, so two concurrent refreshes can't both rotate the same token.
    const claimed = await this.dbs.db
      .updateTable('userSessions')
      .set({ revokedAt: new Date(), lastUsedAt: new Date() })
      .where('id', '=', session.id)
      .where('revokedAt', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!claimed) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
    const user: PublicUser = { id: session.userId, name: session.name, email: session.email };
    const next = await this.startSession(user, meta);
    await this.dbs.db
      .updateTable('userSessions')
      .set({ replacedBy: next.sessionId })
      .where('id', '=', session.id)
      .execute();
    return { user, ...next };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    await this.dbs.db
      .updateTable('userSessions')
      .set({ revokedAt: new Date() })
      .where('refreshTokenHash', '=', sha256(refreshToken))
      .where('revokedAt', 'is', null)
      .execute();
  }

  async me(userId: string): Promise<{ user: PublicUser; organizations: OrgSummary[] }> {
    const user = await this.dbs.db
      .selectFrom('users')
      .select(['id', 'name', 'email'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user) {
      throw new UnauthorizedException('Sign in to continue.');
    }
    return { user, organizations: await this.orgs.listForUser(userId) };
  }

  private async startSession(user: PublicUser, meta: ClientMeta): Promise<SessionTokens & { sessionId: string }> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
    const session = await this.dbs.db
      .insertInto('userSessions')
      .values({
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
        ip: meta.ip,
        expiresAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email }, { expiresIn: this.accessTtl });
    return { accessToken, expiresIn: this.accessTtl, refreshToken, sessionId: session.id };
  }

  private async revokeAllSessions(userId: string): Promise<void> {
    await this.dbs.db
      .updateTable('userSessions')
      .set({ revokedAt: new Date() })
      .where('userId', '=', userId)
      .where('revokedAt', 'is', null)
      .execute();
  }
}
