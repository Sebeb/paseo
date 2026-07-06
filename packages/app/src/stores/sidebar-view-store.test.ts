import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { useSidebarViewStore } from "@/stores/sidebar-view-store";

describe("sidebar-view-store", () => {
  beforeEach(() => {
    useSidebarViewStore.setState({
      groupModeByServerId: {},
      projectSortModeByServerId: {},
      workspaceSortModeByServerId: {},
      embeddedTabSortModeByServerId: {},
      projectShowLastCountByServerId: {},
      workspaceShowLastCountByServerId: {},
      embeddedRecentTabCountByServerId: {},
      badgeModeByServerId: {},
      autoCollapseProjects: false,
      autoCollapseWorkspaces: false,
    });
  });

  it("normalizes embedded tab preferences loaded from persisted state", () => {
    useSidebarViewStore.setState({
      projectSortModeByServerId: { srv: "bad-value" as never },
      workspaceSortModeByServerId: { srv: "bad-value" as never },
      embeddedTabSortModeByServerId: { srv: "bad-value" as never },
      projectShowLastCountByServerId: { srv: 99 as never },
      workspaceShowLastCountByServerId: { srv: 99 as never },
      embeddedRecentTabCountByServerId: { srv: 99 as never },
      badgeModeByServerId: { srv: "bad-value" as never },
    });

    expect(useSidebarViewStore.getState().getProjectSortMode("srv")).toBe("manual");
    expect(useSidebarViewStore.getState().getWorkspaceSortMode("srv")).toBe("manual");
    expect(useSidebarViewStore.getState().getEmbeddedTabSortMode("srv")).toBe("manual");
    expect(useSidebarViewStore.getState().getProjectShowLastCount("srv")).toBe("all");
    expect(useSidebarViewStore.getState().getWorkspaceShowLastCount("srv")).toBe("all");
    expect(useSidebarViewStore.getState().getEmbeddedRecentTabCount("srv")).toBe(5);
    expect(useSidebarViewStore.getState().getBadgeMode("srv")).toBe("status");
  });

  it("trims server ids before storing embedded tab preferences", () => {
    useSidebarViewStore.getState().setProjectSortMode("  srv  ", "created");
    useSidebarViewStore.getState().setWorkspaceSortMode("  srv  ", "status");
    useSidebarViewStore.getState().setEmbeddedTabSortMode("  srv  ", "lastUpdated");
    useSidebarViewStore.getState().setProjectShowLastCount("  srv  ", 3);
    useSidebarViewStore.getState().setWorkspaceShowLastCount("  srv  ", 10);
    useSidebarViewStore.getState().setEmbeddedRecentTabCount("  srv  ", "all");
    useSidebarViewStore.getState().setBadgeMode("  srv  ", "status");

    expect(useSidebarViewStore.getState().projectSortModeByServerId).toEqual({
      srv: "created",
    });
    expect(useSidebarViewStore.getState().workspaceSortModeByServerId).toEqual({
      srv: "status",
    });
    expect(useSidebarViewStore.getState().embeddedTabSortModeByServerId).toEqual({
      srv: "lastUpdated",
    });
    expect(useSidebarViewStore.getState().projectShowLastCountByServerId).toEqual({
      srv: 3,
    });
    expect(useSidebarViewStore.getState().workspaceShowLastCountByServerId).toEqual({
      srv: 10,
    });
    expect(useSidebarViewStore.getState().embeddedRecentTabCountByServerId).toEqual({
      srv: "all",
    });
    expect(useSidebarViewStore.getState().badgeModeByServerId).toEqual({
      srv: "status",
    });
  });

  it("defaults sidebar badge mode to status", () => {
    expect(useSidebarViewStore.getState().getBadgeMode("srv")).toBe("status");
  });

  it("stores the auto-collapse workspace display preference", () => {
    useSidebarViewStore.getState().setAutoCollapseWorkspaces(true);

    expect(useSidebarViewStore.getState().autoCollapseWorkspaces).toBe(true);
  });

  it("stores the auto-collapse project display preference", () => {
    useSidebarViewStore.getState().setAutoCollapseProjects(true);

    expect(useSidebarViewStore.getState().autoCollapseProjects).toBe(true);
  });
});
