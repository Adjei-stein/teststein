import { SLUG_PATTERN, slugify, withSuffix } from './slug';

describe('slugify', () => {
  it.each([
    ['Acme Corp.', 'acme-corp'],
    ['  Café Déjà Vu  ', 'cafe-deja-vu'],
    ['QA & Testing -- Team', 'qa-testing-team'],
  ])('%s → %s', (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });

  it('always produces a valid slug', () => {
    for (const name of ['A', '!!', '中文', 'x'.repeat(200), 'ends with dash -']) {
      expect(slugify(name)).toMatch(SLUG_PATTERN);
      expect(withSuffix(slugify(name))).toMatch(SLUG_PATTERN);
    }
  });
});
