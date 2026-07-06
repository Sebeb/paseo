export interface WorkspaceNavigationHistoryEntry {
  serverId: string;
  workspaceId: string;
  projectId: string;
  paneId: string;
  tabId: string;
  timestamp: number;
}

export interface WorkspaceNavigationHistoryCoreState {
  entries: WorkspaceNavigationHistoryEntry[];
  currentIndex: number;
}

export type WorkspaceNavigationHistoryGroupMode = "project" | "status";

export interface WorkspaceNavigationHistoryScope {
  serverId: string;
  projectId: string;
  groupMode: WorkspaceNavigationHistoryGroupMode;
}

export interface WorkspaceNavigationHistoryValidity {
  isValidEntry: (entry: WorkspaceNavigationHistoryEntry) => boolean;
}

export const initialWorkspaceNavigationHistoryCoreState: WorkspaceNavigationHistoryCoreState = {
  entries: [],
  currentIndex: -1,
};

const MAX_HISTORY_ENTRIES = 200;

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeWorkspaceNavigationHistoryEntry(
  value: unknown,
): WorkspaceNavigationHistoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as WorkspaceNavigationHistoryEntry;
  const serverId = trimNonEmpty(raw.serverId);
  const workspaceId = trimNonEmpty(raw.workspaceId);
  const projectId = trimNonEmpty(raw.projectId);
  const paneId = trimNonEmpty(raw.paneId);
  const tabId = trimNonEmpty(raw.tabId);
  if (!serverId || !workspaceId || !projectId || !paneId || !tabId) {
    return null;
  }
  const timestamp =
    typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp)
      ? raw.timestamp
      : Date.now();
  return { serverId, workspaceId, projectId, paneId, tabId, timestamp };
}

export function workspaceNavigationEntriesEqual(
  left: WorkspaceNavigationHistoryEntry,
  right: WorkspaceNavigationHistoryEntry,
): boolean {
  return (
    left.serverId === right.serverId &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.paneId === right.paneId &&
    left.tabId === right.tabId
  );
}

function clampCurrentIndex(input: {
  entries: WorkspaceNavigationHistoryEntry[];
  currentIndex: number;
}): number {
  if (input.entries.length === 0) {
    return -1;
  }
  if (!Number.isInteger(input.currentIndex)) {
    return input.entries.length - 1;
  }
  return Math.max(0, Math.min(input.currentIndex, input.entries.length - 1));
}

export function normalizeWorkspaceNavigationHistoryState(
  state: unknown,
): WorkspaceNavigationHistoryCoreState {
  if (!state || typeof state !== "object") {
    return initialWorkspaceNavigationHistoryCoreState;
  }
  const raw = state as WorkspaceNavigationHistoryCoreState;
  const entries = Array.isArray(raw.entries)
    ? raw.entries
        .map((entry) => normalizeWorkspaceNavigationHistoryEntry(entry))
        .filter((entry): entry is WorkspaceNavigationHistoryEntry => entry !== null)
        .slice(-MAX_HISTORY_ENTRIES)
    : [];
  return {
    entries,
    currentIndex: clampCurrentIndex({ entries, currentIndex: raw.currentIndex }),
  };
}

export function appendWorkspaceNavigationHistoryEntry(
  state: WorkspaceNavigationHistoryCoreState,
  entry: WorkspaceNavigationHistoryEntry,
): WorkspaceNavigationHistoryCoreState {
  const normalizedState = normalizeWorkspaceNavigationHistoryState(state);
  const normalizedEntry = normalizeWorkspaceNavigationHistoryEntry(entry);
  if (!normalizedEntry) {
    return normalizedState;
  }

  const currentEntry =
    normalizedState.currentIndex >= 0
      ? normalizedState.entries[normalizedState.currentIndex]
      : null;
  if (currentEntry && workspaceNavigationEntriesEqual(currentEntry, normalizedEntry)) {
    const entries = normalizedState.entries.map((candidate, index) =>
      index === normalizedState.currentIndex
        ? { ...candidate, timestamp: normalizedEntry.timestamp }
        : candidate,
    );
    return { entries, currentIndex: normalizedState.currentIndex };
  }

  const retainedEntries =
    normalizedState.currentIndex >= 0
      ? normalizedState.entries.slice(0, normalizedState.currentIndex + 1)
      : normalizedState.entries;
  const nextEntries = [...retainedEntries, normalizedEntry].slice(-MAX_HISTORY_ENTRIES);
  return {
    entries: nextEntries,
    currentIndex: nextEntries.length - 1,
  };
}

