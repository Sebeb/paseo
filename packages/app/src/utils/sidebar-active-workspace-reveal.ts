import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";

export interface SidebarActiveWorkspaceRevealTarget {
  projectKey: string;
  workspaceKey: string;
}

export function findActiveSidebarWorkspaceRevealTarget(input: {
  projects: readonly SidebarProjectEntry[];
  selection: ActiveWorkspaceSelection | null;
  serverId: string | null;
  selectionEnabled: boolean;
}): SidebarActiveWorkspaceRevealTarget | null {
  if (
    !input.selectionEnabled ||
    !input.selection ||
    !input.serverId ||
    input.selection.serverId !== input.serverId
  ) {
    return null;
  }

  for (const project of input.projects) {
    const workspace = project.workspaces.find(
      (entry) => entry.workspaceId === input.selection?.workspaceId,
    );
    if (workspace) {
      return {
        projectKey: project.projectKey,
        workspaceKey: workspace.workspaceKey,
      };
    }
  }

  return null;
}
