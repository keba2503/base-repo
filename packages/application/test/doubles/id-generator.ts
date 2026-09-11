import { isOk, parseEntityId, type EntityId } from "@base/domain";
import type { IdGenerator } from "../../src/index";

export class CounterIdGenerator implements IdGenerator {
  #count = 0;

  next(): EntityId {
    const suffix = this.#count.toString(16).padStart(12, "0");
    const parsed = parseEntityId(`00000000-0000-4000-8000-${suffix}`);
    if (!isOk(parsed)) throw new Error("The counter id generator produced an invalid identifier");
    this.#count += 1;
    return parsed.value;
  }
}