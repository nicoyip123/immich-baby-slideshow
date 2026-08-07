import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const SCRYPT_SALT_BYTES = 16;
export const SCRYPT_KEY_BYTES = 64;
export const SCRYPT_HASH_PREFIX = "scrypt";

/**
 * A 77 ms derivation on the deployment container with approximately 32 MiB of
 * working memory. The 64 MiB limit leaves allocator headroom while bounding
 * concurrent, rate-limited home-server login attempts.
 */
export const SCRYPT_OPTIONS = Object.freeze({
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
});

export interface StoredPasswordHash {
  salt: Buffer;
  key: Buffer;
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_BYTES, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function decodeSegment(value: string, expectedLength: number): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === expectedLength && decoded.toString("base64url") === value ? decoded : undefined;
}

/** Parses the fixed, canonical scrypt$<salt>$<key> storage format without deriving a key. */
export function parseStoredPasswordHash(storedHash: string): StoredPasswordHash | undefined {
  const [algorithm, encodedSalt, encodedKey, ...extra] = storedHash.split("$");
  if (algorithm !== SCRYPT_HASH_PREFIX || !encodedSalt || !encodedKey || extra.length > 0) return undefined;

  const salt = decodeSegment(encodedSalt, SCRYPT_SALT_BYTES);
  const key = decodeSegment(encodedKey, SCRYPT_KEY_BYTES);
  return salt && key ? { salt, key } : undefined;
}

export function isStoredPasswordHash(storedHash: string): boolean {
  return parseStoredPasswordHash(storedHash) !== undefined;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) throw new Error("Password must not be empty");

  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derivedKey = await deriveKey(password, salt);
  return `${SCRYPT_HASH_PREFIX}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parsedHash = parseStoredPasswordHash(storedHash);
    if (!parsedHash) return false;

    const actualKey = await deriveKey(password, parsedHash.salt);
    return timingSafeEqual(actualKey, parsedHash.key);
  } catch {
    return false;
  }
}
