import { isErr, ok, type DomainError, type Result } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { JobQueue } from "../kernel/ports/job-queue";
import type { Permissions } from "../kernel/ports/permissions";
import { exportSubjectDataJobName } from "./jobs/export-subject-data";
import { requestDataExportAction, privacyResource, type PrivacyJobAcceptedResponse, type RequestDataExportRequest } from "./models";

export type RequestDataExportDependencies = {
  readonly jobs: JobQueue;
  readonly permissions: Permissions;
};

export type RequestDataExport = (
  request: RequestDataExportRequest,
) => Promise<Result<PrivacyJobAcceptedResponse, DomainError>>;

export function requestDataExport(dependencies: RequestDataExportDependencies): RequestDataExport {
  const { jobs, permissions } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: requestDataExportAction,
      resource: privacyResource,
    });
    if (isErr(authorization)) return authorization;

    await jobs.enqueue({
      tenantId: request.actor.tenantId,
      name: exportSubjectDataJobName,
      payload: { subjectId: request.subjectId },
    });

    return ok({ accepted: true });
  };
}
