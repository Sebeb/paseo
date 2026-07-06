import type { PrHint } from "@/git/use-pr-status-query";
import {
  canCreateWorktreeForProjectKind,
  type HostProjectListItem,
} from "@/projects/host-project-model";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { SidebarWorkspaceSortMode } from "@/stores/sidebar-view-store";
import type { WorkspaceStructureProject } from "@/projects/workspace-structure";

const EMPTY_PROJECTS: SidebarProjectEntry[] = [];

function workspaceNameFromDirectory(directory: string): string {
  const trimmed = directory.trim().replace(/[\\/]+$/g, "");
  const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return separator >= 0 ? trimmed.slice(separator + 1) : trimmed;
}

export type SidebarStateBucket = WorkspaceDescriptor["status"];

export interface SidebarWorkspaceEntry {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  projectKey: string;
  projectName?: string;
  projectRootPath?: string;
  workspaceDirectory?: string;
  projectKind: WorkspaceDescriptor["projectKind"];
  workspaceKind: WorkspaceDescriptor["workspaceKind"];
  name: string;
  // Raw user-set title (null when the name is derived from branch/directory).
  // Prefills the rename input and signals whether a reset is available.
  title: string | null;
  // Checkout branch (null when not a git checkout or detached HEAD).
  currentBranch: string | null;
  createdAt: Date | null;
  activityAt: Date | null;
  statusBucket: SidebarStateBucket;
  statusEnteredAt: Date | null;
  archivingAt: string | null;
  diffStat: { additions: number; deletions: number } | null;
  prHint: PrHint | null;
  archiveHasUncommittedChanges: boolean | null;
  archiveUnpushedCommitCount: number | null;
  scripts: WorkspaceDescriptor["scripts"];
  hasRunningScripts: boolean;
}

export interface SidebarProjectEntry {
  projectKey: string;
  projectName: string;
  projectKind: WorkspaceDescriptor["projectKind"];
  iconWorkingDir: string;
  hosts?: HostProjectListItem["hosts"];
  canCreateWorktree?: boolean;
  workspaces: SidebarWorkspaceEntry[];
}

function createStructuralWorkspaceEntry(input: {
  project: HostProjectListItem;
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
}): SidebarWorkspaceEntry {
  const host =
    input.project.hosts.find((candidate) => candidate.serverId === input.serverId) ??
    input.project.hosts[0];
  return {
    workspaceKey: input.workspaceKey,
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    projectKey: input.project.projectKey,
    projectName: input.project.projectName,
    projectRootPath: host?.iconWorkingDir ?? input.project.iconWorkingDir,
    workspaceDirectory: undefined,
    projectKind: input.project.projectKind,
    workspaceKind: "checkout",
    name: workspaceNameFromDirectory(input.project.iconWorkingDir) || input.workspaceId,
    title: null,
    currentBranch: null,
    createdAt: null,
    activityAt: null,
    statusBucket: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
  };
}

function resolveProjectWorkspacePlacement(
  project: HostProjectListItem,
  workspaceKey: string,
): {
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
} {
  const trimmed = workspaceKey.trim();
  for (const host of project.hosts) {
    const prefix = `${host.serverId}:`;
    if (trimmed.startsWith(prefix)) {
      const workspaceId = trimmed.slice(prefix.length);
      return {
        serverId: host.serverId,
        workspaceId,
        workspaceKey: trimmed,
      };
    }
  }

  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex > 0) {
    return {
      serverId: trimmed.slice(0, separatorIndex),
      workspaceId: trimmed.slice(separatorIndex + 1),
      workspaceKey: trimmed,
    };
  }

  const serverId = project.hosts[0]?.serverId ?? "";
  return {
    serverId,
    workspaceId: trimmed,
    workspaceKey: serverId ? `${serverId}:${trimmed}` : trimmed,
  };
}

