import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$15$8$1$')).toBe(true);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('Correct horse battery staple', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same password'), hashPassword('same password')]);
    expect(a).not.toEqual(b);
  });

  it('rejects malformed stored values', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
  });
});
