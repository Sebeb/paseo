import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type SidebarGroupMode = "project" | "status";
export type SidebarEmbeddedTabSortMode = "manual" | "created" | "lastUpdated" | "status";
export type SidebarWorkspaceSortMode = SidebarEmbeddedTabSortMode;
export type SidebarEmbeddedRecentTabCount = 3 | 5 | 10 | "all";
export type SidebarBadgeMode = "diff" | "status" | "none";
export type SidebarTabBarBadgeMode = "status" | "none";

const SIDEBAR_VIEW_STORAGE_KEY = "sidebar-view";
const LEGACY_SIDEBAR_GROUP_MODE_STORAGE_KEY = "sidebar-group-mode";
const SIDEBAR_VIEW_STORE_VERSION = 3;

interface SidebarViewStoreState {
  groupMode: SidebarGroupMode;
  singleProjectViewEnabled: boolean;
  singleProjectViewProjectKey: string | null;
  hostFilter: string | null;
  groupModeByServerId: Record<string, SidebarGroupMode>;
  workspaceSortModeByServerId: Record<string, SidebarWorkspaceSortMode>;
  embeddedTabSortModeByServerId: Record<string, SidebarEmbeddedTabSortMode>;
  embeddedRecentTabCountByServerId: Record<string, SidebarEmbeddedRecentTabCount>;
  badgeModeByServerId: Record<string, SidebarBadgeMode>;
  tabBarBadgeModeByServerId: Record<string, SidebarTabBarBadgeMode>;
  autoCollapseProjects: boolean;
  autoCollapseWorkspaces: boolean;
  setGroupMode: (serverIdOrMode: string, mode?: SidebarGroupMode) => void;
  setSingleProjectViewEnabled: (enabled: boolean) => void;
  setSingleProjectViewProjectKey: (projectKey: string | null) => void;
  setHostFilter: (serverId: string | null) => void;
  reconcileHostFilter: (serverIds: readonly string[]) => void;
  getGroupMode: (serverId: string) => SidebarGroupMode;
  getWorkspaceSortMode: (serverId: string) => SidebarWorkspaceSortMode;
  setWorkspaceSortMode: (serverId: string, mode: SidebarWorkspaceSortMode) => void;
  getEmbeddedTabSortMode: (serverId: string) => SidebarEmbeddedTabSortMode;
  setEmbeddedTabSortMode: (serverId: string, mode: SidebarEmbeddedTabSortMode) => void;
  getEmbeddedRecentTabCount: (serverId: string) => SidebarEmbeddedRecentTabCount;
  setEmbeddedRecentTabCount: (serverId: string, count: SidebarEmbeddedRecentTabCount) => void;
  getBadgeMode: (serverId: string) => SidebarBadgeMode;
  setBadgeMode: (serverId: string, mode: SidebarBadgeMode) => void;
  getTabBarBadgeMode: (serverId: string) => SidebarTabBarBadgeMode;
  setTabBarBadgeMode: (serverId: string, mode: SidebarTabBarBadgeMode) => void;
  setAutoCollapseProjects: (enabled: boolean) => void;
  setAutoCollapseWorkspaces: (enabled: boolean) => void;
}

interface SidebarViewPersistedState {
  groupMode: SidebarGroupMode;
  singleProjectViewEnabled: boolean;
  singleProjectViewProjectKey: string | null;
  hostFilter: string | null;
  groupModeByServerId: Record<string, SidebarGroupMode>;
  workspaceSortModeByServerId: Record<string, SidebarWorkspaceSortMode>;
  embeddedTabSortModeByServerId: Record<string, SidebarEmbeddedTabSortMode>;
  embeddedRecentTabCountByServerId: Record<string, SidebarEmbeddedRecentTabCount>;
  badgeModeByServerId: Record<string, SidebarBadgeMode>;
  tabBarBadgeModeByServerId: Record<string, SidebarTabBarBadgeMode>;
  autoCollapseProjects: boolean;
  autoCollapseWorkspaces: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSidebarGroupMode(value: unknown): value is SidebarGroupMode {
  return value === "project" || value === "status";
}

function normalizeGroupMode(value: unknown): SidebarGroupMode {
  return isSidebarGroupMode(value) ? value : "project";
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

function normalizeTabBarBadgeMode(value: unknown): SidebarTabBarBadgeMode {
  return value === "status" || value === "none" ? value : "status";
}

function normalizeRecord<T>(value: unknown, normalize: (entry: unknown) => T): Record<string, T> {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key.trim(), normalize(entry)])
      .filter(([key]) => key),
  );
}

function readLegacyGroupMode(persistedState: Record<string, unknown>): SidebarGroupMode | null {
  const groupModeByServerId = persistedState.groupModeByServerId;
  if (!isRecord(groupModeByServerId)) return null;

  const modes = Object.values(groupModeByServerId).filter(isSidebarGroupMode);
  if (modes.length === 0) return null;
  return modes.includes("status") ? "status" : "project";
}

