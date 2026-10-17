import { randomBytes } from 'node:crypto';

/** Must match the CHECK on organizations.slug: 3–40 chars, a-z 0-9 and inner hyphens. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** "Acme Corp." → "acme-corp". Pads very short names so they still fit the pattern. */
export function slugify(name: string): string {
  let slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34)
    .replace(/-+$/g, '');
  if (slug.length < 3) {
    slug = `${slug || 'org'}-${randomSuffix()}`;
  }
  return slug;
}

/** "acme" → "acme-x7k2", used when a slug is taken. */
export function withSuffix(slug: string): string {
  return `${slug.slice(0, 34).replace(/-+$/g, '')}-${randomSuffix()}`;
}

function randomSuffix(): string {
  return randomBytes(3).toString('hex').slice(0, 4);
}
