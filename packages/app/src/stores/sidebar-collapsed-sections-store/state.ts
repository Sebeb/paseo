export interface CollapsedProjectsState {
  collapsedProjectKeys: Set<string>;
  collapsedStatusGroupKeys: Set<string>;
  collapsedWorkspaceKeys: Set<string>;
  expandedParentTabKeys: Set<string>;
  lastSelectedWorkspaceIdByProjectKey: Record<string, string>;
}

export interface PersistedCollapsedProjects {
  collapsedProjectKeys?: unknown;
  collapsedStatusGroupKeys?: unknown;
  collapsedWorkspaceKeys?: unknown;
  expandedParentTabKeys?: unknown;
  lastSelectedWorkspaceIdByProjectKey?: unknown;
}

export function toggleProjectCollapsed(
  state: CollapsedProjectsState,
  projectKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedProjectKeys);
  if (next.has(projectKey)) {
    next.delete(projectKey);
  } else {
    next.add(projectKey);
  }
  return { ...state, collapsedProjectKeys: next };
}

export function toggleStatusGroupCollapsed(
  state: CollapsedProjectsState,
  statusGroupKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedStatusGroupKeys);
  if (next.has(statusGroupKey)) {
    next.delete(statusGroupKey);
  } else {
    next.add(statusGroupKey);
  }
  return { ...state, collapsedStatusGroupKeys: next };
}

export function toggleWorkspaceCollapsed(
  state: CollapsedProjectsState,
  workspaceKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedWorkspaceKeys);
  if (next.has(workspaceKey)) {
    next.delete(workspaceKey);
  } else {
    next.add(workspaceKey);
  }
  return { ...state, collapsedWorkspaceKeys: next };
}

export function setWorkspaceCollapsed(
  state: CollapsedProjectsState,
  workspaceKey: string,
  collapsed: boolean,
): CollapsedProjectsState {
  return setWorkspacesCollapsed(state, [workspaceKey], collapsed);
}

export function setOnlyWorkspaceExpanded(
  state: CollapsedProjectsState,
  workspaceKey: string,
  workspaceKeys: readonly string[],
): CollapsedProjectsState {
  const next = new Set(state.collapsedWorkspaceKeys);
  const scopedWorkspaceKeys = new Set(workspaceKeys);
  scopedWorkspaceKeys.add(workspaceKey);
  for (const scopedWorkspaceKey of scopedWorkspaceKeys) {
    if (scopedWorkspaceKey === workspaceKey) {
      next.delete(scopedWorkspaceKey);
    } else {
      next.add(scopedWorkspaceKey);
    }
  }
  return { ...state, collapsedWorkspaceKeys: next };
}

export function setOnlyProjectExpanded(
  state: CollapsedProjectsState,
  projectKey: string,
  projectKeys: readonly string[],
): CollapsedProjectsState {
  const next = new Set(state.collapsedProjectKeys);
  const scopedProjectKeys = new Set(projectKeys);
  scopedProjectKeys.add(projectKey);
  for (const scopedProjectKey of scopedProjectKeys) {
    if (scopedProjectKey === projectKey) {
      next.delete(scopedProjectKey);
    } else {
      next.add(scopedProjectKey);
    }
  }
  return { ...state, collapsedProjectKeys: next };
}

export function setWorkspacesCollapsed(
  state: CollapsedProjectsState,
  workspaceKeys: readonly string[],
  collapsed: boolean,
): CollapsedProjectsState {
  const next = new Set(state.collapsedWorkspaceKeys);
  for (const workspaceKey of workspaceKeys) {
    if (collapsed) {
      next.add(workspaceKey);
    } else {
      next.delete(workspaceKey);
    }
  }
  return { ...state, collapsedWorkspaceKeys: next };
}

export function setProjectCollapsed(
  state: CollapsedProjectsState,
  projectKey: string,
  collapsed: boolean,
): CollapsedProjectsState {
  const next = new Set(state.collapsedProjectKeys);
  if (collapsed) {
    next.add(projectKey);
  } else {
    next.delete(projectKey);
  }
  return { ...state, collapsedProjectKeys: next };
}

