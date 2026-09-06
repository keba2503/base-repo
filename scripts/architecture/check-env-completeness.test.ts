import { describe, expect, it } from "bun:test";
import { ungovernedOptionalVariables } from "./check-env-completeness";

const header = `
const moduleEnvVariables = {} as const;
import { z } from "zod";
`;

describe("ungovernedOptionalVariables", () => {
  it("flags an optional field with no rule and no explicit opt-out", () => {
    const source = `${header}
      const environmentSchema = z
        .object({
          apiKeyPepper: z.string().min(32).optional(),
        })
        .superRefine((value, context) => {
          if (value.nodeEnv === "test") return;
        });
      export const env = environmentSchema.parse({ apiKeyPepper: process.env.API_KEY_PEPPER });
    `;
    const result = ungovernedOptionalVariables("apps/web/src/main/env.ts", source);
    expect(result).toEqual([
      { file: "apps/web/src/main/env.ts", property: "apiKeyPepper", variable: "API_KEY_PEPPER" },
    ]);
  });

  it("does not flag an optional field referenced inside superRefine", () => {
    const source = `${header}
      const environmentSchema = z
        .object({
          sentryDsn: z.url().optional(),
        })
        .superRefine((value, context) => {
          if (value.nodeEnv === "production" && value.sentryDsn === undefined) {
            context.addIssue({ code: "custom", path: ["sentryDsn"], message: "required" });
          }
        });
      export const env = environmentSchema.parse({ sentryDsn: process.env.SENTRY_DSN });
    `;
    expect(ungovernedOptionalVariables("apps/web/src/main/env.ts", source)).toEqual([]);
  });

  it("does not flag an optional field declared intentionally optional", () => {
    const source = `${header}
      const intentionallyOptionalEnvVariables = ["resendApiKey"] as const;
      const environmentSchema = z
        .object({
          resendApiKey: z.string().min(1).optional(),
        })
        .superRefine((value, context) => {
          if (value.nodeEnv === "test") return;
        });
      export const env = environmentSchema.parse({ resendApiKey: process.env.RESEND_API_KEY });
    `;
    expect(ungovernedOptionalVariables("apps/web/src/main/env.ts", source)).toEqual([]);
  });

  it("does not flag a field with a default, only ones marked optional", () => {
    const source = `${header}
      const environmentSchema = z
        .object({
          mailFrom: z.string().min(3).default("Base <onboarding@resend.dev>"),
        })
        .superRefine((value, context) => {
          if (value.nodeEnv === "test") return;
        });
      export const env = environmentSchema.parse({ mailFrom: process.env.MAIL_FROM });
    `;
    expect(ungovernedOptionalVariables("apps/web/src/main/env.ts", source)).toEqual([]);
  });

  it("falls back to the property name when the parse call has no matching process.env read", () => {
    const source = `${header}
      const environmentSchema = z
        .object({
          apiKeyPepper: z.string().min(32).optional(),
        })
        .superRefine((value, context) => {});
      export const env = environmentSchema.parse({});
    `;
    const result = ungovernedOptionalVariables("apps/web/src/main/env.ts", source);
    expect(result).toEqual([
      { file: "apps/web/src/main/env.ts", property: "apiKeyPepper", variable: "apiKeyPepper" },
    ]);
  });

  it("finds nothing when there is no environmentSchema declaration", () => {
    expect(ungovernedOptionalVariables("apps/web/src/main/env.ts", "export const env = {};")).toEqual([]);
  });
});
