import { ok, type EntityId } from "@base/domain";
import type { Clock } from "../../kernel/ports/clock";
import type { JobExecutor } from "../../jobs/job-executor";
import type { AnonymizableSource } from "../ports/anonymizable-source";

export const eraseSubjectDataJobName = "privacy.erasure.subject";

export type EraseSubjectDataPayload = {
  readonly subjectId: string;
};

export type EraseSubjectDataDependencies = {
  readonly sources: readonly AnonymizableSource[];
  readonly clock: Clock;
};

function isErasurePayload(payload: unknown): payload is EraseSubjectDataPayload {
  return typeof payload === "object" && payload !== null && typeof (payload as { subjectId?: unknown }).subjectId === "string";
}

export function anonymizationTokenFor(subjectId: string): string {
  return `erased-${subjectId}`;
}

export function eraseSubjectDataExecutor(dependencies: EraseSubjectDataDependencies): JobExecutor {
  const { sources, clock } = dependencies;

  return {
    jobName: eraseSubjectDataJobName,
    async execute(job) {
      if (!isErasurePayload(job.payload)) {
        return ok(undefined);
      }
      const subjectId = job.payload.subjectId as EntityId;
      const token = anonymizationTokenFor(job.payload.subjectId);
      const at = clock.now();
      for (const source of sources) {
        await source.anonymize(job.tenantId, subjectId, token, at);
      }
      return ok(undefined);
    },
  };
}