export function setWorkspaceNavigationHistoryIndex(
  state: WorkspaceNavigationHistoryCoreState,
  index: number,
): WorkspaceNavigationHistoryCoreState {
  const normalizedState = normalizeWorkspaceNavigationHistoryState(state);
  if (!Number.isInteger(index) || index < 0 || index >= normalizedState.entries.length) {
    return normalizedState;
  }
  if (index === normalizedState.currentIndex) {
    return normalizedState;
  }
  return { ...normalizedState, currentIndex: index };
}

export function entryMatchesWorkspaceNavigationScope(
  entry: WorkspaceNavigationHistoryEntry,
  scope: WorkspaceNavigationHistoryScope,
): boolean {
  if (entry.serverId !== scope.serverId) {
    return false;
  }
  if (scope.groupMode === "status") {
    return true;
  }
  return entry.projectId === scope.projectId;
}

export function findWorkspaceNavigationHistoryIndex(input: {
  entries: WorkspaceNavigationHistoryEntry[];
  currentIndex: number;
  direction: "back" | "forward";
  scope: WorkspaceNavigationHistoryScope;
  isValidEntry: (entry: WorkspaceNavigationHistoryEntry) => boolean;
}): number | null {
  const step = input.direction === "back" ? -1 : 1;
  for (
    let index = input.currentIndex + step;
    index >= 0 && index < input.entries.length;
    index += step
  ) {
    const entry = input.entries[index];
    if (!entry) {
      continue;
    }
    if (entryMatchesWorkspaceNavigationScope(entry, input.scope) && input.isValidEntry(entry)) {
      return index;
    }
  }
  return null;
}

export function getWorkspaceNavigationHistoryItems(input: {
  entries: WorkspaceNavigationHistoryEntry[];
  currentIndex: number;
  direction: "back" | "forward";
  scope: WorkspaceNavigationHistoryScope;
  isValidEntry: (entry: WorkspaceNavigationHistoryEntry) => boolean;
}): Array<{ entry: WorkspaceNavigationHistoryEntry; index: number }> {
  const step = input.direction === "back" ? -1 : 1;
  const items: Array<{ entry: WorkspaceNavigationHistoryEntry; index: number }> = [];
  for (
    let index = input.currentIndex + step;
    index >= 0 && index < input.entries.length;
    index += step
  ) {
    const entry = input.entries[index];
    if (!entry) {
      continue;
    }
    if (entryMatchesWorkspaceNavigationScope(entry, input.scope) && input.isValidEntry(entry)) {
      items.push({ entry, index });
    }
  }
  return items;
}

export function pruneInvalidWorkspaceNavigationHistoryEntries(
  state: WorkspaceNavigationHistoryCoreState,
  validity: WorkspaceNavigationHistoryValidity,
): WorkspaceNavigationHistoryCoreState {
  const normalizedState = normalizeWorkspaceNavigationHistoryState(state);
  const currentEntry =
    normalizedState.currentIndex >= 0
      ? normalizedState.entries[normalizedState.currentIndex]
      : null;
  const entries = normalizedState.entries.filter((entry) => validity.isValidEntry(entry));
  const currentIndex =
    currentEntry && validity.isValidEntry(currentEntry)
      ? entries.findIndex((entry) => workspaceNavigationEntriesEqual(entry, currentEntry))
      : entries.length - 1;
  return {
    entries,
    currentIndex: clampCurrentIndex({ entries, currentIndex }),
  };
}
