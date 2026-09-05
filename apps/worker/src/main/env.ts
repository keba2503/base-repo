import { z } from "zod";

const environmentSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),
  workerName: z.string().min(1).default("base-worker"),
});

export type Environment = z.infer<typeof environmentSchema>;

export const env: Environment = environmentSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  workerName: process.env.WORKER_NAME,
});
