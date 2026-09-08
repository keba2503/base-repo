import type { EntityId, Payment } from "@base/domain";

export type PaymentRepository = {
  findById(id: EntityId): Promise<Payment | undefined>;
  save(payment: Payment): Promise<void>;
};
