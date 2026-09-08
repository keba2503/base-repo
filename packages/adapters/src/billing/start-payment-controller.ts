import type { Actor, StartPayment, StartPaymentResponse } from "@base/application";
import { parseContractInput, startPaymentContract, type StartPaymentOutput } from "@base/contracts";
import { isErr } from "@base/domain";
import { failed, invalid, succeeded, type Outcome } from "../kernel/outcome";

export type StartPaymentCommand = {
  readonly actor: Actor;
  readonly payload: unknown;
};

export type StartPaymentController = (command: StartPaymentCommand) => Promise<Outcome<StartPaymentOutput>>;

function handoffOutputFrom(response: StartPaymentResponse): StartPaymentOutput["handoff"] {
  const handoff = response.handoff;
  if (handoff.kind === "redirect") {
    return {
      kind: "redirect",
      url: handoff.url,
      providerReference: handoff.providerReference,
      expiresAt: handoff.expiresAt.toISOString(),
    };
  }
  return {
    kind: "form",
    action: handoff.action,
    fields: handoff.fields,
    providerReference: handoff.providerReference,
    expiresAt: handoff.expiresAt.toISOString(),
  };
}

export function startPaymentController(useCase: StartPayment): StartPaymentController {
  return async (command) => {
    const parsed = parseContractInput(startPaymentContract, command.payload);
    if (parsed.kind === "invalid") return invalid(parsed.issues);

    const result = await useCase({
      actor: command.actor,
      amountMinor: parsed.input.amountMinor,
      currency: parsed.input.currency,
      description: parsed.input.description,
    });
    if (isErr(result)) return failed(result.error);

    return succeeded({
      paymentId: result.value.paymentId,
      status: result.value.status,
      amountMinor: parsed.input.amountMinor,
      currency: parsed.input.currency,
      handoff: handoffOutputFrom(result.value),
    });
  };
}
