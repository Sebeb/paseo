import { useMemo } from "react";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useSessionStore } from "@/stores/session-store";
import {
  createSidebarWorkspaceEntry,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
} from "./use-sidebar-workspaces-list";

const EMPTY_WORKSPACES: SidebarWorkspaceEntry[] = [];

export function useStatusModeWorkspaceEntries(input: {
  serverIds: string[] | null;
  projects: SidebarProjectEntry[];
}): SidebarWorkspaceEntry[] {
  const sessions = useSessionStore((state) => state.sessions);
  const pendingCreateAttempts = useCreateFlowStore((state) => state.pendingByDraftId);

  return useMemo(() => {
    const serverIds = input.serverIds;
    if (!serverIds || serverIds.length === 0 || input.projects.length === 0) {
      return EMPTY_WORKSPACES;
    }

    const entries: SidebarWorkspaceEntry[] = [];
    for (const placedWorkspace of input.projects.flatMap((project) => project.workspaces)) {
      const session = sessions[placedWorkspace.serverId];
      const workspace = session?.workspaces.get(placedWorkspace.workspaceId);
      const agents = session?.agents;
      entries.push(
        workspace
          ? createSidebarWorkspaceEntry({
              serverId: placedWorkspace.serverId,
              workspace,
              pendingCreateAttempts,
              agents,
            })
          : placedWorkspace,
      );
    }
    return entries;
  }, [input.projects, input.serverIds, pendingCreateAttempts, sessions]);
}

export function useProjectNamesMap(serverIds: string[] | null): Map<string, string> {
  const sessions = useSessionStore((state) => state.sessions);

  return useMemo(() => {
    const map = new Map<string, string>();
    if (!serverIds || serverIds.length === 0) return map;
    for (const serverId of serverIds) {
      const workspaces = sessions[serverId]?.workspaces;
      if (!workspaces) continue;
      for (const workspace of workspaces.values()) {
        const key = workspace.project?.projectKey ?? workspace.projectId;
        if (!map.has(key)) {
          map.set(key, workspace.projectCustomName ?? workspace.projectDisplayName);
        }
      }
    }
    return map;
  }, [serverIds, sessions]);
}
