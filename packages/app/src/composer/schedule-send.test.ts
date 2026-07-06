import { describe, expect, it, vi } from "vitest";
import type { AttachmentMetadata, ComposerAttachment } from "@/attachments/types";
import {
  createScheduledComposerMessage,
  dateToOneShotCron,
  resolveCreditRefreshTime,
} from "@/composer/schedule-send";
import type { ProviderUsageView } from "@/provider-usage/types";

const image: AttachmentMetadata = {
  id: "image-1",
  mimeType: "image/png",
  storageType: "web-indexeddb",
  storageKey: "image-1",
  fileName: "image.png",
  byteSize: 10,
  createdAt: 1,
};

describe("resolveCreditRefreshTime", () => {
  it("chooses the latest future reset among exhausted windows for the active provider", () => {
    const view: ProviderUsageView = {
      kind: "ready",
      isRefreshing: false,
      payload: {
        requestId: "usage-1",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        providers: [
          {
            providerId: "codex",
            displayName: "Codex",
            status: "available",
            planLabel: null,
            windows: [
              {
                id: "session",
                label: "Session",
                remainingPct: 0,
                resetsAt: "2026-01-01T05:00:00.000Z",
              },
              {
                id: "weekly",
                label: "Weekly",
                usedPct: 100,
                resetsAt: "2026-01-02T00:00:00.000Z",
              },
            ],
          },
        ],
      },
    };

    const result = resolveCreditRefreshTime(view, "codex", new Date("2026-01-01T00:00:00.000Z"));

    expect(result.disabledReason).toBeNull();
    expect(result.runAt?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("createScheduledComposerMessage", () => {
  it("creates a one-shot agent-message schedule with prepared attachments", async () => {
    const scheduleCreate = vi.fn(async () => ({ error: null, schedule: null, requestId: "req" }));
    const attachments: ComposerAttachment[] = [
      { kind: "image", metadata: image },
      {
        kind: "file",
        attachment: {
          type: "uploaded_file",
          id: "file-1",
          fileName: "notes.txt",
          mimeType: "text/plain",
          size: 12,
          path: "/tmp/notes.txt",
        },
      },
    ];

    await createScheduledComposerMessage({
      client: { scheduleCreate },
      target: { type: "self", agentId: "00000000-0000-4000-8000-000000000001" },
      text: " later ",
      attachments,
      mode: { type: "at", date: new Date(Date.now() + 60 * 60 * 1000) },
      providerUsageView: { kind: "loading" },
      encodeImages: async () => [{ data: "base64", mimeType: "image/png" }],
    });

    expect(scheduleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Scheduled message",
        prompt: "later",
        delivery: "agent-message",
        images: [{ data: "base64", mimeType: "image/png" }],
        attachments: [expect.objectContaining({ type: "uploaded_file", id: "file-1" })],
        target: { type: "self", agentId: "00000000-0000-4000-8000-000000000001" },
        maxRuns: 1,
        runOnCreate: false,
      }),
    );
  });

  it("can schedule a message that creates a new agent", async () => {
    const scheduleCreate = vi.fn(async () => ({ error: null, schedule: null, requestId: "req" }));
    const target = {
      type: "new-agent" as const,
      config: {
        provider: "codex" as const,
        cwd: "/tmp/project",
        modeId: "full-access",
        model: "gpt-5",
        thinkingOptionId: "medium",
        featureValues: { plan_mode: true },
      },
    };

    await createScheduledComposerMessage({
      client: { scheduleCreate },
      target,
      text: "start later",
      attachments: [],
      mode: { type: "at", date: new Date(Date.now() + 60 * 60 * 1000) },
      providerUsageView: { kind: "loading" },
      encodeImages: async () => undefined,
    });

    expect(scheduleCreate).toHaveBeenCalledWith(expect.objectContaining({ target }));
  });
});

describe("dateToOneShotCron", () => {
  it("includes minute, hour, date, month and day-of-week", () => {
    const cron = dateToOneShotCron(new Date(2026, 6, 10, 9, 30));

    expect(cron.expression).toBe("30 9 10 7 5");
    expect(cron.timezone).toBeTruthy();
  });
});
