import type { AgentAttachment, GitHubSearchItem } from "@getpaseo/protocol/messages";
import type { ImageAttachmentPayload } from "@getpaseo/protocol/agent-attachments";
import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import type { AttachmentMetadata, UserComposerAttachment } from "@/attachments/types";

export interface ScheduledComposerMessage {
  id: string;
  text: string;
  dueAt: string;
  images: ImageAttachmentPayload[];
  attachments: AgentAttachment[];
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
      images: schedule.images ?? [],
      attachments: schedule.attachments ?? [],
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

export function mergeScheduledComposerMessageCountsByWorkspace(input: {
  queuedCounts: ReadonlyMap<string, number>;
  schedules: ReadonlyArray<ScheduleSummary & { serverId?: string }>;
  agentWorkspaceKeys: ReadonlyMap<string, string>;
}): ReadonlyMap<string, number> {
  const counts = new Map(input.queuedCounts);
  for (const entry of countScheduledComposerMessagesByWorkspace({
    schedules: input.schedules,
    agentWorkspaceKeys: input.agentWorkspaceKeys,
  })) {
    counts.set(entry.workspaceKey, (counts.get(entry.workspaceKey) ?? 0) + entry.count);
  }
  return counts;
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

export async function restoreScheduledComposerMessageDraft(input: {
  message: ScheduledComposerMessage;
  persistImage: (input: {
    dataUrl: string;
    mimeType?: string;
    fileName?: string | null;
  }) => Promise<AttachmentMetadata>;
}): Promise<{
  text: string;
  attachments: UserComposerAttachment[];
}> {
  const imageAttachments = await Promise.all(
    input.message.images.map(async (image, index) => ({
      kind: "image" as const,
      metadata: await input.persistImage({
        dataUrl: `data:${image.mimeType};base64,${image.data}`,
        mimeType: image.mimeType,
        fileName: buildScheduledImageFileName(image.mimeType, index),
      }),
    })),
  );

  return {
    text: input.message.text,
    attachments: [
      ...imageAttachments,
      ...restoreScheduledAgentAttachments(input.message.attachments),
    ],
  };
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

function restoreScheduledAgentAttachments(
  attachments: readonly AgentAttachment[],
): UserComposerAttachment[] {
  const restored: UserComposerAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.type === "uploaded_file") {
      restored.push({ kind: "file", attachment });
      continue;
    }
    if (attachment.type === "github_issue") {
      restored.push({ kind: "github_issue", item: githubIssueAttachmentToSearchItem(attachment) });
      continue;
    }
    if (attachment.type === "github_pr") {
      restored.push({ kind: "github_pr", item: githubPrAttachmentToSearchItem(attachment) });
    }
  }
  return restored;
}

function githubIssueAttachmentToSearchItem(
  attachment: Extract<AgentAttachment, { type: "github_issue" }>,
): GitHubSearchItem {
  return {
    kind: "issue",
    number: attachment.number,
    title: attachment.title,
    url: attachment.url,
    state: "",
    body: attachment.body ?? null,
    labels: [],
  };
}

function githubPrAttachmentToSearchItem(
  attachment: Extract<AgentAttachment, { type: "github_pr" }>,
): GitHubSearchItem {
  return {
    kind: "pr",
    number: attachment.number,
    title: attachment.title,
    url: attachment.url,
    state: "",
    body: attachment.body ?? null,
    labels: [],
    ...(attachment.baseRefName ? { baseRefName: attachment.baseRefName } : {}),
    ...(attachment.headRefName ? { headRefName: attachment.headRefName } : {}),
  };
}

function buildScheduledImageFileName(mimeType: string, index: number): string {
  const extension = mimeTypeToExtension(mimeType);
  return `scheduled-image-${index + 1}.${extension}`;
}

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    default:
      return "img";
  }
}

function formatOneDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatUnit(value: number | string, singular: string): string {
  return `${value} ${singular}${Number(value) === 1 ? "" : "s"}`;
}
