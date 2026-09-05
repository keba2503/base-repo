import type { IdGenerator } from "@base/application";
import { isOk, parseEntityId, type EntityId } from "@base/domain";

function brand(value: string): EntityId {
  const parsed = parseEntityId(value);
  if (!isOk(parsed)) {
    throw new Error(`The identifier generator produced an invalid uuid: ${value}`);
  }
  return parsed.value;
}

export class SequentialIdGenerator implements IdGenerator {
  #issued = 0;

  next(): EntityId {
    this.#issued += 1;
    const suffix = this.#issued.toString(16).padStart(12, "0");
    return brand(`00000000-0000-4000-8000-${suffix}`);
  }
}

export class RandomIdGenerator implements IdGenerator {
  next(): EntityId {
    return brand(crypto.randomUUID());
  }
}
