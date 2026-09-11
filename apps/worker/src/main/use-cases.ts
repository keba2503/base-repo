import {
  dispatchJobs,
  dispatchOutbox,
  eraseSubjectDataExecutor,
  executorRegistry,
  exportSubjectDataExecutor,
  handlerRegistry,
  processDocument,
  retentionSweepExecutor,
  sendTenantWelcome,
  type DispatchJobsResponse,
  type DispatchOutboxResponse,
  type MailMessage,
  type RetentionPolicy,
  type TenantResponse,
} from "@base/application";
import { presentTenantWelcomeEmail, renderEmail } from "@base/adapters";
import { isErr } from "@base/domain";
export { defaultModuleActivation, isModuleActive, type ModuleActivation } from "../../../../architecture/modules";
import { defaultModuleActivation, isModuleActive, type ModuleActivation } from "../../../../architecture/modules";
import { workerActor } from "./actor";
import type { Container } from "./container";
import type { Environment } from "./env";

function presentWelcomeMessage(environment: Environment): (response: TenantResponse) => MailMessage {
  return (response) => {
    const viewModel = presentTenantWelcomeEmail({
      response,
      locale: environment.defaultLocale,
      appUrl: environment.appUrl,
    });
    const { html, text } = renderEmail(viewModel);
    return {
      to: environment.mailWelcomeTo,
      subject: viewModel.subject,
      html,
      text,
      tags: { category: "tenant-welcome" },
    };
  };
}

export type DispatchBatchOutcome =
  | { readonly refused: false; readonly counts: DispatchOutboxResponse }
  | { readonly refused: true; readonly code: string };

export function dispatchOutboxOperation(
  container: Container,
  environment: Environment,
  modules: ModuleActivation = defaultModuleActivation,
) {
  const handlers = handlerRegistry(
    isModuleActive("notifications", modules)
      ? [
          sendTenantWelcome({
            tenants: container.tenantRegistry,
            mailer: container.mailer,
            presentMessage: presentWelcomeMessage(environment),
          }),
        ]
      : [],
  );
  const dispatch = dispatchOutbox({
    outbox: container.outbox,
    handlers,
    permissions: container.permissions,
    logger: container.logger,
  });

  return async (limit: number, maxAttempts: number): Promise<DispatchBatchOutcome> => {
    const result = await dispatch({ actor: workerActor(), limit, maxAttempts });
    if (isErr(result)) return { refused: true, code: result.error.code };
    return { refused: false, counts: result.value };
  };
}

export type DispatchJobsOutcome =
  | { readonly refused: false; readonly counts: DispatchJobsResponse }
  | { readonly refused: true; readonly code: string };

export function dispatchJobsOperation(container: Container, modules: ModuleActivation = defaultModuleActivation) {
  const privacySweepIntervalDays = 1;
  const privacyRetentionPolicy: RetentionPolicy = { users: 365 };
  const dispatch = dispatchJobs({
    jobs: container.jobQueue,
    executors: executorRegistry([
      ...(isModuleActive("documents", modules)
        ? [
            processDocument({
              documentsScopedTo: (tenantId) => container.documentsScopedTo(tenantId),
              fileStore: container.fileStore,
              processor: container.documentProcessor,
              clock: container.clock,
              unitOfWork: container.unitOfWork,
            }),
          ]
        : []),
      ...(isModuleActive("privacy", modules)
        ? [
            eraseSubjectDataExecutor({
              sources: container.privacyAnonymizableSources,
              clock: container.clock,
              tokens: container.idGenerator,
            }),
            exportSubjectDataExecutor({
              sources: container.privacySubjectSources,
              exportStore: container.fileStore,
              clock: container.clock,
              logger: container.logger,
              tokens: container.idGenerator,
            }),
            retentionSweepExecutor({
              sources: container.privacyRetainableSources,
              policy: privacyRetentionPolicy,
              clock: container.clock,
              jobs: container.jobQueue,
              tokens: container.idGenerator,
              sweepIntervalDays: privacySweepIntervalDays,
            }),
          ]
        : []),
    ]),
    permissions: container.permissions,
    logger: container.logger,
    clock: container.clock,
    telemetry: container.telemetry,
  });

  return async (limit: number): Promise<DispatchJobsOutcome> => {
    const result = await dispatch({ actor: workerActor(), limit });
    if (isErr(result)) return { refused: true, code: result.error.code };
    return { refused: false, counts: result.value };
  };
}
