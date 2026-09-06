import type { Email, EntityId, User } from "@base/domain";

export type UserRepository = {
  findById(id: EntityId): Promise<User | undefined>;
  findByEmail(email: Email): Promise<User | undefined>;
  save(user: User): Promise<void>;
};