export function rememberProjectWorkspaceSelection(
  state: CollapsedProjectsState,
  projectKey: string,
  workspaceId: string,
): CollapsedProjectsState {
  const trimmedProjectKey = projectKey.trim();
  const trimmedWorkspaceId = workspaceId.trim();
  if (!trimmedProjectKey || !trimmedWorkspaceId) {
    return state;
  }
  if (state.lastSelectedWorkspaceIdByProjectKey[trimmedProjectKey] === trimmedWorkspaceId) {
    return state;
  }
  return {
    ...state,
    lastSelectedWorkspaceIdByProjectKey: {
      ...state.lastSelectedWorkspaceIdByProjectKey,
      [trimmedProjectKey]: trimmedWorkspaceId,
    },
  };
}

export function toggleParentTabExpanded(
  state: CollapsedProjectsState,
  parentTabKey: string,
): CollapsedProjectsState {
  const next = new Set(state.expandedParentTabKeys);
  if (next.has(parentTabKey)) {
    next.delete(parentTabKey);
  } else {
    next.add(parentTabKey);
  }
  return { ...state, expandedParentTabKeys: next };
}

export function serializeCollapsedProjects(state: CollapsedProjectsState): {
  collapsedProjectKeys: string[];
  collapsedStatusGroupKeys: string[];
  collapsedWorkspaceKeys: string[];
  expandedParentTabKeys: string[];
  lastSelectedWorkspaceIdByProjectKey: Record<string, string>;
} {
  return {
    collapsedProjectKeys: Array.from(state.collapsedProjectKeys),
    collapsedStatusGroupKeys: Array.from(state.collapsedStatusGroupKeys),
    collapsedWorkspaceKeys: Array.from(state.collapsedWorkspaceKeys),
    expandedParentTabKeys: Array.from(state.expandedParentTabKeys),
    lastSelectedWorkspaceIdByProjectKey: state.lastSelectedWorkspaceIdByProjectKey,
  };
}

export function mergePersistedCollapsedProjects<S extends CollapsedProjectsState>(
  persisted: PersistedCollapsedProjects | undefined,
  current: S,
): S {
  if (
    !persisted?.collapsedProjectKeys &&
    !persisted?.collapsedStatusGroupKeys &&
    !persisted?.collapsedWorkspaceKeys &&
    !persisted?.expandedParentTabKeys &&
    !persisted?.lastSelectedWorkspaceIdByProjectKey
  ) {
    return current;
  }
  const restoredProjects = deserializeCollapsedKeys(persisted.collapsedProjectKeys);
  const restoredStatusGroups = deserializeCollapsedKeys(persisted.collapsedStatusGroupKeys);
  const restoredWorkspaces = deserializeCollapsedKeys(persisted.collapsedWorkspaceKeys);
  const restoredExpandedParentTabs = deserializeCollapsedKeys(persisted.expandedParentTabKeys);
  const restoredLastSelectedWorkspaces = deserializeWorkspaceSelections(
    persisted.lastSelectedWorkspaceIdByProjectKey,
  );
  if (
    areSetsEqual(current.collapsedProjectKeys, restoredProjects) &&
    areSetsEqual(current.collapsedStatusGroupKeys, restoredStatusGroups) &&
    areSetsEqual(current.collapsedWorkspaceKeys, restoredWorkspaces) &&
    areSetsEqual(current.expandedParentTabKeys, restoredExpandedParentTabs) &&
    areRecordsEqual(current.lastSelectedWorkspaceIdByProjectKey, restoredLastSelectedWorkspaces)
  ) {
    return current;
  }
  return {
    ...current,
    collapsedProjectKeys: restoredProjects,
    collapsedStatusGroupKeys: restoredStatusGroups,
    collapsedWorkspaceKeys: restoredWorkspaces,
    expandedParentTabKeys: restoredExpandedParentTabs,
    lastSelectedWorkspaceIdByProjectKey: restoredLastSelectedWorkspaces,
  };
}

function deserializeCollapsedKeys(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.filter((key): key is string => typeof key === "string"));
}

function deserializeWorkspaceSelections(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const selections: Record<string, string> = {};
  for (const [projectKey, workspaceId] of Object.entries(value)) {
    if (typeof workspaceId === "string") {
      selections[projectKey] = workspaceId;
    }
  }
  return selections;
}

function areSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}

function areRecordsEqual(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}
