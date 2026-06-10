import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SidebarGroupMode = "project" | "status";

interface SidebarViewStoreState {
  groupMode: SidebarGroupMode;
  hostFilter: string | null;
  setGroupMode: (mode: SidebarGroupMode) => void;
  setHostFilter: (serverId: string | null) => void;
}

export const useSidebarViewStore = create<SidebarViewStoreState>()(
  persist(
    (set) => ({
      groupMode: "project",
      hostFilter: null,
      setGroupMode: (mode) => set({ groupMode: mode }),
      setHostFilter: (serverId) => set({ hostFilter: serverId }),
    }),
    {
      name: "sidebar-view",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        groupMode: state.groupMode,
        hostFilter: state.hostFilter,
      }),
      migrate: (persistedState: unknown) => {
        const state = persistedState as
          | { groupModeByServerId?: Record<string, SidebarGroupMode> }
          | undefined;
        if (state?.groupModeByServerId) {
          const values = Object.values(state.groupModeByServerId);
          const mode = values.length > 0 ? values[0] : "project";
          return { groupMode: mode, hostFilter: null };
        }
        return persistedState as SidebarViewStoreState;
      },
    },
  ),
);
