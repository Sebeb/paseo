import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import {
  combineSidebarTabStatusSummaries,
  createEmptySidebarTabStatusSummary,
  SIDEBAR_ENTRY_STATUS_DISPLAY_ORDER,
  SIDEBAR_TAB_STATUS_BUCKETS,
  type SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";

export interface SidebarEmbeddedTabTreeItem {
  tab: WorkspaceTab;
}

export interface SidebarEmbeddedTabTreeRow<Item extends SidebarEmbeddedTabTreeItem> {
  item: Item;
  depth: number;
  childCount: number;
  expanded: boolean;
  parentTabKey: string | null;
  statusSummary: SidebarTabStatusSummary;
}

interface SidebarEmbeddedTabTreeNode<Item extends SidebarEmbeddedTabTreeItem> {
  item: Item;
  children: SidebarEmbeddedTabTreeNode<Item>[];
  aggregateStatusSummary: SidebarTabStatusSummary;
}

export function buildSidebarParentTabKey(input: { workspaceKey: string; tabId: string }): string {
  return `${input.workspaceKey}:${input.tabId}`;
}

export function buildSidebarEmbeddedTabTreeRows<Item extends SidebarEmbeddedTabTreeItem>(input: {
  workspaceKey: string;
  items: readonly Item[];
  parentTabIdByTabId?: Readonly<Record<string, string>> | null;
  expandedParentTabKeys: ReadonlySet<string>;
  statusSummariesByTabId: ReadonlyMap<string, SidebarTabStatusSummary>;
}): SidebarEmbeddedTabTreeRow<Item>[] {
  const itemByTabId = new Map(input.items.map((item) => [item.tab.tabId, item]));
  const nodesByTabId = new Map<string, SidebarEmbeddedTabTreeNode<Item>>();
  const childrenByParentId = new Map<string, SidebarEmbeddedTabTreeNode<Item>[]>();
  const roots: SidebarEmbeddedTabTreeNode<Item>[] = [];

  for (const item of input.items) {
    nodesByTabId.set(item.tab.tabId, {
      item,
      children: [],
      aggregateStatusSummary: createEmptySidebarTabStatusSummary(),
    });
  }

  for (const item of input.items) {
    const node = nodesByTabId.get(item.tab.tabId);
    if (!node) {
      continue;
    }
    const parentTabId = input.parentTabIdByTabId?.[item.tab.tabId] ?? null;
    if (!parentTabId || !itemByTabId.has(parentTabId)) {
      roots.push(node);
      continue;
    }
    const siblings = childrenByParentId.get(parentTabId) ?? [];
    siblings.push(node);
    childrenByParentId.set(parentTabId, siblings);
  }

  for (const [parentTabId, children] of childrenByParentId) {
    const parent = nodesByTabId.get(parentTabId);
    if (parent) {
      parent.children = children;
    }
  }

  for (const node of [...nodesByTabId.values()].toReversed()) {
    node.aggregateStatusSummary = summarizeTreeNode({
      node,
      statusSummariesByTabId: input.statusSummariesByTabId,
    });
  }

  const rows: SidebarEmbeddedTabTreeRow<Item>[] = [];
  function appendNode(node: SidebarEmbeddedTabTreeNode<Item>, depth: number): void {
    const parentTabKey =
      node.children.length > 0
        ? buildSidebarParentTabKey({
            workspaceKey: input.workspaceKey,
            tabId: node.item.tab.tabId,
          })
        : null;
    const expanded = parentTabKey ? input.expandedParentTabKeys.has(parentTabKey) : false;
    rows.push({
      item: node.item,
      depth,
      childCount: node.children.length,
      expanded,
      parentTabKey,
      statusSummary: node.aggregateStatusSummary,
    });
    if (!expanded) {
      return;
    }
    for (const child of node.children) {
      appendNode(child, depth + 1);
    }
  }

  for (const root of roots) {
    appendNode(root, 0);
  }
  return rows;
}

function summarizeTreeNode<Item extends SidebarEmbeddedTabTreeItem>(input: {
  node: SidebarEmbeddedTabTreeNode<Item>;
  statusSummariesByTabId: ReadonlyMap<string, SidebarTabStatusSummary>;
}): SidebarTabStatusSummary {
  const ownSummary =
    input.statusSummariesByTabId.get(input.node.item.tab.tabId) ??
    createEmptySidebarTabStatusSummary();
  const childSummaries = input.node.children.map((child) => child.aggregateStatusSummary);
  if (childSummaries.length === 0) {
    return ownSummary;
  }
  return combineOwnAndDescendantSummaries(ownSummary, childSummaries);
}

function combineOwnAndDescendantSummaries(
  ownSummary: SidebarTabStatusSummary,
  descendantSummaries: readonly SidebarTabStatusSummary[],
): SidebarTabStatusSummary {
  const combined = combineSidebarTabStatusSummaries(descendantSummaries);
  combined.total += ownSummary.total;
  for (const bucket of SIDEBAR_TAB_STATUS_BUCKETS) {
    combined.counts[bucket] += ownSummary.counts[bucket];
  }
  combined.draft += ownSummary.draft;
  combined.propagatedDraft += ownSummary.propagatedDraft;
  for (const kind of SIDEBAR_ENTRY_STATUS_DISPLAY_ORDER) {
    combined.entryCounts[kind] += ownSummary.entryCounts[kind];
    combined.propagatedEntryCounts[kind] += ownSummary.propagatedEntryCounts[kind];
  }
  return combined;
}
