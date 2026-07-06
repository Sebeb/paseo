import type { PrHint } from "@/git/pr-hint";
import { selectPrHintFromStatus } from "@/git/pr-hint";
import { type HostProjectListItem } from "@/projects/host-project-model";
import type { PendingCreateAttempt } from "@/stores/create-flow-store";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { SidebarWorkspaceSortMode } from "@/stores/sidebar-view-store";
import type {
  WorkspaceStructureHostPlacement,
  WorkspaceStructureProject,
} from "@/projects/workspace-structure";
import { projectDisplayNameFromProjectId } from "@/utils/project-display-name";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";

const EMPTY_PROJECTS: SidebarProjectEntry[] = [];

function workspaceNameFromDirectory(directory: string): string {
  const trimmed = directory.trim().replace(/[\\/]+$/g, "");
  const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return separator >= 0 ? trimmed.slice(separator + 1) : trimmed;
}

export type SidebarStateBucket = WorkspaceDescriptor["status"];

export interface SidebarWorkspacePlacement {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  projectKey: string;
  projectName: string;
  projectRootPath?: string;
  workspaceDirectory?: string;
  projectKind: WorkspaceDescriptor["projectKind"];
  workspaceKind: WorkspaceDescriptor["workspaceKind"];
  name: string;
}

export interface SidebarStatusWorkspacePlacement extends SidebarWorkspacePlacement {
  statusBucket: SidebarStateBucket;
  statusEnteredAt: Date | null;
  // Raw user-set title (null when the name is derived from branch/directory).
  // Prefills the rename input and signals whether a reset is available.
  title: string | null;
  // Checkout branch (null when not a git checkout or detached HEAD).
  currentBranch: string | null;
  createdAt: Date | null;
  activityAt: Date | null;
  archivingAt: string | null;
  diffStat: { additions: number; deletions: number } | null;
  prHint: PrHint | null;
  archiveHasUncommittedChanges: boolean | null;
  archiveUnpushedCommitCount: number | null;
  scripts: WorkspaceDescriptor["scripts"];
  hasRunningScripts: boolean;
}

export interface SidebarWorkspaceEntry extends SidebarStatusWorkspacePlacement {}

export interface SidebarProjectEntry {
  serverId?: string;
  projectKey: string;
  projectName: string;
  projectKind: WorkspaceDescriptor["projectKind"];
  iconWorkingDir: string;
  canCreateWorktree: boolean;
  hosts: WorkspaceStructureHostPlacement[];
  workspaces: SidebarWorkspaceEntry[];
}

export interface SidebarWorkspacePlacementModel {
  workspaces: SidebarWorkspacePlacement[];
  projects: SidebarProjectEntry[];
  projectNamesByKey: Map<string, string>;
}

export function resolveProjectActivationWorkspace(input: {
  project: SidebarProjectEntry;
  lastSelectedWorkspaceIdByProjectKey: Record<string, string>;
}): SidebarWorkspaceEntry | null {
  const rememberedWorkspaceId =
    input.lastSelectedWorkspaceIdByProjectKey[input.project.projectKey]?.trim() ?? "";
  if (rememberedWorkspaceId) {
    const rememberedWorkspace = input.project.workspaces.find(
      (workspace) => workspace.workspaceId === rememberedWorkspaceId,
    );
    if (rememberedWorkspace) {
      return rememberedWorkspace;
    }
  }
  return input.project.workspaces[0] ?? null;
}

export interface SidebarStatusWorkspaceSession {
  serverId: string;
  workspaces: Map<string, WorkspaceDescriptor>;
  agents?: Map<string, Agent>;
}

interface EffectiveWorkspaceStatus {
  status: WorkspaceDescriptor["status"];
  enteredAt: Date | null;
}

interface WorkspaceAgentActivity extends EffectiveWorkspaceStatus {}

function projectNameForWorkspace(workspace: WorkspaceDescriptor, projectKey: string): string {
  return (
    workspace.projectCustomName ??
    workspace.projectDisplayName ??
    projectDisplayNameFromProjectId(projectKey)
  );
}

function normalizeCurrentBranch(currentBranch: string | null | undefined): string | null {
  if (!currentBranch) {
    return null;
  }
  const trimmed = currentBranch.trim();
  return trimmed.length === 0 || trimmed === "HEAD" ? null : trimmed;
}

