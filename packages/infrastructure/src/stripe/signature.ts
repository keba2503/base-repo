import { createHmac, timingSafeEqual } from "node:crypto";

export const stripeSignatureToleranceSeconds = 300;

const digestLengthBytes = 32;

type ParsedSignatureHeader = {
  readonly timestampSeconds: number;
  readonly v1: string;
};

function parseSignatureHeader(signatureHeader: string): ParsedSignatureHeader | undefined {
  let timestampSeconds: number | undefined;
  let v1: string | undefined;
  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=");
    if (key === "t" && value !== undefined) timestampSeconds = Number(value);
    if (key === "v1" && value !== undefined) v1 = value;
  }
  if (timestampSeconds === undefined || !Number.isFinite(timestampSeconds) || v1 === undefined) return undefined;
  return { timestampSeconds, v1 };
}

function digestOf(secret: string, timestampSeconds: number, rawBody: string): Buffer {
  return createHmac("sha256", secret).update(`${String(timestampSeconds)}.${rawBody}`).digest();
}

function normalized(digest: Buffer): Buffer {
  if (digest.length === digestLengthBytes) return digest;
  const fixed = Buffer.alloc(digestLengthBytes);
  digest.copy(fixed);
  return fixed;
}

function digestsMatch(expected: Buffer, candidate: Buffer): boolean {
  return timingSafeEqual(normalized(expected), normalized(candidate));
}

export type VerifyStripeSignatureRequest = {
  readonly signatureHeader: string;
  readonly rawBody: string;
  readonly secret: string;
  readonly receivedAt: Date;
};

export function verifyStripeSignature(request: VerifyStripeSignatureRequest): boolean {
  const parsed = parseSignatureHeader(request.signatureHeader);
  if (!parsed) return false;
  const expected = digestOf(request.secret, parsed.timestampSeconds, request.rawBody);
  const candidate = Buffer.from(parsed.v1, "hex");
  const signatureValid = digestsMatch(expected, candidate);
  const ageSeconds = Math.abs(request.receivedAt.getTime() / 1000 - parsed.timestampSeconds);
  const timestampValid = ageSeconds <= stripeSignatureToleranceSeconds;
  return signatureValid && timestampValid;
}
