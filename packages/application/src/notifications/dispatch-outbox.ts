import { isErr, ok, unavailable, type DomainError, type Result } from "@base/domain";
import { authorize } from "../kernel/authorize";
import type { Logger } from "../kernel/ports/logger";
import type { Outbox, StoredEvent } from "../kernel/ports/outbox";
import type { Permissions } from "../kernel/ports/permissions";
import type { EventHandler } from "./event-handler";
import type { HandlerRegistry } from "./handler-registry";
import {
  dispatchOutboxAction,
  outboxResource,
  type DispatchOutboxRequest,
  type DispatchOutboxResponse,
} from "./models";

export type DispatchOutboxDependencies = {
  readonly outbox: Outbox;
  readonly handlers: HandlerRegistry;
  readonly permissions: Permissions;
  readonly logger: Logger;
};

export type DispatchOutbox = (
  request: DispatchOutboxRequest,
) => Promise<Result<DispatchOutboxResponse, DomainError>>;

type Disposition = "published" | "failed" | "unhandled" | "abandoned";

function failureOf(thrown: unknown): DomainError {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return unavailable("outbox.handler.threw", message);
}

async function runHandler(handler: EventHandler, stored: StoredEvent): Promise<DomainError | undefined> {
  try {
    const result = await handler.handle(stored.event);
    return isErr(result) ? result.error : undefined;
  } catch (thrown: unknown) {
    return failureOf(thrown);
  }
}

async function firstFailure(
  handlers: readonly EventHandler[],
  stored: StoredEvent,
): Promise<DomainError | undefined> {
  for (const handler of handlers) {
    const failure = await runHandler(handler, stored);
    if (failure) return failure;
  }
  return undefined;
}

export function dispatchOutbox(dependencies: DispatchOutboxDependencies): DispatchOutbox {
  const { outbox, handlers, permissions, logger } = dependencies;

  async function settle(stored: StoredEvent, maxAttempts: number): Promise<Disposition> {
    const { id, event, attempts } = stored;
    const fields = { eventId: id, eventName: event.name, attempts };

    if (attempts >= maxAttempts) {
      logger.error("outbox event abandoned after too many attempts", fields);
      await outbox.markPublished([id]);
      return "abandoned";
    }

    const matching = handlers.handlersFor(event.name);
    if (matching.length === 0) {
      logger.warn("outbox event has no handler", fields);
      await outbox.markPublished([id]);
      return "unhandled";
    }

    const failure = await firstFailure(matching, stored);
    if (failure) {
      logger.error("outbox event failed", { ...fields, code: failure.code, reason: failure.message });
      await outbox.markFailed([id]);
      return "failed";
    }

    await outbox.markPublished([id]);
    return "published";
  }

  return async (request) => {
    const authorization = await authorize({
      permissions,
      actor: request.actor,
      action: dispatchOutboxAction,
      resource: outboxResource,
    });
    if (isErr(authorization)) return authorization;

    const pulled = await outbox.pullUnpublished(request.limit);
    const counts: Record<Disposition, number> = { published: 0, failed: 0, unhandled: 0, abandoned: 0 };
    for (const stored of pulled) {
      const disposition = await settle(stored, request.maxAttempts);
      counts[disposition] += 1;
    }

    return ok({ pulled: pulled.length, ...counts });
  };
}
