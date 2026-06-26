import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SidebarGroupMode = "project" | "status";
export type SidebarEmbeddedTabSortMode = "manual" | "created" | "lastUpdated" | "status";
export type SidebarWorkspaceSortMode = SidebarEmbeddedTabSortMode;
export type SidebarEmbeddedRecentTabCount = 3 | 5 | 10 | "all";
export type SidebarBadgeMode = "diff" | "status" | "none";

interface SidebarViewStoreState {
  groupModeByServerId: Record<string, SidebarGroupMode>;
  workspaceSortModeByServerId: Record<string, SidebarWorkspaceSortMode>;
  embeddedTabSortModeByServerId: Record<string, SidebarEmbeddedTabSortMode>;
  embeddedRecentTabCountByServerId: Record<string, SidebarEmbeddedRecentTabCount>;
  badgeModeByServerId: Record<string, SidebarBadgeMode>;
  autoCollapseProjects: boolean;
  autoCollapseWorkspaces: boolean;
  getGroupMode: (serverId: string) => SidebarGroupMode;
  setGroupMode: (serverId: string, mode: SidebarGroupMode) => void;
  getWorkspaceSortMode: (serverId: string) => SidebarWorkspaceSortMode;
  setWorkspaceSortMode: (serverId: string, mode: SidebarWorkspaceSortMode) => void;
  getEmbeddedTabSortMode: (serverId: string) => SidebarEmbeddedTabSortMode;
  setEmbeddedTabSortMode: (serverId: string, mode: SidebarEmbeddedTabSortMode) => void;
  getEmbeddedRecentTabCount: (serverId: string) => SidebarEmbeddedRecentTabCount;
  setEmbeddedRecentTabCount: (serverId: string, count: SidebarEmbeddedRecentTabCount) => void;
  getBadgeMode: (serverId: string) => SidebarBadgeMode;
  setBadgeMode: (serverId: string, mode: SidebarBadgeMode) => void;
  setAutoCollapseProjects: (enabled: boolean) => void;
  setAutoCollapseWorkspaces: (enabled: boolean) => void;
}

function normalizeTabSortMode(value: unknown): SidebarEmbeddedTabSortMode {
  return value === "created" || value === "lastUpdated" || value === "manual" || value === "status"
    ? value
    : "manual";
}

function normalizeRecentTabCount(value: unknown): SidebarEmbeddedRecentTabCount {
  return value === 3 || value === 5 || value === 10 || value === "all" ? value : 5;
}

function normalizeBadgeMode(value: unknown): SidebarBadgeMode {
  return value === "status" || value === "none" || value === "diff" ? value : "status";
}

export const useSidebarViewStore = create<SidebarViewStoreState>()(
  persist(
    (set, get) => ({
      groupModeByServerId: {},
      workspaceSortModeByServerId: {},
      embeddedTabSortModeByServerId: {},
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
      getWorkspaceSortMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "manual";
        return normalizeTabSortMode(get().workspaceSortModeByServerId[key]);
      },
      setWorkspaceSortMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          workspaceSortModeByServerId: {
            ...state.workspaceSortModeByServerId,
            [key]: normalizeTabSortMode(mode),
          },
        }));
      },
      getEmbeddedTabSortMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "manual";
        return normalizeTabSortMode(get().embeddedTabSortModeByServerId[key]);
      },
      setEmbeddedTabSortMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          embeddedTabSortModeByServerId: {
            ...state.embeddedTabSortModeByServerId,
            [key]: normalizeTabSortMode(mode),
          },
        }));
      },
      getEmbeddedRecentTabCount: (serverId) => {
        const key = serverId.trim();
        if (!key) return 5;
        return normalizeRecentTabCount(get().embeddedRecentTabCountByServerId[key]);
      },
      setEmbeddedRecentTabCount: (serverId, count) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          embeddedRecentTabCountByServerId: {
            ...state.embeddedRecentTabCountByServerId,
            [key]: normalizeRecentTabCount(count),
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
        workspaceSortModeByServerId: state.workspaceSortModeByServerId,
        embeddedTabSortModeByServerId: state.embeddedTabSortModeByServerId,
        embeddedRecentTabCountByServerId: state.embeddedRecentTabCountByServerId,
        badgeModeByServerId: state.badgeModeByServerId,
        autoCollapseProjects: state.autoCollapseProjects,
        autoCollapseWorkspaces: state.autoCollapseWorkspaces,
      }),
    },
  ),
);
