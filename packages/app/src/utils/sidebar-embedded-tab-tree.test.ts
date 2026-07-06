import { describe, expect, it } from "vitest";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import {
  buildSidebarEmbeddedTabTreeRows,
  buildSidebarParentTabKey,
  type SidebarEmbeddedTabTreeItem,
} from "@/utils/sidebar-embedded-tab-tree";
import { createEmptySidebarTabStatusSummary } from "@/utils/sidebar-tab-status-summary";

interface TestTreeItem extends SidebarEmbeddedTabTreeItem {
  label: string;
}

function tab(tabId: string): WorkspaceTab {
  return {
    tabId,
    target: { kind: "agent", agentId: tabId.replace(/^agent_/, "") },
    createdAt: 1,
  };
}

function item(tabId: string): TestTreeItem {
  return { tab: tab(tabId), label: tabId };
}

function unreadSummary(count: number) {
  const summary = createEmptySidebarTabStatusSummary();
  summary.total = 1;
  summary.counts.attention = count;
  summary.entryCounts.unread = count;
  summary.propagatedEntryCounts.unread = count;
  return summary;
}

describe("sidebar embedded tab tree", () => {
  it("keeps parent tabs collapsed by default", () => {
    const rows = buildSidebarEmbeddedTabTreeRows({
      workspaceKey: "workspace-a",
      items: [item("agent_parent"), item("agent_child")],
      parentTabIdByTabId: { agent_child: "agent_parent" },
      expandedParentTabKeys: new Set(),
      statusSummariesByTabId: new Map(),
    });

    expect(rows.map((row) => row.item.tab.tabId)).toEqual(["agent_parent"]);
    expect(rows[0]?.childCount).toBe(1);
    expect(rows[0]?.expanded).toBe(false);
  });

  it("shows children when the parent tab key is expanded", () => {
    const rows = buildSidebarEmbeddedTabTreeRows({
      workspaceKey: "workspace-a",
      items: [item("agent_parent"), item("agent_child")],
      parentTabIdByTabId: { agent_child: "agent_parent" },
      expandedParentTabKeys: new Set([
        buildSidebarParentTabKey({ workspaceKey: "workspace-a", tabId: "agent_parent" }),
      ]),
      statusSummariesByTabId: new Map(),
    });

    expect(rows.map((row) => [row.item.tab.tabId, row.depth])).toEqual([
      ["agent_parent", 0],
      ["agent_child", 1],
    ]);
    expect(rows[0]?.expanded).toBe(true);
  });

  it("tracks the total tab count for a collapsed parent branch", () => {
    const rows = buildSidebarEmbeddedTabTreeRows({
      workspaceKey: "workspace-a",
      items: [item("agent_parent"), item("agent_child"), item("agent_grandchild")],
      parentTabIdByTabId: {
        agent_child: "agent_parent",
        agent_grandchild: "agent_child",
      },
      expandedParentTabKeys: new Set(),
      statusSummariesByTabId: new Map([
        ["agent_parent", unreadSummary(1)],
        ["agent_child", unreadSummary(1)],
        ["agent_grandchild", unreadSummary(1)],
      ]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.statusSummary.total).toBe(3);
  });

  it("aggregates parent and descendant status badge counts", () => {
    const rows = buildSidebarEmbeddedTabTreeRows({
      workspaceKey: "workspace-a",
      items: [item("agent_parent"), item("agent_child-a"), item("agent_child-b")],
      parentTabIdByTabId: {
        "agent_child-a": "agent_parent",
        "agent_child-b": "agent_parent",
      },
      expandedParentTabKeys: new Set(),
      statusSummariesByTabId: new Map([
        ["agent_parent", unreadSummary(1)],
        ["agent_child-a", unreadSummary(1)],
        ["agent_child-b", unreadSummary(1)],
      ]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.statusSummary.entryCounts.unread).toBe(3);
  });
});
