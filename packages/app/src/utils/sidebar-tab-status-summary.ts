import { deriveTerminalActivityStatusBucket } from "@getpaseo/protocol/terminal-activity";
import type { TerminalActivity } from "@getpaseo/protocol/terminal-activity";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTab } from "@/stores/workspace-tabs-store";
import type { Agent } from "@/stores/session-store";
import type { PendingCreateAttempt } from "@/stores/create-flow-store";
import type { BrowserRecord } from "@/stores/browser-store/state";
import type { WorkspaceSetupSnapshot } from "@/stores/workspace-setup-store";
import { buildDraftStoreKey } from "@/stores/draft-keys";
import { hasDraftContent } from "@/composer/draft/input-draft-core";
import type { DraftInput } from "@/stores/draft-store";
import { deriveSidebarStateBucket, type SidebarStateBucket } from "@/utils/sidebar-agent-state";

export type SidebarTabStatusBucket = SidebarStateBucket;
export type SidebarEntryStatusKind =
  | "queued_messages"
  | "draft"
  | "input_required"
  | "unread"
  | "in_progress"
  | "failed";
export type SidebarEntryStatusCountMode = "always" | "off" | "onePlus";
export type SidebarEntryStatusSingleIcon = "input_required" | "failed";

export interface SidebarEntryStatusDefinition {
  kind: SidebarEntryStatusKind;
  countMode: SidebarEntryStatusCountMode;
  propagateUp: boolean;
  singleIcon?: SidebarEntryStatusSingleIcon;
}

export interface SidebarTabStatusSummary {
  total: number;
  counts: Record<SidebarTabStatusBucket, number>;
  draft: number;
  propagatedDraft: number;
  entryCounts: Record<SidebarEntryStatusKind, number>;
  propagatedEntryCounts: Record<SidebarEntryStatusKind, number>;
}

interface SidebarEntryStatusFilterOptions {
  excludeKinds?: readonly SidebarEntryStatusKind[];
}

export interface SidebarTerminalStatusRecord {
  id: string;
  activity: TerminalActivity | null | undefined;
}

export const SIDEBAR_TAB_STATUS_BUCKETS: SidebarTabStatusBucket[] = [
  "needs_input",
  "failed",
  "running",
  "attention",
  "done",
];
export const SIDEBAR_TAB_STATUS_BADGE_BUCKETS: SidebarTabStatusBucket[] = [
  "needs_input",
  "failed",
  "running",
  "attention",
];
export const SIDEBAR_ENTRY_STATUS_DISPLAY_ORDER: SidebarEntryStatusKind[] = [
  "queued_messages",
  "draft",
  "input_required",
  "in_progress",
  "unread",
  "failed",
];
export const SIDEBAR_ENTRY_STATUS_SORT_ORDER: SidebarEntryStatusKind[] = [
  "input_required",
  "failed",
  "unread",
  "in_progress",
];
export const SIDEBAR_ENTRY_STATUS_DEFINITIONS: Record<
  SidebarEntryStatusKind,
  SidebarEntryStatusDefinition
> = {
  queued_messages: { kind: "queued_messages", countMode: "always", propagateUp: true },
  draft: { kind: "draft", countMode: "off", propagateUp: true },
  input_required: {
    kind: "input_required",
    countMode: "onePlus",
    propagateUp: true,
    singleIcon: "input_required",
  },
  unread: { kind: "unread", countMode: "onePlus", propagateUp: true },
  in_progress: { kind: "in_progress", countMode: "onePlus", propagateUp: true },
  failed: { kind: "failed", countMode: "onePlus", propagateUp: true, singleIcon: "failed" },
};

function createEmptyEntryStatusCounts(): Record<SidebarEntryStatusKind, number> {
  return {
    queued_messages: 0,
    draft: 0,
    input_required: 0,
    unread: 0,
    in_progress: 0,
    failed: 0,
  };
}

export function createEmptySidebarTabStatusSummary(): SidebarTabStatusSummary {
  return {
    total: 0,
    counts: {
      needs_input: 0,
      failed: 0,
      running: 0,
      attention: 0,
      done: 0,
    },
    draft: 0,
    propagatedDraft: 0,
    entryCounts: createEmptyEntryStatusCounts(),
    propagatedEntryCounts: createEmptyEntryStatusCounts(),
  };
}

