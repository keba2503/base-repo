export {
  createPostgresClient,
  type PostgresClient,
  type PostgresClientOptions,
  type PostgresDatabase,
  type PostgresSchema,
} from "./client";
export { PostgresApiKeyRepository, PostgresMembershipRepository, PostgresUserRepository } from "./identity/index";
export { PostgresAuditTrail } from "./audit-trail";
export { PostgresPaymentRepository } from "./billing/index";
export { PostgresDocumentRepository } from "./documents/index";
export { PostgresConsentRepository } from "./privacy/index";
export { PostgresJobQueue } from "./jobs/index";
export { PostgresOutbox, outboxRowToEvent } from "./outbox";
export {
  apiKeys,
  auditLog,
  consents,
  documents,
  jobs,
  memberships,
  outbox,
  payments,
  tenantScopedColumns,
  tenants,
  users,
  type ApiKeyRow,
  type AuditLogRow,
  type ConsentRow,
  type DocumentRow,
  type JobRow,
  type MembershipRow,
  type OutboxRow,
  type PaymentRow,
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
