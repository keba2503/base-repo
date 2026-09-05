import { z } from "zod";

const environmentSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  defaultLocale: z.string().min(2).default("es-ES"),
});

export type Environment = z.infer<typeof environmentSchema>;

export const env: Environment = environmentSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  defaultLocale: process.env.DEFAULT_LOCALE,
});

export const isDevelopment = env.nodeEnv === "development";
