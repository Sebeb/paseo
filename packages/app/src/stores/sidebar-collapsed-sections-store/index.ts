import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type CollapsedProjectsState,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setOnlyWorkspaceExpanded,
  setProjectCollapsed,
  setWorkspaceCollapsed,
  setWorkspacesCollapsed,
  toggleParentTabExpanded,
  toggleProjectCollapsed,
  toggleStatusGroupCollapsed,
  toggleWorkspaceCollapsed,
} from "./state";

interface SidebarCollapsedSectionsState extends CollapsedProjectsState {
  toggleProjectCollapsed: (projectKey: string) => void;
  setProjectCollapsed: (projectKey: string, collapsed: boolean) => void;
  toggleStatusGroupCollapsed: (statusGroupKey: string) => void;
  toggleWorkspaceCollapsed: (workspaceKey: string) => void;
  setOnlyWorkspaceExpanded: (workspaceKey: string, workspaceKeys: readonly string[]) => void;
  setWorkspaceCollapsed: (workspaceKey: string, collapsed: boolean) => void;
  setWorkspacesCollapsed: (workspaceKeys: readonly string[], collapsed: boolean) => void;
  toggleParentTabExpanded: (parentTabKey: string) => void;
}

export const useSidebarCollapsedSectionsStore = create<SidebarCollapsedSectionsState>()(
  persist(
    (set) => ({
      collapsedProjectKeys: new Set(),
      collapsedStatusGroupKeys: new Set(),
      collapsedWorkspaceKeys: new Set(),
      expandedParentTabKeys: new Set(),
      toggleProjectCollapsed: (projectKey) =>
        set((state) => toggleProjectCollapsed(state, projectKey)),
      setProjectCollapsed: (projectKey, collapsed) =>
        set((state) => setProjectCollapsed(state, projectKey, collapsed)),
      toggleStatusGroupCollapsed: (statusGroupKey) =>
        set((state) => toggleStatusGroupCollapsed(state, statusGroupKey)),
      toggleWorkspaceCollapsed: (workspaceKey) =>
        set((state) => toggleWorkspaceCollapsed(state, workspaceKey)),
      setOnlyWorkspaceExpanded: (workspaceKey, workspaceKeys) =>
        set((state) => setOnlyWorkspaceExpanded(state, workspaceKey, workspaceKeys)),
      setWorkspaceCollapsed: (workspaceKey, collapsed) =>
        set((state) => setWorkspaceCollapsed(state, workspaceKey, collapsed)),
      setWorkspacesCollapsed: (workspaceKeys, collapsed) =>
        set((state) => setWorkspacesCollapsed(state, workspaceKeys, collapsed)),
      toggleParentTabExpanded: (parentTabKey) =>
        set((state) => toggleParentTabExpanded(state, parentTabKey)),
    }),
    {
      name: "sidebar-collapsed-sections",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => serializeCollapsedProjects(state),
      merge: (persistedState, currentState) =>
        mergePersistedCollapsedProjects(
          persistedState as
            | {
                collapsedProjectKeys?: unknown;
                collapsedStatusGroupKeys?: unknown;
                collapsedWorkspaceKeys?: unknown;
                expandedParentTabKeys?: unknown;
              }
            | undefined,
          currentState,
        ),
    },
  ),
);
