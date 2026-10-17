import { Transform } from 'class-transformer';

/** Trims surrounding whitespace from string inputs before validation. */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Trims and lower-cases (emails). */
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
