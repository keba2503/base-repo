export type EmailViewModel = {
  readonly language: string;
  readonly subject: string;
  readonly headline: string;
  readonly paragraphs: readonly string[];
  readonly actionLabel: string;
  readonly actionUrl: string;
};
