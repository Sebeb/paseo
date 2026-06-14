import { useMemo } from "react";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useSessionStore } from "@/stores/session-store";
import {
  buildSidebarStatusWorkspacePlacements,
  type SidebarStatusWorkspacePlacement,
  type SidebarWorkspacePlacement,
} from "./use-sidebar-workspaces-list";

const EMPTY_WORKSPACES: SidebarStatusWorkspacePlacement[] = [];

export function useStatusModeWorkspacePlacements(input: {
  placements: SidebarWorkspacePlacement[];
}): SidebarStatusWorkspacePlacement[] {
  const sessions = useSessionStore((state) => state.sessions);
  const pendingCreateAttempts = useCreateFlowStore((state) => state.pendingByDraftId);

  return useMemo(() => {
    if (input.placements.length === 0) {
      return EMPTY_WORKSPACES;
    }

    const serverIds = new Set(input.placements.map((placement) => placement.serverId));
    const statusSessions = Array.from(serverIds).flatMap((serverId) => {
      const session = sessions[serverId];
      return session ? [{ serverId, workspaces: session.workspaces, agents: session.agents }] : [];
    });

    return buildSidebarStatusWorkspacePlacements({
      placements: input.placements,
      sessions: statusSessions,
      pendingCreateAttempts,
    });
  }, [input.placements, pendingCreateAttempts, sessions]);
}
