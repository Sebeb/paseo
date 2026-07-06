import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";
import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";

export interface SidebarProjectStatusCounts {
  attention: number;
  needsInput: number;
  failed: number;
}

export function resolveProjectSelectorRowProject(input: {
  projects: readonly SidebarProjectEntry[];
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  storedProjectKey: string | null;
}): SidebarProjectEntry | null {
  const storedProject = input.storedProjectKey
    ? input.projects.find((project) => project.projectKey === input.storedProjectKey)
    : null;
  if (storedProject) return storedProject;

  const activeProject = input.activeWorkspaceSelection
    ? input.projects.find((project) =>
        project.workspaces.some(
          (workspace) =>
            workspace.serverId === input.activeWorkspaceSelection?.serverId &&
            workspace.workspaceId === input.activeWorkspaceSelection.workspaceId,
        ),
      )
    : null;
  if (activeProject) return activeProject;

  return input.projects[0] ?? null;
}

export function orderProjectSelectorRowProjects(input: {
  projects: readonly SidebarProjectEntry[];
  selectedProjectKey: string | null;
}): SidebarProjectEntry[] {
  if (!input.selectedProjectKey) return [...input.projects];
  const selected = input.projects.find(
    (project) => project.projectKey === input.selectedProjectKey,
  );
  if (!selected) return [...input.projects];
  return [
    selected,
    ...input.projects.filter((project) => project.projectKey !== input.selectedProjectKey),
  ];
}

export function getProjectStatusCountsFromStatuses(input: {
  workspaceKeys: readonly string[];
  statusByWorkspaceKey: ReadonlyMap<
    string,
    "needs_input" | "failed" | "running" | "attention" | "done"
  >;
}): SidebarProjectStatusCounts {
  const counts: SidebarProjectStatusCounts = {
    attention: 0,
    needsInput: 0,
    failed: 0,
  };
  for (const workspaceKey of input.workspaceKeys) {
    switch (input.statusByWorkspaceKey.get(workspaceKey)) {
      case "attention":
        counts.attention += 1;
        break;
      case "needs_input":
        counts.needsInput += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "running":
      case "done":
      case undefined:
        break;
    }
  }
  return counts;
}
