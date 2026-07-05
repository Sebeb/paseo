import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type SidebarGroupMode = "project" | "status";

const SIDEBAR_VIEW_STORAGE_KEY = "sidebar-view";
const LEGACY_SIDEBAR_GROUP_MODE_STORAGE_KEY = "sidebar-group-mode";
const SIDEBAR_VIEW_STORE_VERSION = 3;

interface SidebarViewStoreState {
  groupMode: SidebarGroupMode;
  singleProjectViewEnabled: boolean;
  singleProjectViewProjectKey: string | null;
  // Empty means "all hosts". A non-empty list pins the sidebar to those hosts.
  hostFilters: string[];
  setGroupMode: (mode: SidebarGroupMode) => void;
  setSingleProjectViewEnabled: (enabled: boolean) => void;
  setSingleProjectViewProjectKey: (projectKey: string | null) => void;
  toggleHostFilter: (serverId: string) => void;
  clearHostFilters: () => void;
  reconcileHostFilters: (serverIds: readonly string[]) => void;
}

interface SidebarViewPersistedState {
  groupMode: SidebarGroupMode;
  singleProjectViewEnabled: boolean;
  singleProjectViewProjectKey: string | null;
  hostFilters: string[];
}

function isSidebarGroupMode(value: unknown): value is SidebarGroupMode {
  return value === "project" || value === "status";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readLegacyGroupMode(persistedState: Record<string, unknown>): SidebarGroupMode | null {
  const groupModeByServerId = persistedState.groupModeByServerId;
  if (!isRecord(groupModeByServerId)) {
    return null;
  }

  const modes = Object.values(groupModeByServerId).filter(isSidebarGroupMode);
  if (modes.length === 0) return null;
  return modes.includes("status") ? "status" : "project";
}

// Reads the host filter from any persisted shape: the current `hostFilters` array, or the
// pre-v2 single `hostFilter` string (null/absent meant "all hosts").
function readHostFilters(persistedState: Record<string, unknown>): string[] {
  const hostFilters = persistedState.hostFilters;
  if (Array.isArray(hostFilters)) {
    return hostFilters.filter((value): value is string => typeof value === "string");
  }
  // COMPAT(sidebarHostFilters): added in v0.1.102, remove after 2026-12-30 once pre-v2 persisted
  // sidebar state (a single `hostFilter` string) has aged out.
  const legacyHostFilter = persistedState.hostFilter;
  return typeof legacyHostFilter === "string" ? [legacyHostFilter] : [];
}

export function migrateSidebarViewState(persistedState: unknown): SidebarViewPersistedState {
  if (!isRecord(persistedState)) {
    return {
      groupMode: "project",
      singleProjectViewEnabled: false,
      singleProjectViewProjectKey: null,
      hostFilters: [],
    };
  }

  const legacyGroupMode = readLegacyGroupMode(persistedState);
  if (legacyGroupMode) {
    return {
      groupMode: legacyGroupMode,
      singleProjectViewEnabled: false,
      singleProjectViewProjectKey: null,
      hostFilters: [],
    };
  }

  return {
    groupMode: isSidebarGroupMode(persistedState.groupMode) ? persistedState.groupMode : "project",
    singleProjectViewEnabled:
      typeof persistedState.singleProjectViewEnabled === "boolean"
        ? persistedState.singleProjectViewEnabled
        : false,
    singleProjectViewProjectKey:
      typeof persistedState.singleProjectViewProjectKey === "string"
        ? persistedState.singleProjectViewProjectKey
        : null,
    hostFilters: readHostFilters(persistedState),
  };
}

export function createSidebarViewStorage(
  backingStorage: StateStorage = AsyncStorage,
): StateStorage {
  return {
    getItem: async (name) => {
      const value = await backingStorage.getItem(name);
      if (value !== null || name !== SIDEBAR_VIEW_STORAGE_KEY) {
        return value;
      }
      return backingStorage.getItem(LEGACY_SIDEBAR_GROUP_MODE_STORAGE_KEY);
    },
    setItem: (name, value) => backingStorage.setItem(name, value),
    removeItem: (name) => backingStorage.removeItem(name),
  };
}

export const useSidebarViewStore = create<SidebarViewStoreState>()(
  persist(
    (set) => ({
      groupMode: "project",
      singleProjectViewEnabled: false,
      singleProjectViewProjectKey: null,
      hostFilters: [],
      setGroupMode: (mode) => set({ groupMode: mode }),
      setSingleProjectViewEnabled: (enabled) => set({ singleProjectViewEnabled: enabled }),
      setSingleProjectViewProjectKey: (projectKey) =>
        set({ singleProjectViewProjectKey: projectKey }),
      toggleHostFilter: (serverId) =>
        set((state) => ({
          hostFilters: state.hostFilters.includes(serverId)
            ? state.hostFilters.filter((id) => id !== serverId)
            : [...state.hostFilters, serverId],
        })),
      clearHostFilters: () => set({ hostFilters: [] }),
      reconcileHostFilters: (serverIds) =>
        set((state) => {
          if (state.hostFilters.length === 0) {
            return state;
          }
          const allowed = new Set(serverIds);
          const next = state.hostFilters.filter((id) => allowed.has(id));
          if (next.length === state.hostFilters.length) {
            return state;
          }
          return { hostFilters: next };
        }),
    }),
    {
      name: SIDEBAR_VIEW_STORAGE_KEY,
      version: SIDEBAR_VIEW_STORE_VERSION,
      storage: createJSONStorage(createSidebarViewStorage),
      partialize: (state) => ({
        groupMode: state.groupMode,
        singleProjectViewEnabled: state.singleProjectViewEnabled,
        singleProjectViewProjectKey: state.singleProjectViewProjectKey,
        hostFilters: state.hostFilters,
      }),
      migrate: migrateSidebarViewState,
    },
  ),
);
