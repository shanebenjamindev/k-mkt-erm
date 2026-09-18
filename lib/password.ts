import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, saltValue, keyValue] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltValue || !keyValue) return false;
  try {
    const expected = Buffer.from(keyValue, "base64url");
    const actual = await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}
