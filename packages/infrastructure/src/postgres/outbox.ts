import type { Outbox, StoredEvent } from "@base/application";
import { asc, inArray, isNull, sql } from "drizzle-orm";
import { isOk, parseTenantId, type DomainEvent } from "@base/domain";
import type { PostgresDatabase } from "./client";
import { outbox, type OutboxRow } from "./schema/index";
import { runInTransaction } from "./transaction-context";

export function outboxRowToEvent(row: OutboxRow): DomainEvent {
  const tenantId = parseTenantId(row.tenantId);
  if (!isOk(tenantId)) {
    throw new Error(`A stored event carries an invalid tenant identifier: ${row.tenantId}`);
  }
  return { name: row.name, tenantId: tenantId.value, occurredAt: row.occurredAt, payload: row.payload };
}

function toStoredEvent(row: OutboxRow): StoredEvent {
  return { id: String(row.id), event: outboxRowToEvent(row), attempts: row.attempts };
}

function toRowIds(ids: readonly string[]): bigint[] {
  return ids.map((id) => BigInt(id));
}

export class PostgresOutbox implements Outbox {
  readonly #db: PostgresDatabase;

  constructor(db: PostgresDatabase) {
    this.#db = db;
  }

  async enqueue(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    await runInTransaction(this.#db, async (transaction) => {
      await transaction.insert(outbox).values(
        events.map((event) => ({
          tenantId: event.tenantId,
          name: event.name,
          occurredAt: event.occurredAt,
          payload: event.payload,
        })),
      );
    });
  }

  pullUnpublished(limit: number): Promise<readonly StoredEvent[]> {
    return runInTransaction(this.#db, async (transaction) => {
      const rows = await transaction
        .select()
        .from(outbox)
        .where(isNull(outbox.publishedAt))
        .orderBy(asc(outbox.id))
        .limit(limit)
        .for("update", { skipLocked: true });
      return rows.map(toStoredEvent);
    });
  }

  async markPublished(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await runInTransaction(this.#db, async (transaction) => {
      await transaction
        .update(outbox)
        .set({ publishedAt: sql`now()` })
        .where(inArray(outbox.id, toRowIds(ids)));
    });
  }

  async markFailed(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await runInTransaction(this.#db, async (transaction) => {
      await transaction
        .update(outbox)
        .set({ attempts: sql`${outbox.attempts} + 1` })
        .where(inArray(outbox.id, toRowIds(ids)));
    });
  }
}
