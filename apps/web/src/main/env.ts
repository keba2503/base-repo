import { z } from "zod";
import { assertModuleGraphIsValid, isModuleActive } from "../../../../architecture/modules";

export const moduleEnvVariables = {
  identity: [
    ["supabaseUrl", "SUPABASE_URL"],
    ["supabaseAnonKey", "SUPABASE_ANON_KEY"],
    ["apiKeyPepper", "API_KEY_PEPPER"],
    ["turnstileSecret", "TURNSTILE_SECRET"],
  ],
  documents: [["supabaseServiceRoleKey", "SUPABASE_SERVICE_ROLE_KEY"]],
  notifications: [["resendApiKey", "RESEND_API_KEY"]],
  persistence: [
    ["databaseUrl", "DATABASE_URL"],
    ["fieldEncryptionKeys", "FIELD_ENCRYPTION_KEYS"],
  ],
  observability: [["sentryDsn", "SENTRY_DSN"]],
  cron: [["cronSecret", "CRON_SECRET"]],
  billing: [
    ["stripeSecretKey", "STRIPE_SECRET_KEY"],
    ["stripeWebhookSecret", "STRIPE_WEBHOOK_SECRET"],
  ],
} as const;

export const intentionallyOptionalEnvVariables = ["gtmContainerId", "gaMeasurementId", "gaApiSecret"] as const;

const isNextBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

const environmentSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    defaultLocale: z.string().min(2).default("es-ES"),
    appUrl: z.url().default("http://localhost:3000"),
    databaseUrl: z.url().optional(),
    supabaseUrl: z.url().optional(),
    supabaseAnonKey: z.string().min(1).optional(),
    supabaseServiceRoleKey: z.string().min(1).optional(),
    documentsBucket: z.string().min(1).default("documents"),
    apiKeyPepper: z.string().min(32).optional(),
    fieldEncryptionKeys: z.string().min(1).optional(),
    turnstileSecret: z.string().min(1).optional(),
    apiTitle: z.string().min(1).default("Base API"),
    apiVersion: z.string().min(1).default("1.0.0"),
    apiServerUrl: z.string().min(1).default("/api"),
    sessionCookieName: z.string().min(1).default("session"),
    mailFrom: z.string().min(3).default("Base <onboarding@resend.dev>"),
    mailWelcomeTo: z.email().default("owner@example.com"),
    resendApiKey: z.string().min(1).optional(),
    resendTimeoutMs: z.coerce.number().int().positive().default(10_000),
    sentryDsn: z.url().optional(),
    gtmContainerId: z.string().min(1).optional(),
    gaMeasurementId: z.string().min(1).optional(),
    gaApiSecret: z.string().min(1).optional(),
    allowInsecureDevActor: z.stringbool().default(false),
    allowEphemeralFieldEncryptionKey: z.stringbool().default(false),
    cronSecret: z.string().min(32).optional(),
    cronDispatchOutboxBatchSize: z.coerce.number().int().positive().max(500).default(25),
    cronDispatchOutboxMaxAttempts: z.coerce.number().int().positive().default(5),
    cronDispatchJobsBatchSize: z.coerce.number().int().positive().max(500).default(25),
    stripeSecretKey: z.string().min(1).optional(),
    stripeWebhookSecret: z.string().min(1).optional(),
    stripeTimeoutMs: z.coerce.number().int().positive().default(10_000),
  })
  .superRefine((value, context) => {
    if (isNextBuildPhase) return;
    if (value.nodeEnv === "production" && value.allowInsecureDevActor) {
      context.addIssue({
        code: "custom",
        path: ["allowInsecureDevActor"],
        message: "ALLOW_INSECURE_DEV_ACTOR must never be set in production",
      });
    }
    if (value.nodeEnv === "production" && value.allowEphemeralFieldEncryptionKey) {
      context.addIssue({
        code: "custom",
        path: ["allowEphemeralFieldEncryptionKey"],
        message: "ALLOW_EPHEMERAL_FIELD_ENCRYPTION_KEY must never be set in production",
      });
    }
    if (value.nodeEnv === "production" && value.apiKeyPepper === undefined) {
      context.addIssue({
        code: "custom",
        path: ["apiKeyPepper"],
        message:
          "API_KEY_PEPPER is required in production: without it api keys are hashed with InMemoryApiKeyHasher, a fast unsalted algorithm meant only for tests, and every key issued and stored is reversible by trivial brute force",
      });
    }
    if (value.nodeEnv === "production" && value.sentryDsn === undefined) {
      context.addIssue({
        code: "custom",
        path: ["sentryDsn"],
        message:
          "SENTRY_DSN is required in production: without it every request and job keeps answering while nothing is exported, with only a boot warning as the symptom",
      });
    }
    if (value.nodeEnv === "production" && value.turnstileSecret === undefined) {
      context.addIssue({
        code: "custom",
        path: ["turnstileSecret"],
        message:
          "TURNSTILE_SECRET is required in production: without it every human-verified operation fails closed, and nothing else signals why",
      });
    }
    if (value.nodeEnv === "production" && value.cronSecret === undefined) {
      context.addIssue({
        code: "custom",
        path: ["cronSecret"],
        message:
          "CRON_SECRET is required in production: without it the /api/cron/dispatch route has no shared secret to check the caller against, and it must fail closed rather than dispatch the outbox and job queue for anyone who finds the URL",
      });
    }

    if (value.nodeEnv === "test") return;

    const supabaseUrlSet = value.supabaseUrl !== undefined;
    const supabaseAnonKeySet = value.supabaseAnonKey !== undefined;
    if (supabaseUrlSet !== supabaseAnonKeySet) {
      const missing = supabaseUrlSet ? "supabaseAnonKey" : "supabaseUrl";
      const missingVariable = supabaseUrlSet ? "SUPABASE_ANON_KEY" : "SUPABASE_URL";
      const presentVariable = supabaseUrlSet ? "SUPABASE_URL" : "SUPABASE_ANON_KEY";
      context.addIssue({
        code: "custom",
        path: [missing],
        message: `${missingVariable} is required once ${presentVariable} is set: the identity module needs both to talk to Supabase`,
      });
    }

    if (isModuleActive("documents")) {
      const supabaseServiceRoleKeySet = value.supabaseServiceRoleKey !== undefined;
      if (supabaseUrlSet !== supabaseServiceRoleKeySet) {
        const missing = supabaseUrlSet ? "supabaseServiceRoleKey" : "supabaseUrl";
        const missingVariable = supabaseUrlSet ? "SUPABASE_SERVICE_ROLE_KEY" : "SUPABASE_URL";
        const presentVariable = supabaseUrlSet ? "SUPABASE_URL" : "SUPABASE_SERVICE_ROLE_KEY";
        context.addIssue({
          code: "custom",
          path: [missing],
          message: `${missingVariable} is required once ${presentVariable} is set: the documents module needs both to store files in Supabase`,
        });
      } else if (!supabaseUrlSet && value.nodeEnv === "production") {
        const unconfiguredMessage =
          "is required in production while the documents module is active: without it, uploaded files are stored in memory and lost on every restart. Deactivate documents in architecture/modules.json instead if you do not need file storage";
        context.addIssue({ code: "custom", path: ["supabaseUrl"], message: `SUPABASE_URL ${unconfiguredMessage}` });
        context.addIssue({
          code: "custom",
          path: ["supabaseServiceRoleKey"],
          message: `SUPABASE_SERVICE_ROLE_KEY ${unconfiguredMessage}`,
        });
      }
    }

    if (isModuleActive("notifications") && value.nodeEnv === "production" && value.resendApiKey === undefined) {
      context.addIssue({
        code: "custom",
        path: ["resendApiKey"],
        message:
          "RESEND_API_KEY is required in production while the notifications module is active: without it, mail is only logged to the console and never delivered. Deactivate notifications in architecture/modules.json instead if you do not need to send mail",
      });
    }

    if (isModuleActive("billing") && value.nodeEnv === "production") {
      if (value.stripeSecretKey === undefined) {
        context.addIssue({
          code: "custom",
          path: ["stripeSecretKey"],
          message:
            "STRIPE_SECRET_KEY is required in production while the billing module is active: without it no payment can be started and every provider notification is refused, so a payer can be charged with nothing recording it. Deactivate billing in architecture/modules.json instead if you do not need to take payments",
        });
      }
      if (value.stripeWebhookSecret === undefined) {
        context.addIssue({
          code: "custom",
          path: ["stripeWebhookSecret"],
          message:
            "STRIPE_WEBHOOK_SECRET is required in production while the billing module is active: without it no payment can be started and every provider notification is refused, so a payer can be charged with nothing recording it. Deactivate billing in architecture/modules.json instead if you do not need to take payments",
        });
      }
    }

    if (
      value.databaseUrl !== undefined &&
      value.fieldEncryptionKeys === undefined &&
      !value.allowEphemeralFieldEncryptionKey
    ) {
      context.addIssue({
        code: "custom",
        path: ["fieldEncryptionKeys"],
        message:
          "FIELD_ENCRYPTION_KEYS is required once DATABASE_URL is set: sensitive fields must never be written unencrypted to a real database. Set ALLOW_EPHEMERAL_FIELD_ENCRYPTION_KEY=true only for disposable local development against a real database",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

assertModuleGraphIsValid();

export const env: Environment = environmentSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  defaultLocale: process.env.DEFAULT_LOCALE,
  appUrl: process.env.APP_URL,
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  documentsBucket: process.env.DOCUMENTS_BUCKET,
  apiKeyPepper: process.env.API_KEY_PEPPER,
  fieldEncryptionKeys: process.env.FIELD_ENCRYPTION_KEYS,
  turnstileSecret: process.env.TURNSTILE_SECRET,
  apiTitle: process.env.API_TITLE,
  apiVersion: process.env.API_VERSION,
  apiServerUrl: process.env.API_SERVER_URL,
  sessionCookieName: process.env.SESSION_COOKIE_NAME,
  mailFrom: process.env.MAIL_FROM,
  mailWelcomeTo: process.env.MAIL_WELCOME_TO,
  resendApiKey: process.env.RESEND_API_KEY,
  resendTimeoutMs: process.env.RESEND_TIMEOUT_MS,
  sentryDsn: process.env.SENTRY_DSN,
  gtmContainerId: process.env.GTM_CONTAINER_ID,
  gaMeasurementId: process.env.GA_MEASUREMENT_ID,
  gaApiSecret: process.env.GA_API_SECRET,
  allowInsecureDevActor: process.env.ALLOW_INSECURE_DEV_ACTOR,
  allowEphemeralFieldEncryptionKey: process.env.ALLOW_EPHEMERAL_FIELD_ENCRYPTION_KEY,
  cronSecret: process.env.CRON_SECRET,
  cronDispatchOutboxBatchSize: process.env.CRON_DISPATCH_OUTBOX_BATCH_SIZE,
  cronDispatchOutboxMaxAttempts: process.env.CRON_DISPATCH_OUTBOX_MAX_ATTEMPTS,
  cronDispatchJobsBatchSize: process.env.CRON_DISPATCH_JOBS_BATCH_SIZE,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripeTimeoutMs: process.env.STRIPE_TIMEOUT_MS,
});

export const isDevelopment = env.nodeEnv === "development";

export const hasSupabase = env.supabaseUrl !== undefined && env.supabaseAnonKey !== undefined;
