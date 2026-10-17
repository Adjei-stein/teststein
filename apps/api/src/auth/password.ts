import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// scrypt (memory-hard) from Node's standard library: no native dependency to build.
// Parameters are stored with each hash so they can be raised later without breaking old hashes.
const LOG_N = 15; // N = 32768
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N: 2 ** logN, r, p, maxmem: MAX_MEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Returns `scrypt$<logN>$<r>$<p>$<salt>$<hash>` (base64url parts). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, LOG_N, R, P);
  return ['scrypt', LOG_N, R, P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, logN, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), Number(logN), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/** A real hash of a random password, verified against when an email doesn't exist so
 *  sign-in takes the same time either way (no account enumeration by timing). */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
