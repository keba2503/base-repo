import { z } from "zod";

const requiredInProduction = [
  ["databaseUrl", "DATABASE_URL"],
  ["supabaseUrl", "SUPABASE_URL"],
  ["supabaseAnonKey", "SUPABASE_ANON_KEY"],
  ["apiKeyPepper", "API_KEY_PEPPER"],
  ["resendApiKey", "RESEND_API_KEY"],
] as const;

const environmentSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    defaultLocale: z.string().min(2).default("es-ES"),
    appUrl: z.url().default("http://localhost:3000"),
    databaseUrl: z.url().optional(),
    supabaseUrl: z.url().optional(),
    supabaseAnonKey: z.string().min(1).optional(),
    apiKeyPepper: z.string().min(32).optional(),
    turnstileSecret: z.string().min(1).optional(),
    apiTitle: z.string().min(1).default("Base API"),
    apiVersion: z.string().min(1).default("1.0.0"),
    apiServerUrl: z.string().min(1).default("/api"),
    sessionCookieName: z.string().min(1).default("session"),
    mailFrom: z.string().min(3).default("Base <onboarding@resend.dev>"),
    mailWelcomeTo: z.email().default("owner@example.com"),
    resendApiKey: z.string().min(1).optional(),
    resendTimeoutMs: z.coerce.number().int().positive().default(10_000),
  })
  .superRefine((value, context) => {
    if (value.nodeEnv !== "production") return;
    for (const [name, variable] of requiredInProduction) {
      if (value[name] === undefined) {
        context.addIssue({ code: "custom", path: [name], message: `${variable} is required in production` });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export const env: Environment = environmentSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  defaultLocale: process.env.DEFAULT_LOCALE,
  appUrl: process.env.APP_URL,
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  apiKeyPepper: process.env.API_KEY_PEPPER,
  turnstileSecret: process.env.TURNSTILE_SECRET,
  apiTitle: process.env.API_TITLE,
  apiVersion: process.env.API_VERSION,
  apiServerUrl: process.env.API_SERVER_URL,
  sessionCookieName: process.env.SESSION_COOKIE_NAME,
  mailFrom: process.env.MAIL_FROM,
  mailWelcomeTo: process.env.MAIL_WELCOME_TO,
  resendApiKey: process.env.RESEND_API_KEY,
  resendTimeoutMs: process.env.RESEND_TIMEOUT_MS,
});

export const isDevelopment = env.nodeEnv === "development";

export const hasSupabase = env.supabaseUrl !== undefined && env.supabaseAnonKey !== undefined;
