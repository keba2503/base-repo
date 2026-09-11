import { scheduleFirstRetentionSweep } from "@base/application";
import { isOk, parseTenantId, type TenantId } from "@base/domain";
import { isModuleActive } from "../../../../architecture/modules";
import type { Container } from "./container";
import { platformTenantIdOf } from "./actor";

export function seedTenantIdOf(): TenantId {
  const tenantId = parseTenantId(platformTenantIdOf());
  if (!isOk(tenantId)) throw new Error("The platform tenant identifier is malformed");
  return tenantId.value;
}

export async function schedulePrivacyRetentionSweep(container: Container): Promise<void> {
  if (!isModuleActive("privacy")) return;
  await scheduleFirstRetentionSweep({
    jobs: container.jobQueue,
    tenantId: seedTenantIdOf(),
    clock: container.clock,
    sweepIntervalDays: 1,
  });
}
