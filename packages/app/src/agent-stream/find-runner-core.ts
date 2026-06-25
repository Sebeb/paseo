import {
  findNextMatchInRecord,
  normalizeFindQuery,
  type FindInThreadMatch,
  type FindRecord,
} from "./find-in-thread";

export interface FindRunnerProgress {
  matches: FindInThreadMatch[];
  scannedRecordCount: number;
  totalRecordCount: number;
}

export interface FindRunnerComplete {
  scannedRecordCount: number;
  totalRecordCount: number;
}

export interface FindThreadJob {
  cancel(): void;
}

export interface FindRunnerScheduler<THandle = unknown> {
  now(): number;
  schedule(callback: () => void): THandle;
  cancel(handle: THandle): void;
}

export interface StartFindThreadJobInput {
  records: readonly FindRecord[];
  query: string;
  frameBudgetMs?: number;
  maxBatchSize?: number;
  scheduler?: FindRunnerScheduler;
  onProgress: (progress: FindRunnerProgress) => void;
  onComplete: (complete: FindRunnerComplete) => void;
}

const DEFAULT_FRAME_BUDGET_MS = 4;
const DEFAULT_MAX_BATCH_SIZE = 120;

export function startProgressiveFindThreadJob(input: StartFindThreadJobInput): FindThreadJob {
  const normalizedQuery = normalizeFindQuery(input.query);
  const totalRecordCount = input.records.length;
  const frameBudgetMs = input.frameBudgetMs ?? DEFAULT_FRAME_BUDGET_MS;
  const maxBatchSize = input.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
  const scheduler = input.scheduler ?? createDefaultFindRunnerScheduler();

  let cancelled = false;
  let scheduledHandle: unknown = null;
  let recordIndex = 0;
  let offset = 0;
  const pendingMatches: FindInThreadMatch[] = [];

  const flushProgress = () => {
    if (pendingMatches.length === 0) {
      return;
    }
    const matches = pendingMatches.splice(0, pendingMatches.length);
    input.onProgress({
      matches,
      scannedRecordCount: recordIndex,
      totalRecordCount,
    });
  };

  const finish = () => {
    flushProgress();
    input.onComplete({
      scannedRecordCount: totalRecordCount,
      totalRecordCount,
    });
  };

  const scheduleNext = () => {
    scheduledHandle = scheduler.schedule(runSlice);
  };

  const runSlice = () => {
    scheduledHandle = null;
    if (cancelled) {
      return;
    }
    if (!normalizedQuery || totalRecordCount === 0) {
      finish();
      return;
    }

    const sliceStartedAt = scheduler.now();
    while (recordIndex < totalRecordCount) {
      const record = input.records[recordIndex];
      if (!record) {
        recordIndex += 1;
        offset = 0;
        continue;
      }
      const match = findNextMatchInRecord({
        record,
        normalizedQuery,
        fromOffset: offset,
      });
      if (!match) {
        recordIndex += 1;
        offset = 0;
      } else {
        pendingMatches.push(match);
        offset = match.end;
      }

      const batchFull = pendingMatches.length >= maxBatchSize;
      const budgetSpent = scheduler.now() - sliceStartedAt >= frameBudgetMs;
      if (batchFull || budgetSpent) {
        flushProgress();
        scheduleNext();
        return;
      }
    }

    finish();
  };

  scheduleNext();

  return {
    cancel() {
      cancelled = true;
      if (scheduledHandle !== null) {
        scheduler.cancel(scheduledHandle);
        scheduledHandle = null;
      }
    },
  };
}

export function createDefaultFindRunnerScheduler(): FindRunnerScheduler<number> {
  if (typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function") {
    return {
      now: () => Date.now(),
      schedule: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    };
  }
  return {
    now: () => Date.now(),
    schedule: (callback) => setTimeout(callback, 0) as unknown as number,
    cancel: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
  };
}
