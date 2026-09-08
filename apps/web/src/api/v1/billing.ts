import { startPaymentContract } from "@base/contracts";
import type { BillingControllers } from "../dependencies";
import type { RouteDefinition } from "../route-definition";

export function billingRoutes(controllers: BillingControllers): readonly RouteDefinition[] {
  return [
    {
      operationId: "startPayment",
      summary: "Start a payment with the payment provider",
      tag: "billing",
      method: "post",
      path: "/v1/payments",
      contract: startPaymentContract,
      inputLocation: "body",
      successStatus: 201,
      execute: async ({ actor, payload }) => controllers.startPayment({ actor, payload }),
    },
  ];
}
