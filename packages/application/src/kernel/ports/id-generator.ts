import type { EntityId } from "@base/domain";

export type IdGenerator = {
  next(): EntityId;
};
