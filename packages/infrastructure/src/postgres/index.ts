export {
  createPostgresClient,
  type PostgresClient,
  type PostgresClientOptions,
  type PostgresDatabase,
  type PostgresSchema,
} from "./client";
export { PostgresApiKeyRepository, PostgresMembershipRepository, PostgresUserRepository } from "./identity/index";
export { PostgresDocumentRepository } from "./documents/index";
export { PostgresConsentRepository } from "./privacy/index";
export { PostgresJobQueue } from "./jobs/index";
export { PostgresOutbox, outboxRowToEvent } from "./outbox";
export {
  apiKeys,
  consents,
  documents,
  jobs,
  memberships,
  outbox,
  tenantScopedColumns,
  tenants,
  users,
  type ApiKeyRow,
  type ConsentRow,
  type DocumentRow,
  type JobRow,
  type MembershipRow,
  type OutboxRow,
  type TenantRow,
  type TenantScopedColumns,
  type UserRow,
} from "./schema/index";
export { PostgresTenantRepository } from "./tenants/index";
export {
  applyTenantScope,
  runInTransaction,
  runScoped,
  tenantSettingName,
  type PostgresExecutor,
  type PostgresTransaction,
} from "./transaction-context";
export { PostgresUnitOfWork } from "./unit-of-work";
