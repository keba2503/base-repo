import type { TenantScope } from "../tenant-scope";

export type UnitOfWork = {
  run<Value>(scope: TenantScope, work: () => Promise<Value>): Promise<Value>;
};
