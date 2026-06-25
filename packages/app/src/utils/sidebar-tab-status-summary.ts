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

export interface SidebarTabStatusSummary {
  total: number;
  counts: Record<SidebarTabStatusBucket, number>;
  draft: number;
  propagatedDraft: number;
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
}): SidebarTabStatusSummary {
  const summary = createEmptySidebarTabStatusSummary();
  for (const tab of input.tabs) {
    const bucket = resolveSidebarTabStatusBucket({ ...input, tab });
    summary.total += 1;
    summary.counts[bucket] += 1;
    const draftState = resolveSidebarTabDraftState({ ...input, tab });
    if (draftState.hasDraftBadge) {
      summary.draft += 1;
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
    combined.draft += summary.propagatedDraft;
    combined.propagatedDraft += summary.propagatedDraft;
  }
  return combined;
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