export function migrateSidebarViewState(persistedState: unknown): SidebarViewPersistedState {
  if (!isRecord(persistedState)) {
    return createDefaultPersistedState();
  }

  const groupModeByServerId = normalizeRecord(
    persistedState.groupModeByServerId,
    normalizeGroupMode,
  );
  const legacyGroupMode = readLegacyGroupMode(persistedState);

  return {
    groupMode:
      legacyGroupMode ??
      (isSidebarGroupMode(persistedState.groupMode) ? persistedState.groupMode : "project"),
    singleProjectViewEnabled:
      legacyGroupMode === null && typeof persistedState.singleProjectViewEnabled === "boolean"
        ? persistedState.singleProjectViewEnabled
        : false,
    singleProjectViewProjectKey:
      legacyGroupMode === null && typeof persistedState.singleProjectViewProjectKey === "string"
        ? persistedState.singleProjectViewProjectKey
        : null,
    hostFilter: typeof persistedState.hostFilter === "string" ? persistedState.hostFilter : null,
    groupModeByServerId,
    workspaceSortModeByServerId: normalizeRecord(
      persistedState.workspaceSortModeByServerId,
      normalizeTabSortMode,
    ),
    embeddedTabSortModeByServerId: normalizeRecord(
      persistedState.embeddedTabSortModeByServerId,
      normalizeTabSortMode,
    ),
    embeddedRecentTabCountByServerId: normalizeRecord(
      persistedState.embeddedRecentTabCountByServerId,
      normalizeRecentTabCount,
    ),
    badgeModeByServerId: normalizeRecord(persistedState.badgeModeByServerId, normalizeBadgeMode),
    tabBarBadgeModeByServerId: normalizeRecord(
      persistedState.tabBarBadgeModeByServerId,
      normalizeTabBarBadgeMode,
    ),
    autoCollapseProjects: persistedState.autoCollapseProjects === true,
    autoCollapseWorkspaces: persistedState.autoCollapseWorkspaces === true,
  };
}

function createDefaultPersistedState(): SidebarViewPersistedState {
  return {
    groupMode: "project",
    singleProjectViewEnabled: false,
    singleProjectViewProjectKey: null,
    hostFilter: null,
    groupModeByServerId: {},
    workspaceSortModeByServerId: {},
    embeddedTabSortModeByServerId: {},
    embeddedRecentTabCountByServerId: {},
    badgeModeByServerId: {},
    tabBarBadgeModeByServerId: {},
    autoCollapseProjects: false,
    autoCollapseWorkspaces: false,
  };
}

export function createSidebarViewStorage(
  backingStorage: StateStorage = AsyncStorage,
): StateStorage {
  return {
    getItem: async (name) => {
      const value = await backingStorage.getItem(name);
      if (value !== null || name !== SIDEBAR_VIEW_STORAGE_KEY) return value;
      return backingStorage.getItem(LEGACY_SIDEBAR_GROUP_MODE_STORAGE_KEY);
    },
    setItem: (name, value) => backingStorage.setItem(name, value),
    removeItem: (name) => backingStorage.removeItem(name),
  };
}

export const useSidebarViewStore = create<SidebarViewStoreState>()(
  persist(
    (set, get) => ({
      groupMode: "project",
      singleProjectViewEnabled: false,
      singleProjectViewProjectKey: null,
      hostFilter: null,
      groupModeByServerId: {},
      workspaceSortModeByServerId: {},
      embeddedTabSortModeByServerId: {},
      embeddedRecentTabCountByServerId: {},
      badgeModeByServerId: {},
      tabBarBadgeModeByServerId: {},
      autoCollapseProjects: false,
      autoCollapseWorkspaces: false,
      setGroupMode: (serverIdOrMode, maybeMode) => {
        if (maybeMode === undefined) {
          set({ groupMode: normalizeGroupMode(serverIdOrMode) });
          return;
        }

        const key = serverIdOrMode.trim();
        if (!key) return;
        set((state) => ({
          groupModeByServerId: {
            ...state.groupModeByServerId,
            [key]: maybeMode,
          },
        }));
      },
      setSingleProjectViewEnabled: (enabled) => set({ singleProjectViewEnabled: enabled }),
      setSingleProjectViewProjectKey: (projectKey) =>
        set({ singleProjectViewProjectKey: projectKey }),
      setHostFilter: (serverId) => set({ hostFilter: serverId }),
      reconcileHostFilter: (serverIds) =>
        set((state) => {
          if (!state.hostFilter || serverIds.includes(state.hostFilter)) return state;
          return { hostFilter: null };
        }),
      getGroupMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "project";
        return get().groupModeByServerId[key] ?? get().groupMode;
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
      getTabBarBadgeMode: (serverId) => {
        const key = serverId.trim();
        if (!key) return "status";
        return normalizeTabBarBadgeMode(get().tabBarBadgeModeByServerId[key]);
      },
      setTabBarBadgeMode: (serverId, mode) => {
        const key = serverId.trim();
        if (!key) return;
        set((state) => ({
          tabBarBadgeModeByServerId: {
            ...state.tabBarBadgeModeByServerId,
            [key]: normalizeTabBarBadgeMode(mode),
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
      name: SIDEBAR_VIEW_STORAGE_KEY,
      version: SIDEBAR_VIEW_STORE_VERSION,
      storage: createJSONStorage(createSidebarViewStorage),
      partialize: (state) => ({
        groupMode: state.groupMode,
        singleProjectViewEnabled: state.singleProjectViewEnabled,
        singleProjectViewProjectKey: state.singleProjectViewProjectKey,
        hostFilter: state.hostFilter,
        groupModeByServerId: state.groupModeByServerId,
        workspaceSortModeByServerId: state.workspaceSortModeByServerId,
        embeddedTabSortModeByServerId: state.embeddedTabSortModeByServerId,
        embeddedRecentTabCountByServerId: state.embeddedRecentTabCountByServerId,
        badgeModeByServerId: state.badgeModeByServerId,
        tabBarBadgeModeByServerId: state.tabBarBadgeModeByServerId,
        autoCollapseProjects: state.autoCollapseProjects,
        autoCollapseWorkspaces: state.autoCollapseWorkspaces,
      }),
      migrate: migrateSidebarViewState,
    },
  ),
);