export function buildSidebarProjectsFromStructure(input: {
  serverId: string;
  projects: WorkspaceStructureProject[];
}): SidebarProjectEntry[] {
  return buildSidebarProjectsFromHostProjects({
    projects: input.projects.map((project) => ({
      projectKey: project.projectKey,
      projectName: project.projectName,
      projectKind: project.projectKind,
      iconWorkingDir: project.iconWorkingDir,
      hosts:
        project.hosts.length > 0
          ? project.hosts
          : [
              {
                serverId: input.serverId,
                iconWorkingDir: project.iconWorkingDir,
                canCreateWorktree: canCreateWorktreeForProjectKind(project.projectKind),
              },
            ],
      workspaceKeys: project.workspaceKeys,
    })),
  });
}

export function buildSidebarProjectsFromHostProjects(input: {
  projects: readonly HostProjectListItem[];
}): SidebarProjectEntry[] {
  if (input.projects.length === 0) {
    return EMPTY_PROJECTS;
  }

  return input.projects.map((project) => ({
    projectKey: project.projectKey,
    projectName: project.projectName,
    projectKind: project.projectKind,
    iconWorkingDir: project.iconWorkingDir,
    hosts: project.hosts,
    canCreateWorktree: project.hosts.some((host) => host.canCreateWorktree),
    workspaces: project.workspaceKeys.map((workspaceKey) => {
      const placement = resolveProjectWorkspacePlacement(project, workspaceKey);
      return createStructuralWorkspaceEntry({
        project,
        serverId: placement.serverId,
        workspaceId: placement.workspaceId,
        workspaceKey: placement.workspaceKey,
      });
    }),
  }));
}

const WORKSPACE_STATUS_SORT_RANK: Record<SidebarStateBucket, number> = {
  needs_input: 0,
  failed: 1,
  attention: 2,
  running: 3,
  done: 4,
};

function getWorkspaceLastUpdatedAt(workspace: SidebarWorkspaceEntry): number {
  return (workspace.activityAt ?? workspace.createdAt ?? workspace.statusEnteredAt)?.getTime() ?? 0;
}

function compareWorkspaceName(left: SidebarWorkspaceEntry, right: SidebarWorkspaceEntry): number {
  const nameDelta = left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (nameDelta !== 0) {
    return nameDelta;
  }
  return left.workspaceKey.localeCompare(right.workspaceKey, undefined, {
    sensitivity: "base",
  });
}

function compareSidebarWorkspaces(input: {
  left: SidebarWorkspaceEntry;
  right: SidebarWorkspaceEntry;
  sortMode: Exclude<SidebarWorkspaceSortMode, "manual">;
}): number {
  if (input.sortMode === "status") {
    const leftRank = WORKSPACE_STATUS_SORT_RANK[input.left.statusBucket];
    const rightRank = WORKSPACE_STATUS_SORT_RANK[input.right.statusBucket];
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    const updatedDelta =
      getWorkspaceLastUpdatedAt(input.right) - getWorkspaceLastUpdatedAt(input.left);
    if (updatedDelta !== 0) {
      return updatedDelta;
    }
    return compareWorkspaceName(input.left, input.right);
  }

  const leftValue =
    input.sortMode === "created"
      ? (input.left.createdAt?.getTime() ?? 0)
      : getWorkspaceLastUpdatedAt(input.left);
  const rightValue =
    input.sortMode === "created"
      ? (input.right.createdAt?.getTime() ?? 0)
      : getWorkspaceLastUpdatedAt(input.right);
  const timeDelta = rightValue - leftValue;
  if (timeDelta !== 0) {
    return timeDelta;
  }
  return compareWorkspaceName(input.left, input.right);
}

export function sortSidebarWorkspaceProjects(input: {
  projects: SidebarProjectEntry[];
  sortMode: SidebarWorkspaceSortMode;
}): SidebarProjectEntry[] {
  if (input.sortMode === "manual") {
    return input.projects;
  }
  const sortMode = input.sortMode;

  return input.projects.map((project) => {
    if (project.workspaces.length <= 1) {
      return project;
    }

    return {
      ...project,
      workspaces: sortSidebarWorkspaces({
        workspaces: project.workspaces,
        sortMode,
      }),
    };
  });
}

