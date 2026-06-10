import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SidebarOrderStoreState {
  projectOrder: string[];
  workspaceOrderByProject: Record<string, string[]>;
  getProjectOrder: () => string[];
  setProjectOrder: (keys: string[]) => void;
  getWorkspaceOrder: (projectKey: string) => string[];
  setWorkspaceOrder: (projectKey: string, keys: string[]) => void;
}

function normalizeKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(key);
  }

  return normalized;
}

function extractProjectKeyFromScope(scopeKey: string): string | null {
  const separatorIndex = scopeKey.indexOf("::");
  if (separatorIndex < 0) return null;
  return scopeKey.slice(separatorIndex + 2).trim();
}

export const useSidebarOrderStore = create<SidebarOrderStoreState>()(
  persist(
    (set, get) => ({
      projectOrder: [],
      workspaceOrderByProject: {},
      getProjectOrder: () => get().projectOrder,
      setProjectOrder: (keys) => {
        const normalized = normalizeKeys(keys);
        set({ projectOrder: normalized });
      },
      getWorkspaceOrder: (projectKey) => {
        const scope = projectKey.trim();
        if (!scope) return [];
        return get().workspaceOrderByProject[scope] ?? [];
      },
      setWorkspaceOrder: (projectKey, keys) => {
        const scope = projectKey.trim();
        if (!scope) return;
        const normalized = normalizeKeys(keys);
        set((state) => ({
          workspaceOrderByProject: {
            ...state.workspaceOrderByProject,
            [scope]: normalized,
          },
        }));
      },
    }),
    {
      name: "sidebar-project-workspace-order",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        projectOrder: state.projectOrder,
        workspaceOrderByProject: state.workspaceOrderByProject,
      }),
      migrate: (persistedState: unknown) => {
        const state = persistedState as
          | {
              projectOrderByServerId?: Record<string, string[]>;
              workspaceOrderByServerAndProject?: Record<string, string[]>;
            }
          | undefined;

        if (!state) return persistedState as SidebarOrderStoreState;

        const projectOrder: string[] = [];
        const seenProjects = new Set<string>();
        for (const keys of Object.values(state.projectOrderByServerId ?? {})) {
          for (const key of keys) {
            if (!seenProjects.has(key)) {
              seenProjects.add(key);
              projectOrder.push(key);
            }
          }
        }

        const workspaceOrderByProject: Record<string, string[]> = {};
        for (const [scopeKey, order] of Object.entries(
          state.workspaceOrderByServerAndProject ?? {},
        )) {
          const projectKey = extractProjectKeyFromScope(scopeKey);
          if (!projectKey) continue;
          const existing = workspaceOrderByProject[projectKey] ?? [];
          const merged = [...existing];
          const seen = new Set(merged);
          for (const key of order) {
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(key);
            }
          }
          workspaceOrderByProject[projectKey] = merged;
        }

        return { projectOrder, workspaceOrderByProject } as SidebarOrderStoreState;
      },
    },
  ),
);
