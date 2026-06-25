import { startProgressiveFindThreadJob } from "./find-runner-core";
import type { FindRecord } from "./find-in-thread";

interface WorkerRequest {
  records: FindRecord[];
  query: string;
  frameBudgetMs?: number;
  maxBatchSize?: number;
}

const workerScheduler = {
  now: () => Date.now(),
  schedule: (callback: () => void) => setTimeout(callback, 0),
  cancel: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
};

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  startProgressiveFindThreadJob({
    records: request.records,
    query: request.query,
    frameBudgetMs: request.frameBudgetMs,
    maxBatchSize: request.maxBatchSize,
    scheduler: workerScheduler,
    onProgress: (progress) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated Worker postMessage has no targetOrigin parameter.
      self.postMessage({ type: "progress", ...progress });
    },
    onComplete: (complete) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Dedicated Worker postMessage has no targetOrigin parameter.
      self.postMessage({ type: "complete", ...complete });
    },
  });
});
