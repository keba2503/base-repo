import { Resend } from "resend";
import type { ResendEmailClient } from "./mailer";

export type ResendClientOptions = {
  readonly apiKey: string;
};

export function createResendClient(options: ResendClientOptions): ResendEmailClient {
  return new Resend(options.apiKey);
}
