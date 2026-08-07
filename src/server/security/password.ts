import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const HASH_PREFIX = "scrypt";

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, (error, derivedKey) => {
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

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) throw new Error("Password must not be empty");

  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt);
  return `${HASH_PREFIX}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [algorithm, encodedSalt, encodedKey, ...extra] = storedHash.split("$");
    if (algorithm !== HASH_PREFIX || !encodedSalt || !encodedKey || extra.length > 0) return false;

    const salt = decodeSegment(encodedSalt, SALT_BYTES);
    const expectedKey = decodeSegment(encodedKey, KEY_BYTES);
    if (!salt || !expectedKey) return false;

    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
