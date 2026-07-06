import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";

export interface ScheduledComposerMessage {
  id: string;
  text: string;
  dueAt: string;
}

export interface ScheduledComposerMessageWorkspaceCount {
  workspaceKey: string;
  count: number;
}

export function selectScheduledComposerMessages(input: {
  schedules: ReadonlyArray<ScheduleSummary & { serverId?: string }>;
  serverId: string;
  agentId: string;
}): ScheduledComposerMessage[] {
  return input.schedules
    .filter(
      (schedule) =>
        schedule.serverId === input.serverId &&
        isScheduledComposerMessageForAgent(schedule, input.agentId),
    )
    .map((schedule) => ({
      id: schedule.id,
      text: schedule.prompt,
      dueAt: schedule.nextRunAt ?? "",
    }))
    .filter((message) => message.dueAt.length > 0)
    .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
}

export function countScheduledComposerMessagesByWorkspace(input: {
  schedules: ReadonlyArray<ScheduleSummary & { serverId?: string }>;
  agentWorkspaceKeys: ReadonlyMap<string, string>;
}): ScheduledComposerMessageWorkspaceCount[] {
  const counts = new Map<string, number>();
  for (const schedule of input.schedules) {
    if (!isActiveScheduledComposerMessage(schedule)) continue;
    if (schedule.target.type !== "agent") continue;
    const scheduleServerId = typeof schedule.serverId === "string" ? schedule.serverId : "";
    const workspaceKey = input.agentWorkspaceKeys.get(
      buildAgentWorkspaceLookupKey(scheduleServerId, schedule.target.agentId),
    );
    if (!workspaceKey) continue;
    counts.set(workspaceKey, (counts.get(workspaceKey) ?? 0) + 1);
  }
  return [...counts].map(([workspaceKey, count]) => ({ workspaceKey, count }));
}

export function buildAgentWorkspaceLookupKey(serverId: string, agentId: string): string {
  return `${serverId}:${agentId}`;
}

export function formatScheduledCountdown(dueAt: string, now: number): string {
  const dueMs = new Date(dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return "";
  }
  const remainingMs = Math.max(0, dueMs - now);
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (seconds < 60) {
    return formatUnit(seconds, "second");
  }
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return formatUnit(minutes, "minute");
  }
  const hours = seconds / 3600;
  if (hours < 24) {
    return formatUnit(formatOneDecimal(hours), "hour");
  }
  const days = Math.ceil(seconds / 86400);
  return formatUnit(days, "day");
}

function isScheduledComposerMessageForAgent(schedule: ScheduleSummary, agentId: string): boolean {
  return (
    isActiveScheduledComposerMessage(schedule) &&
    schedule.target.type === "agent" &&
    schedule.target.agentId === agentId
  );
}

function isActiveScheduledComposerMessage(schedule: ScheduleSummary): boolean {
  return (
    schedule.delivery === "agent-message" &&
    schedule.maxRuns === 1 &&
    schedule.status === "active" &&
    typeof schedule.nextRunAt === "string" &&
    schedule.nextRunAt.length > 0
  );
}

function formatOneDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatUnit(value: number | string, singular: string): string {
  return `${value} ${singular}${Number(value) === 1 ? "" : "s"}`;
}
