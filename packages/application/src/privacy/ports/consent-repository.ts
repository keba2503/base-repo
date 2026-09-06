import type { Consent, ConsentCategory, EntityId } from "@base/domain";

export type ConsentRepository = {
  findActive(subjectId: EntityId, category: ConsentCategory): Promise<Consent | undefined>;
  findAllForSubject(subjectId: EntityId): Promise<readonly Consent[]>;
  save(consent: Consent): Promise<void>;
};
