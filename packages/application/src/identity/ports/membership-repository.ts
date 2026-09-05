import type { EntityId, Membership } from "@base/domain";

export type MembershipRepository = {
  findByUserId(userId: EntityId): Promise<readonly Membership[]>;
  save(membership: Membership): Promise<void>;
};