export function createSidebarWorkspaceEntry(input: {
  serverId: string;
  workspace: WorkspaceDescriptor;
  pendingCreateAttempts?: Record<string, PendingCreateAttempt>;
  agents?: Map<string, Agent>;
}): SidebarWorkspaceEntry {
  const projectKey = input.workspace.project?.projectKey ?? input.workspace.projectId;
  const effectiveStatus = deriveEffectiveWorkspaceStatus(input);
  return {
    workspaceKey: `${input.serverId}:${input.workspace.id}`,
    serverId: input.serverId,
    workspaceId: input.workspace.id,
    projectKey,
    projectName: projectNameForWorkspace(input.workspace, projectKey),
    projectRootPath: input.workspace.projectRootPath,
    workspaceDirectory: input.workspace.workspaceDirectory,
    projectKind: input.workspace.projectKind,
    workspaceKind: input.workspace.workspaceKind,
    name: input.workspace.name,
    title: input.workspace.title ?? null,
    currentBranch: normalizeCurrentBranch(input.workspace.gitRuntime?.currentBranch),
    createdAt: input.workspace.createdAt,
    activityAt: input.workspace.activityAt,
    statusBucket: effectiveStatus.status,
    statusEnteredAt: effectiveStatus.enteredAt,
    archivingAt: input.workspace.archivingAt,
    diffStat: input.workspace.diffStat,
    prHint: selectPrHintFromStatus(input.workspace.githubRuntime?.pullRequest),
    archiveHasUncommittedChanges: input.workspace.gitRuntime?.isDirty ?? null,
    archiveUnpushedCommitCount: input.workspace.gitRuntime?.aheadOfOrigin ?? null,
    scripts: input.workspace.scripts,
    hasRunningScripts: input.workspace.scripts.some((script) => script.lifecycle === "running"),
  };
}

function deriveEffectiveWorkspaceStatus(input: {
  serverId: string;
  workspace: WorkspaceDescriptor;
  pendingCreateAttempts?: Record<string, PendingCreateAttempt>;
  agents?: Map<string, Agent>;
}): EffectiveWorkspaceStatus {
  if (input.workspace.status !== "done") {
    return { status: input.workspace.status, enteredAt: input.workspace.statusEnteredAt };
  }

  const pendingStartedAt = getPendingInitialAgentCreateStartedAt({
    serverId: input.serverId,
    workspaceId: input.workspace.id,
    pendingCreateAttempts: input.pendingCreateAttempts,
  });
  if (pendingStartedAt) {
    return { status: "running", enteredAt: pendingStartedAt };
  }

  const rootAgentActivity = getRootAgentWorkspaceActivity({
    workspace: input.workspace,
    agents: input.agents,
  });
  if (rootAgentActivity && rootAgentActivity.status !== "done") {
    return rootAgentActivity;
  }

  return { status: input.workspace.status, enteredAt: input.workspace.statusEnteredAt };
}

function getPendingInitialAgentCreateStartedAt(input: {
  serverId: string;
  workspaceId: string;
  pendingCreateAttempts: Record<string, PendingCreateAttempt> | undefined;
}): Date | null {
  let latestStartedAt: Date | null = null;
  for (const pending of Object.values(input.pendingCreateAttempts ?? {})) {
    if (pending.serverId !== input.serverId) continue;
    if (pending.workspaceId !== input.workspaceId) continue;
    if (pending.lifecycle === "abandoned") continue;
    const startedAt = new Date(pending.timestamp);
    if (!latestStartedAt || startedAt > latestStartedAt) {
      latestStartedAt = startedAt;
    }
  }
  return latestStartedAt;
}

function getRootAgentWorkspaceActivity(input: {
  workspace: WorkspaceDescriptor;
  agents?: Map<string, Agent>;
}): WorkspaceAgentActivity | null {
  let latest: WorkspaceAgentActivity | null = null;
  for (const agent of input.agents?.values() ?? []) {
    if (agent.archivedAt || agent.parentAgentId) continue;
    if (agent.workspaceId !== input.workspace.id) continue;
    const status = deriveSidebarStateBucket({
      status: agent.status,
      pendingPermissionCount: agent.pendingPermissions.length,
      requiresAttention: agent.requiresAttention,
      attentionReason: agent.attentionReason,
    });
    const enteredAt = agent.attentionTimestamp ?? agent.updatedAt;
    if (!latest || enteredAt > (latest.enteredAt ?? new Date(0))) {
      latest = { status, enteredAt };
    }
  }
  return latest;
}

export function buildSidebarWorkspacePlacementModel(input: {
  projects: readonly HostProjectListItem[];
}): SidebarWorkspacePlacementModel {
  const projects = buildSidebarProjectsFromHostProjects({ projects: input.projects });
  return {
    projects,
    workspaces: projects.flatMap((project) => project.workspaces),
    projectNamesByKey: new Map(
      projects.map((project) => [project.projectKey, project.projectName]),
    ),
  };
}

