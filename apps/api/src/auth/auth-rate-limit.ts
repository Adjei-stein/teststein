import { ExecutionContext, SetMetadata } from '@nestjs/common';

const AUTH_RATE_LIMITED = 'authRateLimited';

/** Applies the stricter `auth` throttler (AUTH_RATE_LIMIT per minute per IP) to a route. */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMITED, true);

/** `skipIf` for the `auth` throttler: only count routes marked with @AuthRateLimit(). */
export const notAuthRateLimited = (context: ExecutionContext): boolean =>
  !Reflect.getMetadata(AUTH_RATE_LIMITED, context.getHandler());
