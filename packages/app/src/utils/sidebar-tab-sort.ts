import type { Agent } from "@/stores/session-store";
import type { SidebarEmbeddedTabSortMode } from "@/stores/sidebar-view-store";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import {
  createEmptySidebarTabStatusSummary,
  getSidebarEntryStatusSortRank,
  type SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";

export interface SidebarTabSortItem {
  tab: WorkspaceTab;
}

const EMPTY_TAB_STATUS_SUMMARY = createEmptySidebarTabStatusSummary();

function getTabAgent(tab: WorkspaceTab, agents: ReadonlyMap<string, Agent> | null): Agent | null {
  return tab.target.kind === "agent" ? (agents?.get(tab.target.agentId) ?? null) : null;
}

function getTabLastUpdatedAt(tab: WorkspaceTab, agents: ReadonlyMap<string, Agent> | null): number {
  const agent = getTabAgent(tab, agents);
  return agent?.lastUserMessageAt?.getTime() ?? tab.createdAt;
}

function compareSidebarTabs(input: {
  left: WorkspaceTab;
  right: WorkspaceTab;
  sortMode: Exclude<SidebarEmbeddedTabSortMode, "manual">;
  agents: ReadonlyMap<string, Agent> | null;
  statusSummariesByTabId?: ReadonlyMap<string, SidebarTabStatusSummary>;
}): number {
  if (input.sortMode === "status") {
    const leftSummary =
      input.statusSummariesByTabId?.get(input.left.tabId) ?? EMPTY_TAB_STATUS_SUMMARY;
    const rightSummary =
      input.statusSummariesByTabId?.get(input.right.tabId) ?? EMPTY_TAB_STATUS_SUMMARY;
    const leftRank = getSidebarEntryStatusSortRank(leftSummary);
    const rightRank = getSidebarEntryStatusSortRank(rightSummary);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return (
      getTabLastUpdatedAt(input.right, input.agents) - getTabLastUpdatedAt(input.left, input.agents)
    );
  }

  const leftValue =
    input.sortMode === "created"
      ? input.left.createdAt
      : getTabLastUpdatedAt(input.left, input.agents);
  const rightValue =
    input.sortMode === "created"
      ? input.right.createdAt
      : getTabLastUpdatedAt(input.right, input.agents);
  return rightValue - leftValue;
}

export function sortSidebarTabItems<Item extends SidebarTabSortItem>(input: {
  items: readonly Item[];
  sortMode: SidebarEmbeddedTabSortMode;
  agents: ReadonlyMap<string, Agent> | null;
  statusSummariesByTabId?: ReadonlyMap<string, SidebarTabStatusSummary>;
}): Item[] {
  const sortMode = input.sortMode;
  if (sortMode === "manual") {
    return input.items.slice();
  }

  const sorted = input.items.slice();
  sorted.sort((left, right) =>
    compareSidebarTabs({
      left: left.tab,
      right: right.tab,
      sortMode,
      agents: input.agents,
      statusSummariesByTabId: input.statusSummariesByTabId,
    }),
  );
  return sorted;
}

export function sortSidebarWorkspaceTabs(input: {
  tabs: readonly WorkspaceTab[];
  sortMode: SidebarEmbeddedTabSortMode;
  agents: ReadonlyMap<string, Agent> | null;
  statusSummariesByTabId?: ReadonlyMap<string, SidebarTabStatusSummary>;
}): WorkspaceTab[] {
  return sortSidebarTabItems({
    items: input.tabs.map((tab) => ({ tab })),
    sortMode: input.sortMode,
    agents: input.agents,
    statusSummariesByTabId: input.statusSummariesByTabId,
  }).map((item) => item.tab);
}
