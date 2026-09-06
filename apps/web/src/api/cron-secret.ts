import { createHash, timingSafeEqual } from "node:crypto";

const bearerPrefix = "Bearer ";

export function cronBearerTokenOf(authorization: string | null): string | undefined {
  if (authorization === null) return undefined;
  if (!authorization.startsWith(bearerPrefix)) return undefined;
  const token = authorization.slice(bearerPrefix.length).trim();
  return token.length > 0 ? token : undefined;
}

export function cronSecretsMatch(configured: string, provided: string): boolean {
  const expected = createHash("sha256").update(configured, "utf8").digest();
  const actual = createHash("sha256").update(provided, "utf8").digest();
  return timingSafeEqual(expected, actual);
}