export function summarizeSidebarTabs(input: {
  tabs: readonly WorkspaceTab[];
  serverId: string;
  workspaceId: string;
  agents: ReadonlyMap<string, Agent> | null;
  pendingCreatesByDraftId: Readonly<Record<string, PendingCreateAttempt>>;
  setupSnapshots: Readonly<Record<string, WorkspaceSetupSnapshot>>;
  browsersById: Readonly<Record<string, BrowserRecord>>;
  terminalsById: ReadonlyMap<string, SidebarTerminalStatusRecord>;
  draftInputsByKey?: Readonly<Record<string, DraftInput | undefined>>;
  queuedMessageCountsByAgentId?: ReadonlyMap<string, number>;
}): SidebarTabStatusSummary {
  const summary = createEmptySidebarTabStatusSummary();
  for (const tab of input.tabs) {
    const bucket = resolveSidebarTabStatusBucket({ ...input, tab });
    const bucketPropagates = resolveSidebarTabStatusPropagation({ ...input, tab, bucket });
    summary.total += 1;
    summary.counts[bucket] += 1;
    for (const kind of sidebarEntryStatusesFromBucket(bucket)) {
      addEntryStatus(summary, kind, bucketPropagates);
    }
    const queuedCount = resolveQueuedMessageCount({
      tab,
      queuedMessageCountsByAgentId: input.queuedMessageCountsByAgentId,
    });
    if (queuedCount > 0) {
      addEntryStatus(summary, "queued_messages", true, queuedCount);
    }
    const draftState = resolveSidebarTabDraftState({ ...input, tab });
    if (draftState.hasDraftBadge) {
      summary.draft += 1;
      addEntryStatus(summary, "draft", draftState.propagatesToParent);
    }
    if (draftState.propagatesToParent) {
      summary.propagatedDraft += 1;
    }
  }
  return summary;
}

export function combineSidebarTabStatusSummaries(
  summaries: readonly SidebarTabStatusSummary[],
): SidebarTabStatusSummary {
  const combined = createEmptySidebarTabStatusSummary();
  for (const summary of summaries) {
    combined.total += summary.total;
    for (const bucket of SIDEBAR_TAB_STATUS_BUCKETS) {
      combined.counts[bucket] += summary.counts[bucket];
    }
    for (const kind of SIDEBAR_ENTRY_STATUS_DISPLAY_ORDER) {
      combined.entryCounts[kind] += summary.propagatedEntryCounts[kind];
      combined.propagatedEntryCounts[kind] += summary.propagatedEntryCounts[kind];
    }
    combined.draft += summary.propagatedDraft;
    combined.propagatedDraft += summary.propagatedDraft;
  }
  return combined;
}

export function getSidebarEntryStatusCount(
  summary: SidebarTabStatusSummary,
  kind: SidebarEntryStatusKind,
): number {
  return summary.entryCounts[kind];
}

export function getVisibleSidebarEntryStatusKinds(
  summary: SidebarTabStatusSummary,
  options: SidebarEntryStatusFilterOptions = {},
): SidebarEntryStatusKind[] {
  return SIDEBAR_ENTRY_STATUS_DISPLAY_ORDER.filter(
    (kind) => summary.entryCounts[kind] > 0 && !options.excludeKinds?.includes(kind),
  );
}

export function getPrimarySidebarEntryStatusKind(
  summary: SidebarTabStatusSummary,
  options: SidebarEntryStatusFilterOptions = {},
): SidebarEntryStatusKind | null {
  const priority: SidebarEntryStatusKind[] = [
    "input_required",
    "failed",
    "unread",
    "in_progress",
    "queued_messages",
    "draft",
  ];
  return (
    priority.find(
      (kind) => summary.entryCounts[kind] > 0 && !options.excludeKinds?.includes(kind),
    ) ?? null
  );
}

export function getSidebarEntryStatusSortRank(summary: SidebarTabStatusSummary): number {
  const ranked = SIDEBAR_ENTRY_STATUS_SORT_ORDER.findIndex((kind) => summary.entryCounts[kind] > 0);
  return ranked === -1 ? SIDEBAR_ENTRY_STATUS_SORT_ORDER.length : ranked;
}

function addEntryStatus(
  summary: SidebarTabStatusSummary,
  kind: SidebarEntryStatusKind,
  propagates: boolean,
  count = 1,
): void {
  summary.entryCounts[kind] += count;
  if (propagates && SIDEBAR_ENTRY_STATUS_DEFINITIONS[kind].propagateUp) {
    summary.propagatedEntryCounts[kind] += count;
  }
}

function sidebarEntryStatusesFromBucket(bucket: SidebarTabStatusBucket): SidebarEntryStatusKind[] {
  switch (bucket) {
    case "needs_input":
      return ["input_required"];
    case "failed":
      return ["failed"];
    case "running":
      return ["in_progress"];
    case "attention":
      return ["unread"];
    case "done":
      return [];
  }
}

function resolveQueuedMessageCount(input: {
  tab: WorkspaceTab;
  queuedMessageCountsByAgentId?: ReadonlyMap<string, number>;
}): number {
  if (input.tab.target.kind !== "agent" || !input.queuedMessageCountsByAgentId) {
    return 0;
  }
  return input.queuedMessageCountsByAgentId.get(input.tab.target.agentId) ?? 0;
}

export interface SidebarTabDraftState {
  hasDraftBadge: boolean;
  propagatesToParent: boolean;
}

