import { describe, expect, it } from "vitest";
import type { FindRecord } from "./find-in-thread";
import { startProgressiveFindThreadJob, type FindRunnerScheduler } from "./find-runner-core";

function record(id: string, text: string): FindRecord {
  return { id, itemId: id, part: "message", text };
}

function createManualScheduler(): FindRunnerScheduler<number> & {
  flushOne: () => void;
  flushAll: () => void;
  queuedCount: () => number;
} {
  let nextHandle = 1;
  let now = 0;
  const queue = new Map<number, () => void>();
  return {
    now: () => {
      now += 1;
      return now;
    },
    schedule: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      queue.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      queue.delete(handle);
    },
    flushOne: () => {
      const result = queue.entries().next();
      if (result.done) {
        return;
      }
      const handle = result.value[0];
      const callback = result.value[1];
      queue.delete(handle);
      callback();
    },
    flushAll: () => {
      while (queue.size > 0) {
        const result = queue.entries().next();
        if (result.done) {
          return;
        }
        const handle = result.value[0];
        const callback = result.value[1];
        queue.delete(handle);
        callback();
      }
    },
    queuedCount: () => queue.size,
  };
}

describe("progressive find runner", () => {
  it("emits partial batches before completion", () => {
    const scheduler = createManualScheduler();
    const progressBatches: number[] = [];
    let completed = false;

    startProgressiveFindThreadJob({
      records: [
        record("r1", "needle one"),
        record("r2", "needle two"),
        record("r3", "needle three"),
      ],
      query: "needle",
      frameBudgetMs: 2,
      maxBatchSize: 10,
      scheduler,
      onProgress: (progress) => progressBatches.push(progress.matches.length),
      onComplete: () => {
        completed = true;
      },
    });

    scheduler.flushOne();
    expect(progressBatches).toEqual([1]);
    expect(completed).toBe(false);

    scheduler.flushAll();
    expect(progressBatches).toEqual([1, 1, 1]);
    expect(completed).toBe(true);
  });

  it("caps emitted batches", () => {
    const scheduler = createManualScheduler();
    const progressBatches: number[] = [];

    startProgressiveFindThreadJob({
      records: [record("r1", "needle needle needle")],
      query: "needle",
      frameBudgetMs: 100,
      maxBatchSize: 2,
      scheduler,
      onProgress: (progress) => progressBatches.push(progress.matches.length),
      onComplete: () => {},
    });

    scheduler.flushAll();

    expect(progressBatches).toEqual([2, 1]);
  });

  it("cancels stale jobs before they emit", () => {
    const scheduler = createManualScheduler();
    const progressBatches: number[] = [];
    let completed = false;

    const job = startProgressiveFindThreadJob({
      records: [record("r1", "needle")],
      query: "needle",
      scheduler,
      onProgress: (progress) => progressBatches.push(progress.matches.length),
      onComplete: () => {
        completed = true;
      },
    });

    job.cancel();
    scheduler.flushAll();

    expect(progressBatches).toEqual([]);
    expect(completed).toBe(false);
    expect(scheduler.queuedCount()).toBe(0);
  });
});
