import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export type PostgresSchema = typeof schema;

export type PostgresDatabase = PostgresJsDatabase<PostgresSchema>;

export type PostgresClientOptions = {
  readonly connectionString: string;
  readonly maxConnections?: number;
  readonly connectTimeoutSeconds?: number;
  readonly idleTimeoutSeconds?: number;
};

export type PostgresClient = {
  readonly db: PostgresDatabase;
  close(): Promise<void>;
};

const supabaseTransactionPoolerRequirements = { prepare: false } as const;

const defaultMaxConnections = 10;
const defaultConnectTimeoutSeconds = 10;
const defaultIdleTimeoutSeconds = 30;

export function createPostgresClient(options: PostgresClientOptions): PostgresClient {
  const sql = postgres(options.connectionString, {
    ...supabaseTransactionPoolerRequirements,
    max: options.maxConnections ?? defaultMaxConnections,
    connect_timeout: options.connectTimeoutSeconds ?? defaultConnectTimeoutSeconds,
    idle_timeout: options.idleTimeoutSeconds ?? defaultIdleTimeoutSeconds,
    onnotice: () => undefined,
  });
  return {
    db: drizzle(sql, { schema }),
    close: () => sql.end(),
  };
}
