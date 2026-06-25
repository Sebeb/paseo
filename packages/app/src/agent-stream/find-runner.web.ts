import {
  startProgressiveFindThreadJob,
  type FindThreadJob,
  type StartFindThreadJobInput,
} from "./find-runner-core";

const WORKER_TEXT_THRESHOLD = 200 * 1024;
const WORKER_RECORD_THRESHOLD = 500;

interface WorkerProgressMessage {
  type: "progress";
  matches: Parameters<StartFindThreadJobInput["onProgress"]>[0]["matches"];
  scannedRecordCount: number;
  totalRecordCount: number;
}

interface WorkerCompleteMessage {
  type: "complete";
  scannedRecordCount: number;
  totalRecordCount: number;
}

type WorkerMessage = WorkerProgressMessage | WorkerCompleteMessage;

export type {
  FindRunnerComplete,
  FindRunnerProgress,
  FindRunnerScheduler,
  FindThreadJob,
  StartFindThreadJobInput,
} from "./find-runner-core";

export function startFindThreadJob(input: StartFindThreadJobInput): FindThreadJob {
  if (!shouldUseWorker(input)) {
    return startProgressiveFindThreadJob(input);
  }

  const worker = createFindWorker();
  if (!worker) {
    return startProgressiveFindThreadJob(input);
  }

  let cancelled = false;
  let fallbackJob: FindThreadJob | null = null;
  const handleWorkerMessage = (event: MessageEvent<WorkerMessage>) => {
    if (cancelled) {
      return;
    }
    const message = event.data;
    if (message.type === "progress") {
      input.onProgress({
        matches: message.matches,
        scannedRecordCount: message.scannedRecordCount,
        totalRecordCount: message.totalRecordCount,
      });
      return;
    }
    input.onComplete({
      scannedRecordCount: message.scannedRecordCount,
      totalRecordCount: message.totalRecordCount,
    });
    worker.terminate();
  };
  const handleWorkerError = () => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    worker.terminate();
    fallbackJob = startProgressiveFindThreadJob(input);
  };
  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", handleWorkerError);
  // oxlint-disable unicorn/require-post-message-target-origin -- Dedicated Worker postMessage has no targetOrigin parameter.
  worker.postMessage({
    records: input.records,
    query: input.query,
    frameBudgetMs: input.frameBudgetMs,
    maxBatchSize: input.maxBatchSize,
  });
  // oxlint-enable unicorn/require-post-message-target-origin

  return {
    cancel() {
      cancelled = true;
      worker.terminate();
      worker.removeEventListener("message", handleWorkerMessage);
      worker.removeEventListener("error", handleWorkerError);
      fallbackJob?.cancel();
    },
  };
}

function shouldUseWorker(input: StartFindThreadJobInput): boolean {
  if (input.scheduler) {
    return false;
  }
  if (input.records.length >= WORKER_RECORD_THRESHOLD) {
    return true;
  }
  let totalTextLength = 0;
  for (const record of input.records) {
    totalTextLength += record.text.length;
    if (totalTextLength >= WORKER_TEXT_THRESHOLD) {
      return true;
    }
  }
  return false;
}

function createFindWorker(): Worker | null {
  if (typeof Worker !== "function") {
    return null;
  }
  try {
    return new Worker(new URL("./find-worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}
