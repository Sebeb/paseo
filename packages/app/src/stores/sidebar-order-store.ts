import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SidebarOrderStoreState {
  projectOrderByServerId: Record<string, string[]>;
  workspaceOrderByServerAndProject: Record<string, string[]>;
  getProjectOrder: (serverId: string) => string[];
  setProjectOrder: (serverId: string, keys: string[]) => void;
  getWorkspaceOrder: (serverId: string, projectKey: string) => string[];
  setWorkspaceOrder: (serverId: string, projectKey: string, keys: string[]) => void;
}

interface SidebarOrderPersistedState {
  projectOrder?: string[];
  workspaceOrderByProject?: Record<string, string[]>;
  projectOrderByServerId?: Record<string, string[]>;
  workspaceOrderByServerAndProject?: Record<string, string[]>;
}

interface SidebarWorkspaceOrderScope {
  serverId: string;
  projectKey: string;
}

function normalizeScopePart(value: string): string {
  return value.trim();
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

function normalizeWorkspaceOrderByProject(
  workspaceOrderByProject: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [projectKey, order] of Object.entries(workspaceOrderByProject ?? {})) {
    const scope = projectKey.trim();
    if (!scope) continue;
    normalized[scope] = normalizeKeys(order);
  }
  return normalized;
}

function normalizeProjectOrderByServerId(
  projectOrderByServerId: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const normalized: Record<string, string[]> = {};
  for (const [serverId, order] of Object.entries(projectOrderByServerId ?? {})) {
    const scope = normalizeScopePart(serverId);
    if (!scope) continue;
    normalized[scope] = normalizeKeys(order);
  }
  return normalized;
}

function extractWorkspaceOrderScope(scopeKey: string): SidebarWorkspaceOrderScope | null {
  const separatorIndex = scopeKey.indexOf("::");
  if (separatorIndex < 0) return null;
  const serverId = scopeKey.slice(0, separatorIndex).trim();
  const projectKey = scopeKey.slice(separatorIndex + 2).trim();
  if (!serverId || !projectKey) return null;
  return { serverId, projectKey };
}

function workspaceOrderScopeKey(serverId: string, projectKey: string): string {
  return `${serverId}::${projectKey}`;
}

function normalizeLegacyWorkspaceKey(serverId: string, rawWorkspaceKey: string): string | null {
  const workspaceKey = rawWorkspaceKey.trim();
  if (!workspaceKey) return null;
  const serverPrefix = `${serverId}:`;
  return workspaceKey.startsWith(serverPrefix) ? workspaceKey : `${serverPrefix}${workspaceKey}`;
}

function appendWorkspaceOrder(
  target: Record<string, string[]>,
  scope: string,
  workspaceKey: string,
): void {
  const existing = target[scope] ?? [];
  if (existing.includes(workspaceKey)) return;
  target[scope] = [...existing, workspaceKey];
}

function appendLegacyProjectOrder(input: {
  projectOrderByServerId: Record<string, string[]>;
  workspaceOrderByServerAndProject: Record<string, string[]>;
  legacyProjectOrder: string[];
}): void {
  if (input.legacyProjectOrder.length === 0) {
    return;
  }

  const discoveredServerIds = new Set(Object.keys(input.projectOrderByServerId));
  for (const scopeKey of Object.keys(input.workspaceOrderByServerAndProject)) {
    const scope = extractWorkspaceOrderScope(scopeKey);
    if (scope) discoveredServerIds.add(scope.serverId);
  }
  for (const serverId of discoveredServerIds) {
    const existing = input.projectOrderByServerId[serverId] ?? [];
    const seen = new Set(existing);
    input.projectOrderByServerId[serverId] = [
      ...existing,
      ...input.legacyProjectOrder.filter((key) => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    ];
  }
}

export function migrateSidebarOrderState(persistedState: unknown): {
  projectOrderByServerId: Record<string, string[]>;
  workspaceOrderByServerAndProject: Record<string, string[]>;
} {
  const state = persistedState as SidebarOrderPersistedState | undefined;

  if (!state) {
    return { projectOrderByServerId: {}, workspaceOrderByServerAndProject: {} };
  }

  const projectOrderByServerId = normalizeProjectOrderByServerId(state.projectOrderByServerId);
  const workspaceOrderByServerAndProject: Record<string, string[]> = {};

  for (const [scopeKey, order] of Object.entries(state.workspaceOrderByServerAndProject ?? {})) {
    const scope = extractWorkspaceOrderScope(scopeKey);
    if (!scope) continue;
    const normalizedScope = workspaceOrderScopeKey(scope.serverId, scope.projectKey);
    for (const key of order) {
      const workspaceKey = normalizeLegacyWorkspaceKey(scope.serverId, key);
      if (!workspaceKey) continue;
      appendWorkspaceOrder(workspaceOrderByServerAndProject, normalizedScope, workspaceKey);
    }
  }

  for (const [projectKey, order] of Object.entries(
    normalizeWorkspaceOrderByProject(state.workspaceOrderByProject),
  )) {
    for (const workspaceKey of order) {
      const separatorIndex = workspaceKey.indexOf(":");
      if (separatorIndex <= 0) continue;
      const serverId = workspaceKey.slice(0, separatorIndex).trim();
      if (!serverId) continue;
      const scope = workspaceOrderScopeKey(serverId, projectKey);
      appendWorkspaceOrder(workspaceOrderByServerAndProject, scope, workspaceKey);
    }
  }

  appendLegacyProjectOrder({
    projectOrderByServerId,
    workspaceOrderByServerAndProject,
    legacyProjectOrder: normalizeKeys(state.projectOrder ?? []),
  });

  return { projectOrderByServerId, workspaceOrderByServerAndProject };
}

export const useSidebarOrderStore = create<SidebarOrderStoreState>()(
  persist(
    (set, get) => ({
      projectOrderByServerId: {},
      workspaceOrderByServerAndProject: {},
      getProjectOrder: (serverId) => {
        const scope = serverId.trim();
        if (!scope) return [];
        return get().projectOrderByServerId[scope] ?? [];
      },
      setProjectOrder: (serverId, keys) => {
        const scope = serverId.trim();
        if (!scope) return;
        const normalized = normalizeKeys(keys);
        set((state) => ({
          projectOrderByServerId: {
            ...state.projectOrderByServerId,
            [scope]: normalized,
          },
        }));
      },
      getWorkspaceOrder: (serverId, projectKey) => {
        const serverScope = serverId.trim();
        const projectScope = projectKey.trim();
        if (!serverScope || !projectScope) return [];
        return (
          get().workspaceOrderByServerAndProject[
            workspaceOrderScopeKey(serverScope, projectScope)
          ] ?? []
        );
      },
      setWorkspaceOrder: (serverId, projectKey, keys) => {
        const serverScope = serverId.trim();
        const projectScope = projectKey.trim();
        if (!serverScope || !projectScope) return;
        const normalized = normalizeKeys(keys);
        set((state) => ({
          workspaceOrderByServerAndProject: {
            ...state.workspaceOrderByServerAndProject,
            [workspaceOrderScopeKey(serverScope, projectScope)]: normalized,
          },
        }));
      },
    }),
    {
      name: "sidebar-project-workspace-order",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        projectOrderByServerId: state.projectOrderByServerId,
        workspaceOrderByServerAndProject: state.workspaceOrderByServerAndProject,
      }),
      version: 2,
      migrate: migrateSidebarOrderState,
    },
  ),
);