function createStructuralWorkspaceEntry(input: {
  project: HostProjectListItem;
  workspaceKey: string;
}): SidebarWorkspaceEntry {
  const identity = resolveStructuralWorkspaceIdentity({
    project: input.project,
    workspaceKey: input.workspaceKey,
  });

  return {
    workspaceKey: identity.workspaceKey,
    serverId: identity.serverId,
    workspaceId: identity.workspaceId,
    projectKey: input.project.projectKey,
    projectName: input.project.projectName,
    projectRootPath: input.project.iconWorkingDir,
    workspaceDirectory: undefined,
    projectKind: input.project.projectKind,
    workspaceKind: "checkout",
    name: workspaceNameFromDirectory(input.project.iconWorkingDir) || identity.workspaceId,
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

function resolveStructuralWorkspaceIdentity(input: {
  project: HostProjectListItem;
  workspaceKey: string;
}): {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
} {
  const hostsByLongestPrefix = [...input.project.hosts].sort(
    (left, right) => right.serverId.length - left.serverId.length,
  );

  for (const host of hostsByLongestPrefix) {
    const prefix = `${host.serverId}:`;
    if (!input.workspaceKey.startsWith(prefix)) continue;
    const workspaceId = input.workspaceKey.slice(prefix.length);
    if (!workspaceId) continue;
    return {
      workspaceKey: input.workspaceKey,
      serverId: host.serverId,
      workspaceId,
    };
  }

  const separatorIndex = input.workspaceKey.indexOf(":");
  if (separatorIndex > 0) {
    return {
      workspaceKey: input.workspaceKey,
      serverId: input.workspaceKey.slice(0, separatorIndex),
      workspaceId: input.workspaceKey.slice(separatorIndex + 1),
    };
  }

  const serverId = input.project.hosts[0]?.serverId ?? input.workspaceKey;
  return {
    workspaceKey: `${serverId}:${input.workspaceKey}`,
    serverId,
    workspaceId: input.workspaceKey,
  };
}

export function buildSidebarStatusWorkspacePlacements(input: {
  placements: readonly SidebarWorkspacePlacement[];
  sessions: SidebarStatusWorkspaceSession[];
  pendingCreateAttempts?: Record<string, PendingCreateAttempt>;
}): SidebarStatusWorkspacePlacement[] {
  if (input.placements.length === 0 || input.sessions.length === 0) {
    return [];
  }

  const sessionByServerId = new Map(input.sessions.map((session) => [session.serverId, session]));
  const rows: SidebarStatusWorkspacePlacement[] = [];

  for (const placement of input.placements) {
    const session = sessionByServerId.get(placement.serverId);
    if (!session) continue;
    const workspaceKey = resolveWorkspaceMapKeyByIdentity({
      workspaces: session.workspaces,
      workspaceId: placement.workspaceId,
    });
    const workspace = workspaceKey ? session.workspaces.get(workspaceKey) : null;
    if (!workspace) continue;

    rows.push(
      createSidebarWorkspaceEntry({
        serverId: placement.serverId,
        workspace,
        pendingCreateAttempts: input.pendingCreateAttempts,
        agents: session.agents,
      }),
    );
  }

  return rows;
}

export function buildSidebarProjectsFromStructure(input: {
  projects: WorkspaceStructureProject[];
}): SidebarProjectEntry[] {
  return buildSidebarProjectsFromHostProjects({
    projects: input.projects.map((project) => ({
      projectKey: project.projectKey,
      projectName: project.projectName,
      projectKind: project.projectKind,
      iconWorkingDir: project.iconWorkingDir,
      hosts: project.hosts,
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
    serverId: project.hosts[0]?.serverId ?? "",
    projectKey: project.projectKey,
    projectName: project.projectName,
    projectKind: project.projectKind,
    iconWorkingDir: project.iconWorkingDir,
    canCreateWorktree: project.hosts.some((host) => host.canCreateWorktree),
    hosts: project.hosts,
    workspaces: project.workspaceKeys.map((workspaceKey) =>
      createStructuralWorkspaceEntry({
        project,
        workspaceKey,
      }),
    ),
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
      workspaces: project.workspaces
        .slice()
        .sort((left, right) => compareSidebarWorkspaces({ left, right, sortMode })),
    };
  });
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
  serverIds: string[];
  hydratedServerIds: string[];
  hasProjects: boolean;
}): SidebarLoadingState {
  const hasRegisteredHosts = input.serverIds.length > 0;
  const allHydrated =
    input.serverIds.length > 0 && input.serverIds.length === input.hydratedServerIds.length;
  const isLoading = input.isActive && hasRegisteredHosts && !allHydrated;
  const isInitialLoad = isLoading && !input.hasProjects;
  return { isLoading, isInitialLoad, isRevalidating: false };
}
