export type TurnstileVerdict = {
  readonly success: boolean;
  readonly errorCodes: readonly string[];
};

export type TurnstileClient = {
  siteverify(request: { readonly token: string; readonly remoteAddress?: string }): Promise<TurnstileVerdict>;
};

export type FetchImplementation = (input: string, init: RequestInit) => Promise<Response>;

export type TurnstileClientOptions = {
  readonly secret: string;
  readonly fetchImplementation?: FetchImplementation;
  readonly timeoutMilliseconds?: number;
  readonly endpoint?: string;
};

export const turnstileSiteverifyEndpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const defaultTimeoutMilliseconds = 5000;

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function verdictOf(payload: unknown): TurnstileVerdict {
  if (typeof payload !== "object" || payload === null) {
    return { success: false, errorCodes: ["malformed-response"] };
  }
  const record: Partial<Record<string, unknown>> = payload;
  const codes = record["error-codes"];
  return {
    success: record.success === true,
    errorCodes: isStringArray(codes) ? codes : [],
  };
}

export function createTurnstileClient(options: TurnstileClientOptions): TurnstileClient {
  const fetchImplementation = options.fetchImplementation ?? ((input, init) => fetch(input, init));
  const timeout = options.timeoutMilliseconds ?? defaultTimeoutMilliseconds;
  const endpoint = options.endpoint ?? turnstileSiteverifyEndpoint;

  return {
    async siteverify(request) {
      const form = new URLSearchParams({ secret: options.secret, response: request.token });
      if (request.remoteAddress !== undefined) form.set("remoteip", request.remoteAddress);
      const response = await fetchImplementation(endpoint, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) {
        return { success: false, errorCodes: [`http-${String(response.status)}`] };
      }
      return verdictOf(await response.json());
    },
  };
}
