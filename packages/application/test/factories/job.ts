import type { StoredJob } from "../../src/index";
import { tenantIdFactory } from "./actor";

export function storedJobFactory(overrides: Partial<StoredJob> = {}): StoredJob {
  return {
    id: "1",
    tenantId: tenantIdFactory(1),
    name: "reports.generate",
    payload: { reportId: "acme-report" },
    attempts: 0,
    maxAttempts: 5,
    ...overrides,
  };
}
