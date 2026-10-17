export interface Env {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_DAYS: number;
  CORS_ORIGIN: string[];
  COOKIE_SECURE: boolean;
  AUTH_RATE_LIMIT: number;
}

/** Validates process.env at startup so a misconfigured server fails fast with a clear message. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const problems: string[] = [];
  const str = (key: string, fallback?: string): string => {
    const value = raw[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (fallback !== undefined) {
      return fallback;
    }
    problems.push(`${key} is required`);
    return '';
  };
  const int = (key: string, fallback: number, min: number): number => {
    const value = raw[key] === undefined || raw[key] === '' ? fallback : Number(raw[key]);
    if (!Number.isInteger(value) || value < min) {
      problems.push(`${key} must be an integer >= ${min}`);
    }
    return value;
  };

  const nodeEnv = str('NODE_ENV', 'development');
  const env: Env = {
    NODE_ENV: nodeEnv,
    PORT: int('PORT', 3000, 1),
    DATABASE_URL: str('DATABASE_URL'),
    JWT_SECRET: str('JWT_SECRET'),
    ACCESS_TOKEN_TTL_SECONDS: int('ACCESS_TOKEN_TTL_SECONDS', 900, 60),
    REFRESH_TOKEN_TTL_DAYS: int('REFRESH_TOKEN_TTL_DAYS', 30, 1),
    CORS_ORIGIN: str('CORS_ORIGIN', 'http://localhost:4200').split(',').map(o => o.trim()),
    COOKIE_SECURE: str('COOKIE_SECURE', nodeEnv === 'production' ? 'true' : 'false') === 'true',
    AUTH_RATE_LIMIT: int('AUTH_RATE_LIMIT', 10, 1),
  };

  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters');
  }
  if (problems.length) {
    throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return env;
}
