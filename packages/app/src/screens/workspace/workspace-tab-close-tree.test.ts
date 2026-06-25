import { describe, expect, it } from "vitest";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import {
  closeDescendantTabsBeforeParent,
  collectDescendantTabIdsByParentTabId,
} from "./workspace-tab-close-tree";

function tab(tabId: string): WorkspaceTab {
  return {
    tabId,
    target: { kind: "agent", agentId: tabId },
    createdAt: 1,
  };
}

describe("workspace tab close tree", () => {
  it("collects descendants deepest-first so children close before their parent", () => {
    const descendants = collectDescendantTabIdsByParentTabId({
      tabs: [tab("parent"), tab("child"), tab("grandchild"), tab("sibling")],
      parentTabIdByTabId: {
        child: "parent",
        grandchild: "child",
        sibling: "parent",
      },
    });

    expect(descendants.get("parent")).toEqual(["grandchild", "child", "sibling"]);
  });

  it("stops parent close when a descendant close is canceled", async () => {
    const closed: string[] = [];
    const result = await closeDescendantTabsBeforeParent({
      parentTabId: "parent",
      descendantTabIdsByParentTabId: new Map([["parent", ["child-a", "child-b"]]]),
      closeSingleTabById: async (tabId) => {
        closed.push(tabId);
        return tabId !== "child-a";
      },
    });

    expect(result).toBe(false);
    expect(closed).toEqual(["child-a"]);
  });

  it("allows parent close after every descendant closes", async () => {
    const closed: string[] = [];
    const result = await closeDescendantTabsBeforeParent({
      parentTabId: "parent",
      descendantTabIdsByParentTabId: new Map([["parent", ["child-a", "child-b"]]]),
      closeSingleTabById: async (tabId) => {
        closed.push(tabId);
        return true;
      },
    });

    expect(result).toBe(true);
    expect(closed).toEqual(["child-a", "child-b"]);
  });
});
