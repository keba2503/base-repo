import type { Actor } from "../kernel/actor";

export type DispatchJobsRequest = {
  readonly actor: Actor;
  readonly limit: number;
};

export type DispatchJobsResponse = {
  readonly claimed: number;
  readonly completed: number;
  readonly failed: number;
  readonly unhandled: number;
  readonly exhausted: number;
};

export const jobQueueResource = "jobQueue";
export const dispatchJobsAction = "jobQueue:dispatch";

export const jobExecutorThrewCode = "jobQueue.executor.threw";
