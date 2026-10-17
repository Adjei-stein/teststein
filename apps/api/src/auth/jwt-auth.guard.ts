import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppRequest, IS_PUBLIC } from '../common/request-context';

interface AccessTokenPayload {
  sub: string;
  email: string;
}

/** Global guard: every route needs a valid `Authorization: Bearer <access token>` unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AppRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Sign in to continue.');
    }
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
  }
}
