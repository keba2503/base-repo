import type { Consent, ConsentCategory, EntityId, TenantId } from "@base/domain";
import type { AnonymizableSource, ConsentRepository, RetainableSource, SubjectDataRow, SubjectDataSource } from "../../src/index";

export class StubConsentRepository implements ConsentRepository {
  readonly #consents = new Map<string, Consent>();

  seed(consent: Consent): void {
    this.#consents.set(consent.id, consent);
  }

  findActive(subjectId: EntityId, category: ConsentCategory): Promise<Consent | undefined> {
    for (const consent of this.#consents.values()) {
      if (consent.subjectId === subjectId && consent.category === category && consent.isActive) {
        return Promise.resolve(consent);
      }
    }
    return Promise.resolve(undefined);
  }

  findAllForSubject(subjectId: EntityId): Promise<readonly Consent[]> {
    return Promise.resolve([...this.#consents.values()].filter((consent) => consent.subjectId === subjectId));
  }

  save(consent: Consent): Promise<void> {
    this.#consents.set(consent.id, consent);
    return Promise.resolve();
  }

  get saved(): readonly Consent[] {
    return [...this.#consents.values()];
  }
}

export class StubSubjectDataSource implements SubjectDataSource {
  readonly sourceName: string;
  readonly classifications: SubjectDataSource["classifications"];
  readonly #rowsBySubject: Map<string, readonly SubjectDataRow[]>;

  constructor(sourceName: string, classifications: SubjectDataSource["classifications"]) {
    this.sourceName = sourceName;
    this.classifications = classifications;
    this.#rowsBySubject = new Map();
  }

  seed(subjectId: EntityId, rows: readonly SubjectDataRow[]): void {
    this.#rowsBySubject.set(subjectId, rows);
  }

  findAllForSubject(_tenantId: TenantId, subjectId: EntityId): Promise<readonly SubjectDataRow[]> {
    return Promise.resolve(this.#rowsBySubject.get(subjectId) ?? []);
  }
}

export class StubAnonymizableSource implements AnonymizableSource {
  readonly sourceName: string;
  readonly calls: { readonly tenantId: TenantId; readonly subjectId: EntityId; readonly token: string; readonly at: Date }[] = [];

  constructor(sourceName: string) {
    this.sourceName = sourceName;
  }

  anonymize(tenantId: TenantId, subjectId: EntityId, token: string, at: Date): Promise<boolean> {
    this.calls.push({ tenantId, subjectId, token, at });
    return Promise.resolve(true);
  }
}

export class StubRetainableSource extends StubAnonymizableSource implements RetainableSource {
  #subjectsBefore: readonly EntityId[] = [];

  seedExpired(subjects: readonly EntityId[]): void {
    this.#subjectsBefore = subjects;
  }

  findSubjectsOlderThan(): Promise<readonly EntityId[]> {
    return Promise.resolve(this.#subjectsBefore);
  }
}
