import { isErr, ok, type DomainError, type Result } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { JobQueue } from "../kernel/ports/job-queue";
import type { Permissions } from "../kernel/ports/permissions";
import { eraseSubjectDataJobName } from "./jobs/erase-subject-data";
import { requestErasureAction, privacyResource, type PrivacyJobAcceptedResponse, type RequestErasureRequest } from "./models";

export type RequestErasureDependencies = {
  readonly jobs: JobQueue;
  readonly permissions: Permissions;
};

export type RequestErasure = (
  request: RequestErasureRequest,
) => Promise<Result<PrivacyJobAcceptedResponse, DomainError>>;

export function requestErasure(dependencies: RequestErasureDependencies): RequestErasure {
  const { jobs, permissions } = dependencies;

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: requestErasureAction,
      resource: privacyResource,
    });
    if (isErr(authorization)) return authorization;

    await jobs.enqueue({
      tenantId: request.actor.tenantId,
      name: eraseSubjectDataJobName,
      payload: { subjectId: request.subjectId },
    });

    return ok({ accepted: true });
  };
}
