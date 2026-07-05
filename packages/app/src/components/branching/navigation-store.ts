import { create } from "zustand";

export interface BranchNavigationRequest {
  requestId: string;
  serverId: string;
  agentId: string;
  messageId: string | null;
  viewportY: number | null;
}

interface BranchNavigationState {
  pendingByKey: Record<string, BranchNavigationRequest>;
  setPending: (request: Omit<BranchNavigationRequest, "requestId">) => void;
  consumePending: (serverId: string, agentId: string, requestId: string) => void;
}

function key(serverId: string, agentId: string): string {
  return `${serverId}:${agentId}`;
}

export const useBranchNavigationStore = create<BranchNavigationState>((set) => ({
  pendingByKey: {},
  setPending: (request) =>
    set((state) => ({
      pendingByKey: {
        ...state.pendingByKey,
        [key(request.serverId, request.agentId)]: {
          ...request,
          requestId: `${Date.now()}:${Math.random().toString(36).slice(2)}`,
        },
      },
    })),
  consumePending: (serverId, agentId, requestId) =>
    set((state) => {
      const pendingKey = key(serverId, agentId);
      if (state.pendingByKey[pendingKey]?.requestId !== requestId) {
        return state;
      }
      const next = { ...state.pendingByKey };
      delete next[pendingKey];
      return { pendingByKey: next };
    }),
}));

export function branchNavigationKey(serverId: string, agentId: string): string {
  return key(serverId, agentId);
}
