import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StateStorage } from "zustand/middleware";
import {
  createSidebarViewStorage,
  migrateSidebarViewState,
  useSidebarViewStore,
} from "./sidebar-view-store";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

interface MemoryStorage extends StateStorage<Promise<void>> {
  reads: string[];
}

function createMemoryStorage(entries: Record<string, string | null>): MemoryStorage {
  const reads: string[] = [];
  return {
    reads,
    getItem: async (name) => {
      reads.push(name);
      return entries[name] ?? null;
    },
    setItem: async (name, value) => {
      entries[name] = value;
    },
    removeItem: async (name) => {
      entries[name] = null;
    },
  };
}

describe("sidebar view store", () => {
  beforeEach(() => {
    useSidebarViewStore.setState({
      groupMode: "project",
      projectSelectorRowEnabled: false,
      projectSelectorRowProjectKey: null,
      hostFilter: null,
      groupModeByServerId: {},
      projectSortModeByServerId: {},
      workspaceSortModeByServerId: {},
      embeddedTabSortModeByServerId: {},
      projectShowLastCountByServerId: {},
      workspaceShowLastCountByServerId: {},
      embeddedRecentTabCountByServerId: {},
      badgeModeByServerId: {},
      tabBarBadgeModeByServerId: {},
      autoCollapseProjects: false,
      autoCollapseWorkspaces: false,
    });
  });

  it("keeps a host filter that still points at an available host", () => {
    useSidebarViewStore.getState().setHostFilter("host-a");

    useSidebarViewStore.getState().reconcileHostFilter(["host-a", "host-b"]);

    expect(useSidebarViewStore.getState().hostFilter).toBe("host-a");
  });

  it("clears a host filter after that host is removed", () => {
    useSidebarViewStore.getState().setHostFilter("removed-host");

    useSidebarViewStore.getState().reconcileHostFilter(["host-a"]);

    expect(useSidebarViewStore.getState().hostFilter).toBeNull();
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
      tabBarBadgeModeByServerId: { srv: "diff" as never },
    });

    expect(useSidebarViewStore.getState().getProjectSortMode("srv")).toBe("manual");
    expect(useSidebarViewStore.getState().getWorkspaceSortMode("srv")).toBe("manual");
    expect(useSidebarViewStore.getState().getEmbeddedTabSortMode("srv")).toBe("manual");
    expect(useSidebarViewStore.getState().getProjectShowLastCount("srv")).toBe("all");
    expect(useSidebarViewStore.getState().getWorkspaceShowLastCount("srv")).toBe("all");
    expect(useSidebarViewStore.getState().getEmbeddedRecentTabCount("srv")).toBe(5);
    expect(useSidebarViewStore.getState().getBadgeMode("srv")).toBe("status");
    expect(useSidebarViewStore.getState().getTabBarBadgeMode("srv")).toBe("status");
  });

  it("trims server ids before storing embedded tab preferences", () => {
    useSidebarViewStore.getState().setGroupMode("  srv  ", "status");
    useSidebarViewStore.getState().setProjectSortMode("  srv  ", "created");
    useSidebarViewStore.getState().setWorkspaceSortMode("  srv  ", "status");
    useSidebarViewStore.getState().setEmbeddedTabSortMode("  srv  ", "lastUpdated");
    useSidebarViewStore.getState().setProjectShowLastCount("  srv  ", 3);
    useSidebarViewStore.getState().setWorkspaceShowLastCount("  srv  ", 10);
    useSidebarViewStore.getState().setEmbeddedRecentTabCount("  srv  ", "all");
    useSidebarViewStore.getState().setBadgeMode("  srv  ", "diff");
    useSidebarViewStore.getState().setTabBarBadgeMode("  srv  ", "none");

    expect(useSidebarViewStore.getState().groupModeByServerId).toEqual({
      srv: "status",
    });
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
      srv: "diff",
    });
    expect(useSidebarViewStore.getState().tabBarBadgeModeByServerId).toEqual({
      srv: "none",
    });
  });

  it("defaults sidebar and tab bar badge modes to status", () => {
    expect(useSidebarViewStore.getState().getBadgeMode("srv")).toBe("status");
    expect(useSidebarViewStore.getState().getTabBarBadgeMode("srv")).toBe("status");
  });

  it("stores the auto-collapse workspace display preference", () => {
    useSidebarViewStore.getState().setAutoCollapseWorkspaces(true);

    expect(useSidebarViewStore.getState().autoCollapseWorkspaces).toBe(true);
  });

  it("stores the auto-collapse project display preference", () => {
    useSidebarViewStore.getState().setAutoCollapseProjects(true);

    expect(useSidebarViewStore.getState().autoCollapseProjects).toBe(true);
  });

  it("migrates legacy per-host group modes to the global and per-host modes", () => {
    expect(
      migrateSidebarViewState({
        groupModeByServerId: {
          "host-a": "project",
          "host-b": "status",
        },
      }),
    ).toMatchObject({
      groupMode: "status",
      hostFilter: null,
      groupModeByServerId: {
        "host-a": "project",
        "host-b": "status",
      },
    });
  });

  it("keeps current persisted sidebar view state during version migration", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "status",
        hostFilter: "host-a",
        projectSelectorRowEnabled: true,
        projectSelectorRowProjectKey: "project-a",
        embeddedTabSortModeByServerId: { "host-a": "created" },
      }),
    ).toMatchObject({
      groupMode: "status",
      hostFilter: "host-a",
      projectSelectorRowEnabled: true,
      projectSelectorRowProjectKey: "project-a",
      embeddedTabSortModeByServerId: { "host-a": "created" },
    });
  });

  it("migrates pre-rename single project view fields to project selector row fields", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "project",
        singleProjectViewEnabled: true,
        singleProjectViewProjectKey: "project-a",
      }),
    ).toMatchObject({
      projectSelectorRowEnabled: true,
      projectSelectorRowProjectKey: "project-a",
    });
  });

  it("stores project selector row preferences independently from group mode", () => {
    useSidebarViewStore.getState().setGroupMode("status");
    useSidebarViewStore.getState().setProjectSelectorRowEnabled(true);
    useSidebarViewStore.getState().setProjectSelectorRowProjectKey("project-a");

    expect(useSidebarViewStore.getState()).toMatchObject({
      groupMode: "status",
      projectSelectorRowEnabled: true,
      projectSelectorRowProjectKey: "project-a",
    });
  });

  it("falls back to the legacy storage key when the new key is empty", async () => {
    const storage = createMemoryStorage({
      "sidebar-view": null,
      "sidebar-group-mode": JSON.stringify({
        state: { groupModeByServerId: { "host-a": "status" } },
        version: 0,
      }),
    });

    const value = await createSidebarViewStorage(storage).getItem("sidebar-view");

    expect(value).toBe(
      JSON.stringify({
        state: { groupModeByServerId: { "host-a": "status" } },
        version: 0,
      }),
    );
    expect(storage.reads).toEqual(["sidebar-view", "sidebar-group-mode"]);
  });

  it("uses the new storage key without reading the legacy key when current state exists", async () => {
    const storage = createMemoryStorage({
      "sidebar-view": JSON.stringify({
        state: { groupMode: "project", hostFilter: "host-a" },
        version: 1,
      }),
      "sidebar-group-mode": JSON.stringify({
        state: { groupModeByServerId: { "host-b": "status" } },
        version: 0,
      }),
    });

    const value = await createSidebarViewStorage(storage).getItem("sidebar-view");

    expect(value).toBe(
      JSON.stringify({
        state: { groupMode: "project", hostFilter: "host-a" },
        version: 1,
      }),
    );
    expect(storage.reads).toEqual(["sidebar-view"]);
  });
});
