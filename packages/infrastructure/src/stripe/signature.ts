import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const stripeSignatureToleranceSeconds = 300;

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

function fingerprint(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function digestsMatch(expected: string, candidate: string): boolean {
  return timingSafeEqual(fingerprint(expected), fingerprint(candidate));
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
  const expected = digestOf(request.secret, parsed.timestampSeconds, request.rawBody).toString("hex");
  const signatureValid = digestsMatch(expected, parsed.v1);
  const ageSeconds = Math.abs(request.receivedAt.getTime() / 1000 - parsed.timestampSeconds);
  const timestampValid = ageSeconds <= stripeSignatureToleranceSeconds;
  return signatureValid && timestampValid;
}
