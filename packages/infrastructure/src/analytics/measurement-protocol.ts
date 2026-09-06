import type { Analytics, AnalyticsEvent } from "@base/application";

export type MeasurementProtocolFetch = (url: string, init: RequestInit) => Promise<Response>;

export type MeasurementProtocolAnalyticsOptions = {
  readonly measurementId: string;
  readonly apiSecret: string;
  readonly timeoutMilliseconds: number;
  readonly fetchImpl?: MeasurementProtocolFetch;
  readonly endpoint?: string;
};

const defaultEndpoint = "https://www.google-analytics.com/mp/collect";

function withTimeout<Value>(pending: Promise<Value>, timeoutMilliseconds: number): Promise<Value> {
  return new Promise<Value>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`The analytics provider did not answer within ${String(timeoutMilliseconds)}ms`));
    }, timeoutMilliseconds);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (thrown: unknown) => {
        clearTimeout(timer);
        reject(thrown instanceof Error ? thrown : new Error(String(thrown)));
      },
    );
  });
}

export class MeasurementProtocolAnalytics implements Analytics {
  readonly #measurementId: string;
  readonly #apiSecret: string;
  readonly #timeoutMilliseconds: number;
  readonly #fetchImpl: MeasurementProtocolFetch;
  readonly #endpoint: string;

  constructor(options: MeasurementProtocolAnalyticsOptions) {
    this.#measurementId = options.measurementId;
    this.#apiSecret = options.apiSecret;
    this.#timeoutMilliseconds = options.timeoutMilliseconds;
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.#endpoint = options.endpoint ?? defaultEndpoint;
  }

  async track(event: AnalyticsEvent): Promise<void> {
    const url = `${this.#endpoint}?measurement_id=${this.#measurementId}&api_secret=${this.#apiSecret}`;
    const response = await withTimeout(
      this.#fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_id: event.clientId,
          events: [{ name: event.name, params: event.params ?? {} }],
        }),
      }),
      this.#timeoutMilliseconds,
    );
    if (!response.ok) {
      throw new Error(`The analytics provider rejected the event with status ${String(response.status)}`);
    }
  }
}
