export type StripeFetchImplementation = (input: string, init: RequestInit) => Promise<Response>;

export type StripeClientOptions = {
  readonly secretKey: string;
  readonly fetchImplementation?: StripeFetchImplementation;
  readonly timeoutMilliseconds?: number;
  readonly baseUrl?: string;
};

export type StripeClient = {
  createCheckoutSession(idempotencyKey: string, form: URLSearchParams): Promise<Response>;
};

export const stripeApiVersion = "2024-06-20";

const stripeApiBaseUrl = "https://api.stripe.com";
const defaultTimeoutMilliseconds = 10_000;

export function createStripeClient(options: StripeClientOptions): StripeClient {
  const fetchImplementation = options.fetchImplementation ?? ((input, init) => fetch(input, init));
  const timeoutMilliseconds = options.timeoutMilliseconds ?? defaultTimeoutMilliseconds;
  const baseUrl = options.baseUrl ?? stripeApiBaseUrl;

  return {
    createCheckoutSession(idempotencyKey, form) {
      return fetchImplementation(`${baseUrl}/v1/checkout/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Version": stripeApiVersion,
          "Idempotency-Key": idempotencyKey,
        },
        body: form,
        signal: AbortSignal.timeout(timeoutMilliseconds),
      });
    },
  };
}
