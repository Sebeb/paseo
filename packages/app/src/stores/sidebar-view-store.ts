import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SidebarGroupMode = "project" | "status";
export type SidebarSortMode = "manual" | "created" | "lastUpdated" | "status";
export type SidebarEmbeddedTabSortMode = SidebarSortMode;
export type SidebarWorkspaceSortMode = SidebarSortMode;
export type SidebarProjectSortMode = SidebarSortMode;
export type SidebarShowLastCount = 3 | 5 | 10 | "all";
export type SidebarEmbeddedRecentTabCount = SidebarShowLastCount;
export type SidebarWorkspaceShowLastCount = SidebarShowLastCount;
export type SidebarProjectShowLastCount = SidebarShowLastCount;
export type SidebarBadgeMode = "diff" | "status" | "none";

interface SidebarViewStoreState {
  groupModeByServerId: Record<string, SidebarGroupMode>;
  projectSortModeByServerId: Record<string, SidebarProjectSortMode>;
  workspaceSortModeByServerId: Record<string, SidebarWorkspaceSortMode>;
  embeddedTabSortModeByServerId: Record<string, SidebarEmbeddedTabSortMode>;
  projectShowLastCountByServerId: Record<string, SidebarProjectShowLastCount>;
  workspaceShowLastCountByServerId: Record<string, SidebarWorkspaceShowLastCount>;
  embeddedRecentTabCountByServerId: Record<string, SidebarEmbeddedRecentTabCount>;
  badgeModeByServerId: Record<string, SidebarBadgeMode>;
  autoCollapseProjects: boolean;
  autoCollapseWorkspaces: boolean;
  getGroupMode: (serverId: string) => SidebarGroupMode;
  setGroupMode: (serverId: string, mode: SidebarGroupMode) => void;
  getProjectSortMode: (serverId: string) => SidebarProjectSortMode;
  setProjectSortMode: (serverId: string, mode: SidebarProjectSortMode) => void;
  getWorkspaceSortMode: (serverId: string) => SidebarWorkspaceSortMode;
  setWorkspaceSortMode: (serverId: string, mode: SidebarWorkspaceSortMode) => void;
  getEmbeddedTabSortMode: (serverId: string) => SidebarEmbeddedTabSortMode;
  setEmbeddedTabSortMode: (serverId: string, mode: SidebarEmbeddedTabSortMode) => void;
  getProjectShowLastCount: (serverId: string) => SidebarProjectShowLastCount;
  setProjectShowLastCount: (serverId: string, count: SidebarProjectShowLastCount) => void;
  getWorkspaceShowLastCount: (serverId: string) => SidebarWorkspaceShowLastCount;
  setWorkspaceShowLastCount: (serverId: string, count: SidebarWorkspaceShowLastCount) => void;
  getEmbeddedRecentTabCount: (serverId: string) => SidebarEmbeddedRecentTabCount;
  setEmbeddedRecentTabCount: (serverId: string, count: SidebarEmbeddedRecentTabCount) => void;
  getBadgeMode: (serverId: string) => SidebarBadgeMode;
  setBadgeMode: (serverId: string, mode: SidebarBadgeMode) => void;
  setAutoCollapseProjects: (enabled: boolean) => void;
  setAutoCollapseWorkspaces: (enabled: boolean) => void;
}

function normalizeSortMode(value: unknown): SidebarSortMode {
  return value === "created" || value === "lastUpdated" || value === "manual" || value === "status"
    ? value
    : "manual";
}

function normalizeShowLastCount(
  value: unknown,
  fallback: SidebarShowLastCount,
): SidebarShowLastCount {
  return value === 3 || value === 5 || value === 10 || value === "all" ? value : fallback;
}

function normalizeBadgeMode(value: unknown): SidebarBadgeMode {
  return value === "status" || value === "none" || value === "diff" ? value : "status";
}

