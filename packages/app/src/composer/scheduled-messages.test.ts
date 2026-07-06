import { describe, expect, it } from "vitest";
import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import {
  buildAgentWorkspaceLookupKey,
  countScheduledComposerMessagesByWorkspace,
  formatScheduledCountdown,
  mergeScheduledComposerMessageCountsByWorkspace,
  restoreScheduledComposerMessageDraft,
  selectScheduledComposerMessages,
} from "@/composer/scheduled-messages";

function schedule(overrides: Partial<ScheduleSummary> & { id: string }): ScheduleSummary {
  return {
    id: overrides.id,
    name: "Scheduled message",
    prompt: overrides.prompt ?? "later",
    delivery: overrides.delivery ?? "agent-message",
    cadence: { type: "cron", expression: "0 9 1 1 *" },
    target:
      overrides.target ??
      ({
        type: "agent",
        agentId: "00000000-0000-4000-8000-000000000001",
      } satisfies ScheduleSummary["target"]),
    status: overrides.status ?? "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    nextRunAt: overrides.nextRunAt ?? "2026-01-01T09:00:00.000Z",
    lastRunAt: null,
    pausedAt: null,
    expiresAt: null,
    maxRuns: overrides.maxRuns ?? 1,
    images: overrides.images,
    attachments: overrides.attachments,
  };
}

describe("selectScheduledComposerMessages", () => {
  it("filters to active one-shot agent-message schedules for the current host and agent", () => {
    const selected = selectScheduledComposerMessages({
      serverId: "srv-a",
      agentId: "00000000-0000-4000-8000-000000000001",
      schedules: [
        { ...schedule({ id: "second", nextRunAt: "2026-01-01T10:00:00.000Z" }), serverId: "srv-a" },
        { ...schedule({ id: "first", nextRunAt: "2026-01-01T09:00:00.000Z" }), serverId: "srv-a" },
        { ...schedule({ id: "wrong-host" }), serverId: "srv-b" },
        { ...schedule({ id: "paused", status: "paused" }), serverId: "srv-a" },
      ],
    });

    expect(selected.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("carries stored images and attachments for composer edit restore", () => {
    const selected = selectScheduledComposerMessages({
      serverId: "srv-a",
      agentId: "00000000-0000-4000-8000-000000000001",
      schedules: [
        {
          ...schedule({
            id: "scheduled",
            images: [{ data: "abc", mimeType: "image/png" }],
            attachments: [
              {
                type: "uploaded_file",
                id: "file-1",
                fileName: "notes.txt",
                mimeType: "text/plain",
                size: 12,
                path: "/tmp/notes.txt",
              },
            ],
          }),
          serverId: "srv-a",
        },
      ],
    });

    expect(selected[0]?.images).toEqual([{ data: "abc", mimeType: "image/png" }]);
    expect(selected[0]?.attachments).toEqual([
      expect.objectContaining({ type: "uploaded_file", id: "file-1" }),
    ]);
  });
});

describe("countScheduledComposerMessagesByWorkspace", () => {
  it("counts scheduled messages through agent workspace ownership", () => {
    const counts = countScheduledComposerMessagesByWorkspace({
      schedules: [{ ...schedule({ id: "scheduled" }), serverId: "srv" }],
      agentWorkspaceKeys: new Map([
        [buildAgentWorkspaceLookupKey("srv", "00000000-0000-4000-8000-000000000001"), "srv:ws"],
      ]),
    });

    expect(counts).toEqual([{ workspaceKey: "srv:ws", count: 1 }]);
  });
});

describe("mergeScheduledComposerMessageCountsByWorkspace", () => {
  it("adds scheduled composer messages to existing queued message status counts", () => {
    const counts = mergeScheduledComposerMessageCountsByWorkspace({
      queuedCounts: new Map([["srv:ws", 2]]),
      schedules: [
        { ...schedule({ id: "scheduled-1" }), serverId: "srv" },
        { ...schedule({ id: "scheduled-2" }), serverId: "srv" },
      ],
      agentWorkspaceKeys: new Map([
        [buildAgentWorkspaceLookupKey("srv", "00000000-0000-4000-8000-000000000001"), "srv:ws"],
      ]),
    });

    expect([...counts]).toEqual([["srv:ws", 4]]);
  });
});

describe("formatScheduledCountdown", () => {
  it("formats countdowns as plain text units", () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();

    expect(formatScheduledCountdown("2026-01-01T00:00:29.000Z", now)).toBe("29 seconds");
    expect(formatScheduledCountdown("2026-01-01T00:25:00.000Z", now)).toBe("25 minutes");
    expect(formatScheduledCountdown("2026-01-01T01:18:00.000Z", now)).toBe("1.3 hours");
    expect(formatScheduledCountdown("2026-01-02T00:00:00.000Z", now)).toBe("1 day");
  });
});

describe("restoreScheduledComposerMessageDraft", () => {
  it("restores text, stored images, uploaded files, and GitHub attachments", async () => {
    const draft = await restoreScheduledComposerMessageDraft({
      message: {
        id: "scheduled",
        text: "edit me",
        dueAt: "2026-01-01T09:00:00.000Z",
        images: [{ data: "abc", mimeType: "image/png" }],
        attachments: [
          {
            type: "uploaded_file",
            id: "file-1",
            fileName: "notes.txt",
            mimeType: "text/plain",
            size: 12,
            path: "/tmp/notes.txt",
          },
          {
            type: "github_issue",
            mimeType: "application/github-issue",
            number: 123,
            title: "Bug",
            url: "https://example.com/issues/123",
            body: "details",
          },
        ],
      },
      persistImage: async ({ dataUrl, mimeType, fileName }) => ({
        id: "image-1",
        mimeType: mimeType ?? "image/png",
        storageType: "web-indexeddb",
        storageKey: dataUrl,
        fileName,
        byteSize: null,
        createdAt: 1,
      }),
    });

    expect(draft.text).toBe("edit me");
    expect(draft.attachments).toEqual([
      expect.objectContaining({
        kind: "image",
        metadata: expect.objectContaining({
          storageKey: "data:image/png;base64,abc",
          fileName: "scheduled-image-1.png",
        }),
      }),
      { kind: "file", attachment: expect.objectContaining({ id: "file-1" }) },
      {
        kind: "github_issue",
        item: expect.objectContaining({ kind: "issue", number: 123, title: "Bug" }),
      },
    ]);
  });
});