export function sortSidebarWorkspaces(input: {
  workspaces: readonly SidebarWorkspaceEntry[];
  sortMode: SidebarWorkspaceSortMode;
}): SidebarWorkspaceEntry[] {
  if (input.sortMode === "manual") {
    return input.workspaces.slice();
  }
  const sortMode = input.sortMode;
  return input.workspaces
    .slice()
    .sort((left, right) => compareSidebarWorkspaces({ left, right, sortMode }));
}

export function applyStoredOrdering<T>(input: {
  items: T[];
  storedOrder: string[];
  getKey: (item: T) => string;
}): T[] {
  if (input.items.length <= 1 || input.storedOrder.length === 0) {
    return input.items;
  }

  const itemByKey = new Map<string, T>();
  for (const item of input.items) {
    itemByKey.set(input.getKey(item), item);
  }

  const prunedOrder: string[] = [];
  const seen = new Set<string>();
  for (const key of input.storedOrder) {
    if (!itemByKey.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    prunedOrder.push(key);
  }

  if (prunedOrder.length === 0) {
    return input.items;
  }

  const orderedSet = new Set(prunedOrder);
  const ordered: T[] = [];
  let orderedIndex = 0;

  for (const item of input.items) {
    const key = input.getKey(item);
    if (!orderedSet.has(key)) {
      ordered.push(item);
      continue;
    }

    const targetKey = prunedOrder[orderedIndex] ?? key;
    orderedIndex += 1;
    ordered.push(itemByKey.get(targetKey) ?? item);
  }

  return ordered;
}

export function appendMissingOrderKeys(input: {
  currentOrder: string[];
  visibleKeys: string[];
}): string[] {
  if (input.visibleKeys.length === 0) {
    return input.currentOrder;
  }

  const existingKeys = new Set(input.currentOrder);
  const missingKeys = input.visibleKeys.filter((key) => !existingKeys.has(key));
  if (missingKeys.length === 0) {
    return input.currentOrder;
  }

  return [...input.currentOrder, ...missingKeys];
}

export interface SidebarOrderUpdates {
  projectOrder: string[] | null;
  workspaceOrders: Array<{ projectKey: string; order: string[] }>;
}

export function computeSidebarOrderUpdates(input: {
  projects: SidebarProjectEntry[];
  persistedProjectOrder: string[];
  getWorkspaceOrder: (projectKey: string) => string[];
}): SidebarOrderUpdates {
  if (input.projects.length === 0) {
    return { projectOrder: null, workspaceOrders: [] };
  }

  const nextProjectOrder = appendMissingOrderKeys({
    currentOrder: input.persistedProjectOrder,
    visibleKeys: input.projects.map((project) => project.projectKey),
  });
  const projectOrder = nextProjectOrder === input.persistedProjectOrder ? null : nextProjectOrder;

  const workspaceOrders: Array<{ projectKey: string; order: string[] }> = [];
  for (const project of input.projects) {
    const persistedWorkspaceOrder = input.getWorkspaceOrder(project.projectKey);
    const nextWorkspaceOrder = appendMissingOrderKeys({
      currentOrder: persistedWorkspaceOrder,
      visibleKeys: project.workspaces.map((workspace) => workspace.workspaceKey),
    });
    if (nextWorkspaceOrder !== persistedWorkspaceOrder) {
      workspaceOrders.push({ projectKey: project.projectKey, order: nextWorkspaceOrder });
    }
  }

  return { projectOrder, workspaceOrders };
}

export interface SidebarLoadingState {
  isLoading: boolean;
  isInitialLoad: boolean;
  isRevalidating: boolean;
}

export function deriveSidebarLoadingState(input: {
  isActive: boolean;
  serverId: string | null;
  hasHydratedWorkspaces: boolean;
  hasProjects: boolean;
}): SidebarLoadingState {
  const isLoading = input.isActive && Boolean(input.serverId) && !input.hasHydratedWorkspaces;
  const isInitialLoad = isLoading && !input.hasProjects;
  return { isLoading, isInitialLoad, isRevalidating: false };
}
