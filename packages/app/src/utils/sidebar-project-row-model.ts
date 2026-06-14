import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";

export interface SidebarProjectHostTarget {
  serverId: string;
  iconWorkingDir: string;
}

export type SidebarProjectTrailingAction =
  | { kind: "new_worktree"; target: SidebarProjectHostTarget }
  | { kind: "none" };

export interface SidebarProjectWorkspaceLinkRowModel {
  kind: "workspace_link";
  workspace: SidebarWorkspacePlacement;
  chevron: null;
  trailingAction: SidebarProjectTrailingAction;
}

export interface SidebarProjectSectionRowModel {
  kind: "project_section";
  chevron: "expand" | "collapse" | null;
  trailingAction: SidebarProjectTrailingAction;
}

export type SidebarProjectRowModel =
  | SidebarProjectWorkspaceLinkRowModel
  | SidebarProjectSectionRowModel;

export function isSidebarProjectFlattened(project: SidebarProjectEntry): boolean {
  return project.workspaces.length === 1 && project.projectKind !== "git";
}

function hostTarget(input: {
  serverId: string;
  iconWorkingDir: string;
}): SidebarProjectHostTarget | null {
  const iconWorkingDir = input.iconWorkingDir.trim();
  if (!input.serverId || !iconWorkingDir) {
    return null;
  }
  return { serverId: input.serverId, iconWorkingDir };
}

export function resolveSidebarProjectIconTarget(
  project: SidebarProjectEntry,
): SidebarProjectHostTarget | null {
  for (const host of project.hosts) {
    const target = hostTarget(host);
    if (target) {
      return target;
    }
  }
  return null;
}

function resolveNewWorktreeTarget(project: SidebarProjectEntry): SidebarProjectHostTarget | null {
  for (const host of project.hosts) {
    if (!host.canCreateWorktree) {
      continue;
    }
    const target = hostTarget(host);
    if (target) {
      return target;
    }
  }
  return null;
}

function projectTrailingAction(project: SidebarProjectEntry): SidebarProjectTrailingAction {
  const target = resolveNewWorktreeTarget(project);
  return target ? { kind: "new_worktree", target } : { kind: "none" };
}

export function buildSidebarProjectRowModel(input: {
  project: SidebarProjectEntry;
  collapsed: boolean;
}): SidebarProjectRowModel {
  const flattenedWorkspace = isSidebarProjectFlattened(input.project)
    ? (input.project.workspaces[0] ?? null)
    : null;

  if (flattenedWorkspace) {
    return {
      kind: "workspace_link",
      workspace: flattenedWorkspace,
      chevron: null,
      trailingAction: projectTrailingAction(input.project),
    };
  }

  const collapsible = input.project.projectKind === "git" || input.project.workspaces.length > 1;

  let chevron: "expand" | "collapse" | null;
  if (!collapsible) chevron = null;
  else if (input.collapsed) chevron = "expand";
  else chevron = "collapse";

  return {
    kind: "project_section",
    chevron,
    trailingAction: projectTrailingAction(input.project),
  };
}
