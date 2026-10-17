import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Env } from '../config/env';
import { CurrentUser, Public } from '../common/request-context';
import type { AppRequest, AuthUser } from '../common/request-context';
import { AuthRateLimit } from './auth-rate-limit';
import { AuthService, ClientMeta, SessionTokens } from './auth.service';
import { LoginDto, SignupDto } from './dto/auth.dto';

export const REFRESH_COOKIE = 'ts_refresh';

@Controller('auth')
export class AuthController {
  private readonly cookieSecure: boolean;
  private readonly refreshTtlDays: number;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookieSecure = config.get('COOKIE_SECURE', { infer: true });
    this.refreshTtlDays = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
  }

  @Public()
  @AuthRateLimit()
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, sessionId: _, ...result } = await this.auth.signup(dto, meta(req));
    this.setRefreshCookie(res, refreshToken);
    return result;
  }

  @Public()
  @AuthRateLimit()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const { refreshToken, sessionId: _, ...result } = await this.auth.login(dto, meta(req));
    this.setRefreshCookie(res, refreshToken);
    return result;
  }

  /** Called by the web app when the access token expires. Reads and rotates the cookie. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    try {
      const { refreshToken, sessionId: _, ...result } = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
      this.setRefreshCookie(res, refreshToken);
      return result;
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  private setRefreshCookie(res: Response, token: SessionTokens['refreshToken']) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.cookieSecure,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.refreshTtlDays * 24 * 60 * 60 * 1000,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: this.cookieSecure, sameSite: 'strict', path: '/api/auth' });
  }
}

function meta(req: AppRequest): ClientMeta {
  return { userAgent: req.headers['user-agent'] ?? null, ip: req.ip ?? null };
}
