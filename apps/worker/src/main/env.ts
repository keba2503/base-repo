import { z } from "zod";
import { assertModuleGraphIsValid, isModuleActive } from "../../../../architecture/modules";

export const moduleEnvVariables = {
  documents: [
    ["supabaseUrl", "SUPABASE_URL"],
    ["supabaseServiceRoleKey", "SUPABASE_SERVICE_ROLE_KEY"],
  ],
  notifications: [["resendApiKey", "RESEND_API_KEY"]],
  persistence: [
    ["databaseUrl", "DATABASE_URL"],
    ["fieldEncryptionKeys", "FIELD_ENCRYPTION_KEYS"],
  ],
  observability: [["sentryDsn", "SENTRY_DSN"]],
} as const;

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
    if (value.nodeEnv === "production" && value.sentryDsn === undefined) {
      context.addIssue({
        code: "custom",
        path: ["sentryDsn"],
        message:
          "SENTRY_DSN is required in production: without it every job keeps answering while nothing is exported, with only a boot warning as the symptom",
      });
    }

    if (value.nodeEnv === "test") return;

    if (isModuleActive("documents")) {
      const supabaseUrlSet = value.supabaseUrl !== undefined;
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
