export type AnalyticsEventParams = Readonly<Record<string, string | number | boolean>>;

export type AnalyticsEvent = {
  readonly name: string;
  readonly clientId: string;
  readonly params?: AnalyticsEventParams;
};

export type Analytics = {
  track(event: AnalyticsEvent): Promise<void>;
};