export const useSidebarViewStore = create<SidebarViewStoreState>()(
  persist(
    (set, get) => ({
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
      getGroupMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "project";
        return get().groupModeByServerId[key] ?? "project";
      },
      setGroupMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          groupModeByServerId: {
            ...state.groupModeByServerId,
            [key]: mode,
          },
        }));
      },
      getProjectSortMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "manual";
        return normalizeSortMode(get().projectSortModeByServerId[key]);
      },
      setProjectSortMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          projectSortModeByServerId: {
            ...state.projectSortModeByServerId,
            [key]: normalizeSortMode(mode),
          },
        }));
      },
      getWorkspaceSortMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "manual";
        return normalizeSortMode(get().workspaceSortModeByServerId[key]);
      },
      setWorkspaceSortMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          workspaceSortModeByServerId: {
            ...state.workspaceSortModeByServerId,
            [key]: normalizeSortMode(mode),
          },
        }));
      },
      getEmbeddedTabSortMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "manual";
        return normalizeSortMode(get().embeddedTabSortModeByServerId[key]);
      },
      setEmbeddedTabSortMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          embeddedTabSortModeByServerId: {
            ...state.embeddedTabSortModeByServerId,
            [key]: normalizeSortMode(mode),
          },
        }));
      },
      getProjectShowLastCount: (serverId) => {
        const key = serverId.trim();
        if (!key) return "all";
        return normalizeShowLastCount(get().projectShowLastCountByServerId[key], "all");
      },
      setProjectShowLastCount: (serverId, count) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          projectShowLastCountByServerId: {
            ...state.projectShowLastCountByServerId,
            [key]: normalizeShowLastCount(count, "all"),
          },
        }));
      },
      getWorkspaceShowLastCount: (serverId) => {
        const key = serverId.trim();
        if (!key) return "all";
        return normalizeShowLastCount(get().workspaceShowLastCountByServerId[key], "all");
      },
      setWorkspaceShowLastCount: (serverId, count) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          workspaceShowLastCountByServerId: {
            ...state.workspaceShowLastCountByServerId,
            [key]: normalizeShowLastCount(count, "all"),
          },
        }));
      },
      getEmbeddedRecentTabCount: (serverId) => {
        const key = serverId.trim();
        if (!key) return 5;
        return normalizeShowLastCount(get().embeddedRecentTabCountByServerId[key], 5);
      },
      setEmbeddedRecentTabCount: (serverId, count) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          embeddedRecentTabCountByServerId: {
            ...state.embeddedRecentTabCountByServerId,
            [key]: normalizeShowLastCount(count, 5),
          },
        }));
      },
      getBadgeMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "status";
        return normalizeBadgeMode(get().badgeModeByServerId[key]);
      },
      setBadgeMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          badgeModeByServerId: {
            ...state.badgeModeByServerId,
            [key]: normalizeBadgeMode(mode),
          },
        }));
      },
      setAutoCollapseProjects: (enabled) => {
        set({ autoCollapseProjects: enabled });
      },
      setAutoCollapseWorkspaces: (enabled) => {
        set({ autoCollapseWorkspaces: enabled });
      },
    }),
    {
      name: "sidebar-group-mode",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        groupModeByServerId: state.groupModeByServerId,
        projectSortModeByServerId: state.projectSortModeByServerId,
        workspaceSortModeByServerId: state.workspaceSortModeByServerId,
        embeddedTabSortModeByServerId: state.embeddedTabSortModeByServerId,
        projectShowLastCountByServerId: state.projectShowLastCountByServerId,
        workspaceShowLastCountByServerId: state.workspaceShowLastCountByServerId,
        embeddedRecentTabCountByServerId: state.embeddedRecentTabCountByServerId,
        badgeModeByServerId: state.badgeModeByServerId,
        autoCollapseProjects: state.autoCollapseProjects,
        autoCollapseWorkspaces: state.autoCollapseWorkspaces,
      }),
    },
  ),
);
