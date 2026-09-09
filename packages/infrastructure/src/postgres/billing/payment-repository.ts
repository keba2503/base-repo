import type { PaymentRepository, TenantScope } from "@base/application";
import { and, eq, type SQL } from "drizzle-orm";
import { isOk, parseEntityId, parseTenantId, Payment, type EntityId, type PaymentSnapshot, type PaymentStatus } from "@base/domain";
import type { PostgresDatabase } from "../client";
import { payments, type PaymentRow } from "../schema/index";
import { runScoped, type PostgresExecutor } from "../transaction-context";

function hydrate(row: PaymentRow): Payment {
  const id = parseEntityId(row.id);
  const tenantId = parseTenantId(row.tenantId);
  const initiatedBy = parseEntityId(row.initiatedBy);
  if (!isOk(id) || !isOk(tenantId) || !isOk(initiatedBy)) {
    throw new Error(`A stored payment carries an invalid identifier: ${row.id}`);
  }
  const snapshot: PaymentSnapshot = {
    id: id.value,
    tenantId: tenantId.value,
    initiatedBy: initiatedBy.value,
    amountMinor: row.amountMinor,
    currency: row.currency,
    description: row.description,
    provider: row.provider,
    status: row.status as PaymentStatus,
    providerReference: row.providerReference,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    failureReason: row.failureReason,
  };
  const restored = Payment.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored payment violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class PostgresPaymentRepository implements PaymentRepository {
  readonly #db: PostgresDatabase;
  readonly #scope: TenantScope;

  constructor(db: PostgresDatabase, scope: TenantScope) {
    this.#db = db;
    this.#scope = scope;
  }

  #scopeFilter(): SQL | undefined {
    return this.#scope.kind === "tenant" ? eq(payments.tenantId, this.#scope.tenantId) : undefined;
  }

  #isVisible(tenantId: string): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === tenantId;
  }

  findById(id: EntityId): Promise<Payment | undefined> {
    return runScoped(this.#db, this.#scope, async (transaction: PostgresExecutor) => {
      const rows = await transaction
        .select()
        .from(payments)
        .where(and(eq(payments.id, id), this.#scopeFilter()))
        .limit(1);
      const row = rows[0];
      return row ? hydrate(row) : undefined;
    });
  }

  findByIdForWrite(id: EntityId): Promise<Payment | undefined> {
    return runScoped(this.#db, this.#scope, async (transaction: PostgresExecutor) => {
      const rows = await transaction
        .select()
        .from(payments)
        .where(and(eq(payments.id, id), this.#scopeFilter()))
        .limit(1)
        .for("update");
      const row = rows[0];
      return row ? hydrate(row) : undefined;
    });
  }

  async save(payment: Payment): Promise<void> {
    const snapshot = payment.toSnapshot();
    if (!this.#isVisible(snapshot.tenantId)) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    await runScoped(this.#db, this.#scope, async (transaction) => {
      await transaction
        .insert(payments)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          createdAt: snapshot.createdAt,
          initiatedBy: snapshot.initiatedBy,
          provider: snapshot.provider,
          amountMinor: snapshot.amountMinor,
          currency: snapshot.currency,
          description: snapshot.description,
          status: snapshot.status,
          providerReference: snapshot.providerReference,
          resolvedAt: snapshot.resolvedAt,
          failureReason: snapshot.failureReason,
        })
        .onConflictDoUpdate({
          target: payments.id,
          set: {
            status: snapshot.status,
            providerReference: snapshot.providerReference,
            resolvedAt: snapshot.resolvedAt,
            failureReason: snapshot.failureReason,
          },
        });
    });
  }
}
