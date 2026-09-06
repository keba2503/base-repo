import { z } from "zod";

const requiredInProduction = [
  ["databaseUrl", "DATABASE_URL"],
  ["fieldEncryptionKeys", "FIELD_ENCRYPTION_KEYS"],
  ["resendApiKey", "RESEND_API_KEY"],
  ["supabaseUrl", "SUPABASE_URL"],
  ["supabaseServiceRoleKey", "SUPABASE_SERVICE_ROLE_KEY"],
] as const;

const environmentSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    workerName: z.string().min(1).default("base-worker"),
    defaultLocale: z.string().min(2).default("es-ES"),
    appUrl: z.url().default("http://localhost:3000"),
    databaseUrl: z.url().optional(),
    supabaseUrl: z.url().optional(),
    supabaseServiceRoleKey: z.string().min(1).optional(),
    documentsBucket: z.string().min(1).default("documents"),
    fieldEncryptionKeys: z.string().min(1).optional(),
    mailFrom: z.string().min(3).default("Base <onboarding@resend.dev>"),
    mailWelcomeTo: z.email().default("owner@example.com"),
    resendApiKey: z.string().min(1).optional(),
    resendTimeoutMs: z.coerce.number().int().positive().default(10_000),
    sentryDsn: z.url().optional(),
    outboxBatchSize: z.coerce.number().int().positive().max(500).default(50),
    outboxMaxAttempts: z.coerce.number().int().positive().default(5),
    outboxPollMs: z.coerce.number().int().positive().default(1_000),
    outboxMaxBackoffMs: z.coerce.number().int().positive().default(30_000),
    jobsBatchSize: z.coerce.number().int().positive().max(500).default(50),
    jobsPollMs: z.coerce.number().int().positive().default(1_000),
    jobsMaxBackoffMs: z.coerce.number().int().positive().default(30_000),
    allowEphemeralFieldEncryptionKey: z.stringbool().default(false),
  })
  .superRefine((value, context) => {
    if (value.nodeEnv === "production" && value.allowEphemeralFieldEncryptionKey) {
      context.addIssue({
        code: "custom",
        path: ["allowEphemeralFieldEncryptionKey"],
        message: "ALLOW_EPHEMERAL_FIELD_ENCRYPTION_KEY must never be set in production",
      });
    }
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
  workerName: process.env.WORKER_NAME,
  defaultLocale: process.env.DEFAULT_LOCALE,
  appUrl: process.env.APP_URL,
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  documentsBucket: process.env.DOCUMENTS_BUCKET,
  fieldEncryptionKeys: process.env.FIELD_ENCRYPTION_KEYS,
  mailFrom: process.env.MAIL_FROM,
  mailWelcomeTo: process.env.MAIL_WELCOME_TO,
  resendApiKey: process.env.RESEND_API_KEY,
  resendTimeoutMs: process.env.RESEND_TIMEOUT_MS,
  sentryDsn: process.env.SENTRY_DSN,
  outboxBatchSize: process.env.OUTBOX_BATCH_SIZE,
  outboxMaxAttempts: process.env.OUTBOX_MAX_ATTEMPTS,
  outboxPollMs: process.env.OUTBOX_POLL_MS,
  outboxMaxBackoffMs: process.env.OUTBOX_MAX_BACKOFF_MS,
  jobsBatchSize: process.env.JOBS_BATCH_SIZE,
  jobsPollMs: process.env.JOBS_POLL_MS,
  jobsMaxBackoffMs: process.env.JOBS_MAX_BACKOFF_MS,
  allowEphemeralFieldEncryptionKey: process.env.ALLOW_EPHEMERAL_FIELD_ENCRYPTION_KEY,
});
