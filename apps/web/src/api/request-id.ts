export const requestIdHeader = "X-Request-Id";

const acceptedRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdOf(request: Request): string {
  const provided = request.headers.get(requestIdHeader)?.trim() ?? "";
  return acceptedRequestId.test(provided) ? provided : crypto.randomUUID();
}

export function remoteAddressOf(request: Request): string {
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelForwarded !== undefined && vercelForwarded.length > 0) return vercelForwarded;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded !== undefined && forwarded.length > 0) return forwarded;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real !== undefined && real.length > 0) return real;
  return "unknown";
}
