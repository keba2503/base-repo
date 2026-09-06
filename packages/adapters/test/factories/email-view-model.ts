import type { EmailViewModel } from "../../src/index";

export function emailViewModelFactory(overrides: Partial<EmailViewModel> = {}): EmailViewModel {
  return {
    language: "en",
    subject: "Acme Clinic is created",
    headline: "Acme Clinic is ready.",
    paragraphs: ["Identifier: acme-clinic.", "Created on 15 January 2026."],
    actionLabel: "Open Acme Clinic",
    actionUrl: "https://app.example.com/tenants/acme-clinic",
    ...overrides,
  };
}
