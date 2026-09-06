import { fieldsClassifiedAs, ok, type EntityId } from "@base/domain";
import type { FileStore } from "../../documents/ports/file-store";
import type { Clock } from "../../kernel/ports/clock";
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
  const { sources, exportStore, clock, logger } = dependencies;

  return {
    jobName: exportSubjectDataJobName,
    async execute(job) {
      if (!isExportPayload(job.payload)) {
        return ok(undefined);
      }
      const subjectId = job.payload.subjectId as EntityId;
      const collected = await Promise.all(
        sources.map(async (source) => ({
          sourceName: source.sourceName,
          classifications: source.classifications,
          rows: await source.findAllForSubject(job.tenantId, subjectId),
        })),
      );
      const composed = composeSubjectExport(collected);
      const storageKey = `privacy-exports/${job.tenantId}/${subjectId}-${String(clock.now().getTime())}.json`;
      await exportStore.save({
        tenantId: job.tenantId,
        storageKey,
        contentType: "application/json",
        bytes: new TextEncoder().encode(JSON.stringify(composed)),
      });
      logger.info("subject data export composed", { jobId: job.id, subjectId, storageKey });
      return ok(undefined);
    },
  };
}