export function resolveSidebarTabDraftState(input: {
  tab: WorkspaceTab;
  serverId: string;
  draftInputsByKey?: Readonly<Record<string, DraftInput | undefined>>;
}): SidebarTabDraftState {
  const target = input.tab.target;
  if (target.kind === "draft") {
    const draft = resolveDraftInputForTarget({
      serverId: input.serverId,
      target,
      draftInputsByKey: input.draftInputsByKey,
    });
    return {
      hasDraftBadge: true,
      propagatesToParent: draft ? hasDraftText(draft) : false,
    };
  }
  if (target.kind !== "agent") {
    return { hasDraftBadge: false, propagatesToParent: false };
  }
  const draft = resolveDraftInputForTarget({
    serverId: input.serverId,
    target,
    draftInputsByKey: input.draftInputsByKey,
  });
  if (!draft) {
    return { hasDraftBadge: false, propagatesToParent: false };
  }
  return {
    hasDraftBadge: hasDraftContent({ text: draft.text, attachments: draft.attachments }),
    propagatesToParent: hasDraftText(draft),
  };
}

function resolveDraftInputForTarget(input: {
  serverId: string;
  target: WorkspaceTab["target"];
  draftInputsByKey?: Readonly<Record<string, DraftInput | undefined>>;
}): DraftInput | undefined {
  const draftInputsByKey = input.draftInputsByKey;
  if (!draftInputsByKey) {
    return undefined;
  }
  if (input.target.kind === "draft") {
    const key = buildDraftStoreKey({
      serverId: input.serverId,
      agentId: "",
      draftId: input.target.draftId,
    });
    return draftInputsByKey[key];
  }
  if (input.target.kind === "agent") {
    const key = buildDraftStoreKey({ serverId: input.serverId, agentId: input.target.agentId });
    return draftInputsByKey[key];
  }
  return undefined;
}

function hasDraftText(draft: DraftInput): boolean {
  return draft.text.trim().length > 0;
}

function resolveSidebarTabStatusBucket(input: {
  tab: WorkspaceTab;
  serverId: string;
  workspaceId: string;
  agents: ReadonlyMap<string, Agent> | null;
  pendingCreatesByDraftId: Readonly<Record<string, PendingCreateAttempt>>;
  setupSnapshots: Readonly<Record<string, WorkspaceSetupSnapshot>>;
  browsersById: Readonly<Record<string, BrowserRecord>>;
  terminalsById: ReadonlyMap<string, SidebarTerminalStatusRecord>;
}): SidebarTabStatusBucket {
  const target = input.tab.target;
  switch (target.kind) {
    case "agent":
      return resolveAgentTabStatus(input.agents?.get(target.agentId) ?? null);
    case "draft":
      return resolveDraftTabStatus({
        pending: input.pendingCreatesByDraftId[target.draftId] ?? null,
        serverId: input.serverId,
      });
    case "setup":
      return resolveSetupTabStatus({
        serverId: input.serverId,
        workspaceId: target.workspaceId,
        setupSnapshots: input.setupSnapshots,
      });
    case "browser":
      return input.browsersById[target.browserId]?.isLoading ? "running" : "done";
    case "terminal":
      return (
        deriveTerminalActivityStatusBucket(input.terminalsById.get(target.terminalId)?.activity) ??
        "done"
      );
    case "file":
      return "done";
  }
}

function resolveSidebarTabStatusPropagation(input: {
  tab: WorkspaceTab;
  bucket: SidebarTabStatusBucket;
  agents: ReadonlyMap<string, Agent> | null;
}): boolean {
  if (input.bucket !== "failed" || input.tab.target.kind !== "agent") {
    return true;
  }
  const agent = input.agents?.get(input.tab.target.agentId) ?? null;
  return agent?.requiresAttention === true && agent.attentionReason === "error";
}

function resolveAgentTabStatus(agent: Agent | null): SidebarTabStatusBucket {
  if (!agent) {
    return "done";
  }
  return deriveSidebarStateBucket({
    status: agent.status,
    pendingPermissionCount: agent.pendingPermissions.length,
    requiresAttention: agent.requiresAttention ?? false,
    attentionReason: agent.attentionReason ?? null,
  });
}

function resolveDraftTabStatus(input: {
  pending: PendingCreateAttempt | null;
  serverId: string;
}): SidebarTabStatusBucket {
  return input.pending?.serverId === input.serverId && input.pending.lifecycle === "active"
    ? "running"
    : "done";
}

function resolveSetupTabStatus(input: {
  serverId: string;
  workspaceId: string;
  setupSnapshots: Readonly<Record<string, WorkspaceSetupSnapshot>>;
}): SidebarTabStatusBucket {
  const key = buildWorkspaceTabPersistenceKey({
    serverId: input.serverId,
    workspaceId: input.workspaceId,
  });
  const snapshot = key ? (input.setupSnapshots[key] ?? null) : null;
  return snapshot?.status === "running" ? "running" : "done";
}
