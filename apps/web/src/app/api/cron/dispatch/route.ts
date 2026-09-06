import { handleCronDispatch } from "@/main/cron-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handleCronDispatch;
export const POST = handleCronDispatch;
