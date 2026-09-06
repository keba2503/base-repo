export type OtlpEndpoint = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
};

const sentryOtlpVersion = 7;

export function sentryOtlpEndpointFrom(dsn: string): OtlpEndpoint {
  const parsed = new URL(dsn);
  const publicKey = parsed.username;
  if (publicKey.length === 0) {
    throw new Error("A Sentry DSN must carry a public key before the @");
  }
  const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
  const projectId = segments.at(-1);
  if (projectId === undefined) {
    throw new Error("A Sentry DSN must carry a project id as its last path segment");
  }
  const pathPrefix = segments.slice(0, -1).join("/");
  const path = pathPrefix.length > 0 ? `/${pathPrefix}` : "";
  return {
    url: `${parsed.origin}${path}/api/${projectId}/otlp/v1/traces`,
    headers: { "x-sentry-auth": `sentry sentry_version=${String(sentryOtlpVersion)}, sentry_key=${publicKey}` },
  };
}
