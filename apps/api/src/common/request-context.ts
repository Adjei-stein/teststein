import { ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { OrgRole } from '../database/database.types';

/** The signed-in user, set by JwtAuthGuard from the access token. */
export interface AuthUser {
  id: string;
  email: string;
}

/** The organisation from the `:orgId` route param, set by OrgAccessGuard after checking membership. */
export interface OrgContext {
  id: string;
  role: OrgRole;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  org?: OrgContext;
}

export const IS_PUBLIC = 'isPublic';
/** Skips authentication for a route (sign-in, sign-up, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (!user) {
    throw new Error('CurrentUser used on a route without authentication');
  }
  return user;
});

export const CurrentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgContext => {
  const org = ctx.switchToHttp().getRequest<AppRequest>().org;
  if (!org) {
    throw new Error('CurrentOrg used on a route without OrgAccessGuard');
  }
  return org;
});
