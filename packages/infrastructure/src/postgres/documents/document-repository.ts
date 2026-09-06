import type { DocumentRepository, FieldCipher, TenantScope } from "@base/application";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { Document, isOk, parseEntityId, parseTenantId, type DocumentSnapshot, type DocumentStatus, type EntityId } from "@base/domain";
import type { PostgresDatabase } from "../client";
import { documents, type DocumentRow } from "../schema/index";
import { runScoped, type PostgresExecutor } from "../transaction-context";

async function hydrate(cipher: FieldCipher, row: DocumentRow): Promise<Document> {
  const id = parseEntityId(row.id);
  const tenantId = parseTenantId(row.tenantId);
  const uploadedBy = parseEntityId(row.uploadedBy);
  if (!isOk(id) || !isOk(tenantId) || !isOk(uploadedBy)) {
    throw new Error(`A stored document carries an invalid identifier: ${row.id}`);
  }
  const snapshot: DocumentSnapshot = {
    id: id.value,
    tenantId: tenantId.value,
    uploadedBy: uploadedBy.value,
    originalFilename: row.originalFilename,
    storageKey: row.storageKey,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    status: row.status as DocumentStatus,
    extractedText: row.extractedText === null ? null : await cipher.decrypt(row.extractedText),
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
  };
  const restored = Document.restore(snapshot);
  if (!isOk(restored)) {
    throw new Error(`A stored document violates its invariants: ${restored.error.code}`);
  }
  return restored.value;
}

export class PostgresDocumentRepository implements DocumentRepository {
  readonly #db: PostgresDatabase;
  readonly #scope: TenantScope;
  readonly #cipher: FieldCipher;

  constructor(db: PostgresDatabase, scope: TenantScope, cipher: FieldCipher) {
    this.#db = db;
    this.#scope = scope;
    this.#cipher = cipher;
  }

  #scopeFilter(): SQL | undefined {
    return this.#scope.kind === "tenant" ? eq(documents.tenantId, this.#scope.tenantId) : undefined;
  }

  #isVisible(tenantId: string): boolean {
    return this.#scope.kind === "registry" || this.#scope.tenantId === tenantId;
  }

  findById(id: EntityId): Promise<Document | undefined> {
    return runScoped(this.#db, this.#scope, async (transaction: PostgresExecutor) => {
      const rows = await transaction
        .select()
        .from(documents)
        .where(and(eq(documents.id, id), this.#scopeFilter()))
        .limit(1);
      const row = rows[0];
      return row ? await hydrate(this.#cipher, row) : undefined;
    });
  }

  list(request: { readonly limit: number }): Promise<readonly Document[]> {
    return runScoped(this.#db, this.#scope, async (transaction: PostgresExecutor) => {
      const rows = await transaction
        .select()
        .from(documents)
        .where(this.#scopeFilter())
        .orderBy(desc(documents.createdAt))
        .limit(request.limit);
      return Promise.all(rows.map((row) => hydrate(this.#cipher, row)));
    });
  }

  async save(document: Document): Promise<void> {
    const snapshot = document.toSnapshot();
    if (!this.#isVisible(snapshot.tenantId)) {
      throw new Error("A tenant scoped repository may not write outside its own tenant");
    }
    const encryptedExtractedText = snapshot.extractedText === null ? null : await this.#cipher.encrypt(snapshot.extractedText);
    await runScoped(this.#db, this.#scope, async (transaction) => {
      await transaction
        .insert(documents)
        .values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          createdAt: snapshot.createdAt,
          uploadedBy: snapshot.uploadedBy,
          originalFilename: snapshot.originalFilename,
          storageKey: snapshot.storageKey,
          contentType: snapshot.contentType,
          sizeBytes: snapshot.sizeBytes,
          status: snapshot.status,
          extractedText: encryptedExtractedText,
          failureReason: snapshot.failureReason,
          processedAt: snapshot.processedAt,
        })
        .onConflictDoUpdate({
          target: documents.id,
          set: {
            status: snapshot.status,
            extractedText: encryptedExtractedText,
            failureReason: snapshot.failureReason,
            processedAt: snapshot.processedAt,
          },
        });
    });
  }
}
