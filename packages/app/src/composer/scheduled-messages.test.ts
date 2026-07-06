import { describe, expect, it } from "vitest";
import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import {
  buildAgentWorkspaceLookupKey,
  countScheduledComposerMessagesByWorkspace,
  formatScheduledCountdown,
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

describe("formatScheduledCountdown", () => {
  it("formats countdowns as plain text units", () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();

    expect(formatScheduledCountdown("2026-01-01T00:00:29.000Z", now)).toBe("29 seconds");
    expect(formatScheduledCountdown("2026-01-01T00:25:00.000Z", now)).toBe("25 minutes");
    expect(formatScheduledCountdown("2026-01-01T01:18:00.000Z", now)).toBe("1.3 hours");
    expect(formatScheduledCountdown("2026-01-02T00:00:00.000Z", now)).toBe("1 day");
  });
});
