import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  appendWorkspaceNavigationHistoryEntry,
  getWorkspaceNavigationHistoryItems,
  initialWorkspaceNavigationHistoryCoreState,
  normalizeWorkspaceNavigationHistoryState,
  pruneInvalidWorkspaceNavigationHistoryEntries,
  setWorkspaceNavigationHistoryIndex,
  type WorkspaceNavigationHistoryCoreState,
  type WorkspaceNavigationHistoryEntry,
  type WorkspaceNavigationHistoryScope,
} from "./state";

export type {
  WorkspaceNavigationHistoryCoreState,
  WorkspaceNavigationHistoryEntry,
  WorkspaceNavigationHistoryGroupMode,
  WorkspaceNavigationHistoryScope,
} from "./state";
export {
  appendWorkspaceNavigationHistoryEntry,
  entryMatchesWorkspaceNavigationScope,
  findWorkspaceNavigationHistoryIndex,
  getWorkspaceNavigationHistoryItems,
  normalizeWorkspaceNavigationHistoryEntry,
  normalizeWorkspaceNavigationHistoryState,
  pruneInvalidWorkspaceNavigationHistoryEntries,
  setWorkspaceNavigationHistoryIndex,
  workspaceNavigationEntriesEqual,
} from "./state";

interface WorkspaceNavigationHistoryState extends WorkspaceNavigationHistoryCoreState {
  recordEntry: (entry: WorkspaceNavigationHistoryEntry) => void;
  setCurrentIndex: (index: number) => void;
  pruneInvalidEntries: (isValidEntry: (entry: WorkspaceNavigationHistoryEntry) => boolean) => void;
  getHistoryItems: (input: {
    direction: "back" | "forward";
    scope: WorkspaceNavigationHistoryScope;
    isValidEntry: (entry: WorkspaceNavigationHistoryEntry) => boolean;
  }) => Array<{ entry: WorkspaceNavigationHistoryEntry; index: number }>;
}

export const useWorkspaceNavigationHistoryStore = create<WorkspaceNavigationHistoryState>()(
  persist(
    (set, get) => ({
      ...initialWorkspaceNavigationHistoryCoreState,
      recordEntry: (entry) => {
        set((state) => appendWorkspaceNavigationHistoryEntry(state, entry));
      },
      setCurrentIndex: (index) => {
        set((state) => setWorkspaceNavigationHistoryIndex(state, index));
      },
      pruneInvalidEntries: (isValidEntry) => {
        set((state) => pruneInvalidWorkspaceNavigationHistoryEntries(state, { isValidEntry }));
      },
      getHistoryItems: (input) => {
        const state = get();
        return getWorkspaceNavigationHistoryItems({
          entries: state.entries,
          currentIndex: state.currentIndex,
          direction: input.direction,
          scope: input.scope,
          isValidEntry: input.isValidEntry,
        });
      },
    }),
    {
      name: "workspace-navigation-history-state",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        entries: state.entries,
        currentIndex: state.currentIndex,
      }),
      migrate: (persistedState) =>
        normalizeWorkspaceNavigationHistoryState(persistedState) as WorkspaceNavigationHistoryState,
    },
  ),
);
