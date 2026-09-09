import { handleStripeWebhook } from "@/main/stripe-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleStripeWebhook;
