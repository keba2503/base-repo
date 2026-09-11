import { err, fieldsClassifiedAs, invariantViolation, isErr, ok, parseEntityId, type DomainError, type Result } from "@base/domain";
import type { FileStore } from "../../documents/ports/file-store";
import type { Clock } from "../../kernel/ports/clock";
import type { IdGenerator } from "../../kernel/ports/id-generator";
import type { Logger } from "../../kernel/ports/logger";
import type { JobExecutor } from "../../jobs/job-executor";
import type { SubjectDataSource } from "../ports/subject-data-source";

export const exportSubjectDataJobName = "privacy.export.subject";

export type ExportSubjectDataPayload = {
  readonly subjectId: string;
};

export type ExportSubjectDataDependencies = {
  readonly sources: readonly SubjectDataSource[];
  readonly exportStore: FileStore;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly tokens: IdGenerator;
};

function isExportPayload(payload: unknown): payload is ExportSubjectDataPayload {
  return typeof payload === "object" && payload !== null && typeof (payload as { subjectId?: unknown }).subjectId === "string";
}

export function composeSubjectExport(
  sources: readonly { readonly sourceName: string; readonly classifications: SubjectDataSource["classifications"]; readonly rows: readonly Readonly<Record<string, unknown>>[] }[],
): Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>> {
  const composed: Record<string, readonly Readonly<Record<string, unknown>>[]> = {};
  for (const source of sources) {
    const includedFields = new Set([
      ...fieldsClassifiedAs(source.classifications, "personal"),
      ...fieldsClassifiedAs(source.classifications, "sensitive"),
    ]);
    composed[source.sourceName] = source.rows.map((row) => {
      const picked: Record<string, unknown> = {};
      for (const field of includedFields) picked[field] = row[field];
      return picked;
    });
  }
  return composed;
}

export function exportSubjectDataExecutor(dependencies: ExportSubjectDataDependencies): JobExecutor {
  const { sources, exportStore, clock, logger, tokens } = dependencies;

  return {
    jobName: exportSubjectDataJobName,
    async execute(job): Promise<Result<void, DomainError>> {
      if (!isExportPayload(job.payload)) {
        return err(invariantViolation("privacy.export.payload.malformed", "A subject data export job must carry a subjectId"));
      }
      const subjectId = parseEntityId(job.payload.subjectId);
      if (isErr(subjectId)) {
        return err(invariantViolation("privacy.export.payload.malformed", "A subject data export job must carry a valid subjectId"));
      }
      const collected = await Promise.all(
        sources.map(async (source) => ({
          sourceName: source.sourceName,
          classifications: source.classifications,
          rows: await source.findAllForSubject(job.tenantId, subjectId.value),
        })),
      );
      const composed = composeSubjectExport(collected);
      const storageKey = `privacy-exports/${job.tenantId}/${String(clock.now().getTime())}-${tokens.next()}.json`;
      await exportStore.save({
        tenantId: job.tenantId,
        storageKey,
        contentType: "application/json",
        bytes: new TextEncoder().encode(JSON.stringify(composed)),
      });
      logger.info("subject data export composed", { jobId: job.id, exportStorageKey: storageKey });
      return ok(undefined);
    },
  };
}
