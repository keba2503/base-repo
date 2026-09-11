import { err, invariantViolation, isErr, ok, parseEntityId, type DomainError, type Result } from "@base/domain";
import type { Clock } from "../../kernel/ports/clock";
import type { IdGenerator } from "../../kernel/ports/id-generator";
import type { JobExecutor } from "../../jobs/job-executor";
import type { AnonymizableSource } from "../ports/anonymizable-source";

export const eraseSubjectDataJobName = "privacy.erasure.subject";

export type EraseSubjectDataPayload = {
  readonly subjectId: string;
};

export type EraseSubjectDataDependencies = {
  readonly sources: readonly AnonymizableSource[];
  readonly clock: Clock;
  readonly tokens: IdGenerator;
};

export function anonymizationTokenFor(tokens: IdGenerator): string {
  return tokens.next();
}

function isErasurePayload(payload: unknown): payload is EraseSubjectDataPayload {
  return typeof payload === "object" && payload !== null && typeof (payload as { subjectId?: unknown }).subjectId === "string";
}

export function eraseSubjectDataExecutor(dependencies: EraseSubjectDataDependencies): JobExecutor {
  const { sources, clock, tokens } = dependencies;

  return {
    jobName: eraseSubjectDataJobName,
    async execute(job): Promise<Result<void, DomainError>> {
      if (!isErasurePayload(job.payload)) {
        return err(invariantViolation("privacy.erasure.payload.malformed", "A subject erasure job must carry a subjectId"));
      }
      const subjectId = parseEntityId(job.payload.subjectId);
      if (isErr(subjectId)) {
        return err(invariantViolation("privacy.erasure.payload.malformed", "A subject erasure job must carry a valid subjectId"));
      }
      const token = anonymizationTokenFor(tokens);
      const at = clock.now();
      for (const source of sources) {
        await source.anonymize(job.tenantId, subjectId.value, token, at);
      }
      return ok(undefined);
    },
  };
}
