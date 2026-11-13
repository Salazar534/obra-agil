import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const COST: ScryptOptions = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, length: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, COST);
  return `scrypt$${COST.N}$${COST.r}$${COST.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: COST.maxmem,
  });
  return timingSafeEqual(actual, expected);
}

/** Spent on unknown emails so sign-in takes the same time whether or not the account exists. */
export const decoyHash = await hashPassword(randomBytes(12).toString("hex"));

export function newToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function sixDigitCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
