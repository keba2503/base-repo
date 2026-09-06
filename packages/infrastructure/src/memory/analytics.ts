import type { Analytics, AnalyticsEvent } from "@base/application";

export class InMemoryAnalytics implements Analytics {
  readonly #events: AnalyticsEvent[] = [];

  track(event: AnalyticsEvent): Promise<void> {
    this.#events.push(event);
    return Promise.resolve();
  }

  get events(): readonly AnalyticsEvent[] {
    return this.#events;
  }
}

export class NoopAnalytics implements Analytics {
  track(): Promise<void> {
    return Promise.resolve();
  }
}
