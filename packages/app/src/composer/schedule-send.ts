import type { CreateScheduleOptions, DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { AgentAttachment } from "@getpaseo/protocol/agent-attachments";
import type { ComposerAttachment } from "@/attachments/types";
import { splitComposerAttachmentsForSubmit } from "@/composer/attachments/submit";
import type { AttachmentMetadata } from "@/attachments/types";
import type { ProviderUsageView } from "@/provider-usage/types";

export type ScheduleSendMode =
  | { type: "at"; date: Date }
  | { type: "in-hours"; hours: number }
  | { type: "credit-refresh"; providerId: string | null };
export type ScheduleSendTarget = CreateScheduleOptions["target"];

export interface ScheduleCreditRefreshResolution {
  runAt: Date | null;
  disabledReason: string | null;
}

export function resolveCreditRefreshTime(
  view: ProviderUsageView,
  activeProviderId: string | null | undefined,
  now: Date = new Date(),
): ScheduleCreditRefreshResolution {
  if (!activeProviderId) {
    return { runAt: null, disabledReason: "No active provider usage is available" };
  }
  if (view.kind === "loading") {
    return { runAt: null, disabledReason: "Provider usage is still loading" };
  }
  if (view.kind === "error") {
    return { runAt: null, disabledReason: view.message };
  }

  const target = activeProviderId.toLowerCase();
  const provider = view.payload.providers.find(
    (usage) => usage.providerId.toLowerCase() === target,
  );
  if (!provider) {
    return { runAt: null, disabledReason: "No usage entry for this provider" };
  }

  const nowMs = now.getTime();
  const resetTimes = provider.windows
    .filter((window) => window.remainingPct === 0 || window.usedPct === 100)
    .map((window) => (window.resetsAt ? new Date(window.resetsAt) : null))
    .filter((date): date is Date => Boolean(date && Number.isFinite(date.getTime())))
    .filter((date) => date.getTime() > nowMs);

  if (resetTimes.length === 0) {
    return { runAt: null, disabledReason: "No exhausted budget has a future reset time" };
  }

  return {
    runAt: new Date(Math.max(...resetTimes.map((date) => date.getTime()))),
    disabledReason: null,
  };
}

export function dateToOneShotCron(date: Date): { expression: string; timezone: string } {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    expression: [
      date.getMinutes(),
      date.getHours(),
      date.getDate(),
      date.getMonth() + 1,
      date.getDay(),
    ].join(" "),
    timezone,
  };
}

export async function createScheduledComposerMessage(input: {
  client: Pick<DaemonClient, "scheduleCreate">;
  target: ScheduleSendTarget;
  text: string;
  attachments: ComposerAttachment[];
  mode: ScheduleSendMode;
  providerUsageView: ProviderUsageView;
  encodeImages: (
    images: AttachmentMetadata[],
  ) => Promise<Array<{ data: string; mimeType: string }> | undefined>;
}): Promise<void> {
  const text = input.text.trim();
  if (!text && input.attachments.length === 0) {
    throw new Error("Enter a message to schedule");
  }

  const runAt = resolveRunAt(input.mode, input.providerUsageView);
  if (runAt.getTime() <= Date.now()) {
    throw new Error("Choose a future time");
  }

  const prepared = splitComposerAttachmentsForSubmit(input.attachments);
  const images = (await input.encodeImages(prepared.images)) ?? [];
  const cron = dateToOneShotCron(runAt);

  await input.client.scheduleCreate({
    name: "Scheduled message",
    prompt: text,
    delivery: "agent-message",
    images,
    attachments: prepared.attachments as AgentAttachment[],
    cadence: {
      type: "cron",
      expression: cron.expression,
      timezone: cron.timezone,
    },
    target: input.target,
    maxRuns: 1,
    runOnCreate: false,
  });
}

function resolveRunAt(mode: ScheduleSendMode, providerUsageView: ProviderUsageView): Date {
  if (mode.type === "at") {
    return mode.date;
  }
  if (mode.type === "in-hours") {
    return new Date(Date.now() + Math.max(1, Math.round(mode.hours)) * 60 * 60 * 1000);
  }
  const resolution = resolveCreditRefreshTime(providerUsageView, mode.providerId);
  if (!resolution.runAt) {
    throw new Error(resolution.disabledReason ?? "No credit refresh time is available");
  }
  return resolution.runAt;
}
