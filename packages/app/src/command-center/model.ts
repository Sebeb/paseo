export type CommandCenterRootGroup =
  | "all"
  | "actions"
  | "agents"
  | "windows"
  | "workspaces"
  | "projects";

export type CommandCenterConcreteGroup = Exclude<CommandCenterRootGroup, "all">;

export type CommandCenterScopeMode = "workspace" | "project" | "allProjects";

export interface CommandCenterScopeSelection {
  mode: CommandCenterScopeMode;
  workspaceKey?: string | null;
  workspaceLabel?: string | null;
  projectKey?: string | null;
  projectLabel?: string | null;
}

export interface CommandCenterDefaults {
  group: CommandCenterRootGroup;
  scopeMode: CommandCenterScopeMode;
}

export interface CommandCenterSearchableItem {
  id: string;
  group: CommandCenterConcreteGroup;
  title: string;
  keywords?: readonly string[];
  statusRank?: number;
  isImportant?: boolean;
  updatedAt?: number | null;
  workspaceKey?: string | null;
  projectKey?: string | null;
  showAllForGroup?: CommandCenterConcreteGroup;
}

export interface CommandCenterDisplayGroup<T extends CommandCenterSearchableItem> {
  group: CommandCenterConcreteGroup;
  title: string;
  items: T[];
  totalCount: number;
  topScore: number;
}

export interface CommandCenterSubmenuDescriptor {
  id: string;
  title: string;
  icon: "arrow-left" | "arrow-right" | "folder" | "settings";
  placeholder: string;
}

export interface CommandCenterSubmenuState {
  stack: CommandCenterSubmenuDescriptor[];
}

export const COMMAND_CENTER_GROUP_ORDER: CommandCenterConcreteGroup[] = [
  "actions",
  "agents",
  "windows",
  "workspaces",
  "projects",
];

export const COMMAND_CENTER_SCOPE_ORDER: CommandCenterScopeMode[] = [
  "workspace",
  "project",
  "allProjects",
];

const MAX_VISIBLE_PER_GROUP = 3;
const DEFAULT_STATUS_RANK = 999;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function queryTokens(query: string): string[] {
  const normalized = normalize(query);
  return normalized.length > 0 ? normalized.split(/\s+/g).filter(Boolean) : [];
}

export function scoreCommandCenterItem(
  item: Pick<CommandCenterSearchableItem, "title" | "keywords">,
  query: string,
): number {
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return 1;
  }

  const title = normalize(item.title);
  const keywords = (item.keywords ?? []).map(normalize);
  let score = 0;

  for (const token of tokens) {
    if (title === token) {
      score += 120;
      continue;
    }
    if (title.startsWith(token)) {
      score += 80;
      continue;
    }
    if (title.includes(token)) {
      score += 50;
      continue;
    }
    if (keywords.some((keyword) => keyword === token || keyword.startsWith(token))) {
      score += 35;
      continue;
    }
    if (keywords.some((keyword) => keyword.includes(token))) {
      score += 20;
      continue;
    }
    return 0;
  }

  return score;
}

export function itemMatchesScope(
  item: Pick<CommandCenterSearchableItem, "workspaceKey" | "projectKey">,
  scope: CommandCenterScopeSelection,
): boolean {
  if (scope.mode === "allProjects") {
    return true;
  }
  if (scope.mode === "workspace") {
    return Boolean(scope.workspaceKey) && item.workspaceKey === scope.workspaceKey;
  }
  return Boolean(scope.projectKey) && item.projectKey === scope.projectKey;
}

function compareItems(
  left: CommandCenterSearchableItem,
  right: CommandCenterSearchableItem,
): number {
  const statusDelta =
    (left.statusRank ?? DEFAULT_STATUS_RANK) - (right.statusRank ?? DEFAULT_STATUS_RANK);
  if (statusDelta !== 0) {
    return statusDelta;
  }
  const timeDelta = (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
  if (timeDelta !== 0) {
    return timeDelta;
  }
  const titleDelta = left.title.localeCompare(right.title, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (titleDelta !== 0) {
    return titleDelta;
  }
  return left.id.localeCompare(right.id);
}

function compareMatchedItems(
  left: { item: CommandCenterSearchableItem; score: number },
  right: { item: CommandCenterSearchableItem; score: number },
): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  return compareItems(left.item, right.item);
}

// eslint-disable-next-line complexity
export function buildCommandCenterGroups<T extends CommandCenterSearchableItem>(input: {
  items: readonly T[];
  query: string;
  groupFilter: CommandCenterRootGroup;
  scope: CommandCenterScopeSelection;
  groupTitles: Record<CommandCenterConcreteGroup, string>;
  includeShowAllRows?: boolean;
  createShowAllItem?: (group: CommandCenterConcreteGroup, hiddenCount: number) => T;
}): CommandCenterDisplayGroup<T>[] {
  const hasQuery = input.query.trim().length > 0;
  const grouped = new Map<CommandCenterConcreteGroup, Array<{ item: T; score: number }>>();

  for (const item of input.items) {
    if (input.groupFilter !== "all" && item.group !== input.groupFilter) {
      continue;
    }
    if (
      (item.group === "agents" || item.group === "windows") &&
      !itemMatchesScope(item, input.scope)
    ) {
      continue;
    }
    const score = scoreCommandCenterItem(item, input.query);
    if (hasQuery && score <= 0) {
      continue;
    }
    const bucket = grouped.get(item.group) ?? [];
    bucket.push({ item, score });
    grouped.set(item.group, bucket);
  }

  const groups: CommandCenterDisplayGroup<T>[] = [];
  for (const group of COMMAND_CENTER_GROUP_ORDER) {
    const bucket = grouped.get(group);
    if (!bucket || bucket.length === 0) {
      continue;
    }
    const sorted = bucket
      .slice()
      .sort(hasQuery ? compareMatchedItems : (left, right) => compareItems(left.item, right.item));
    const totalCount = sorted.length;
    let visible = sorted.map(({ item }) => item);

    if (!hasQuery) {
      const base = visible.slice(0, MAX_VISIBLE_PER_GROUP);
      const important = visible.slice(MAX_VISIBLE_PER_GROUP).filter((item) => item.isImportant);
      visible = [...base, ...important];
    } else if (input.groupFilter === "all" && visible.length > MAX_VISIBLE_PER_GROUP) {
      const hiddenCount = visible.length - MAX_VISIBLE_PER_GROUP;
      visible = visible.slice(0, MAX_VISIBLE_PER_GROUP);
      if (input.includeShowAllRows && input.createShowAllItem) {
        visible.push(input.createShowAllItem(group, hiddenCount));
      }
    }

    groups.push({
      group,
      title: input.groupTitles[group],
      items: visible,
      totalCount,
      topScore: sorted[0]?.score ?? 0,
    });
  }

  if (hasQuery && input.groupFilter === "all") {
    groups.sort((left, right) => {
      if (left.topScore !== right.topScore) {
        return right.topScore - left.topScore;
      }
      return (
        COMMAND_CENTER_GROUP_ORDER.indexOf(left.group) -
        COMMAND_CENTER_GROUP_ORDER.indexOf(right.group)
      );
    });
  }

  return groups;
}

export function flattenCommandCenterGroups<T extends CommandCenterSearchableItem>(
  groups: readonly CommandCenterDisplayGroup<T>[],
): T[] {
  return groups.flatMap((group) => group.items);
}

export function cycleCommandCenterGroup(
  group: CommandCenterRootGroup,
  direction: 1 | -1 = 1,
): CommandCenterRootGroup {
  const order: CommandCenterRootGroup[] = ["all", ...COMMAND_CENTER_GROUP_ORDER];
  const index = Math.max(0, order.indexOf(group));
  return order[(index + direction + order.length) % order.length] ?? "all";
}

export function cycleCommandCenterScopeMode(
  mode: CommandCenterScopeMode,
  direction: 1 | -1 = 1,
): CommandCenterScopeMode {
  const index = Math.max(0, COMMAND_CENTER_SCOPE_ORDER.indexOf(mode));
  return (
    COMMAND_CENTER_SCOPE_ORDER[
      (index + direction + COMMAND_CENTER_SCOPE_ORDER.length) % COMMAND_CENTER_SCOPE_ORDER.length
    ] ?? "allProjects"
  );
}

export function applyCommandCenterScopeCycle(
  scope: CommandCenterScopeSelection,
  direction: 1 | -1 = 1,
): CommandCenterScopeSelection {
  const mode = cycleCommandCenterScopeMode(scope.mode, direction);
  return { mode };
}

export function sanitizeCommandCenterDefaults(input: {
  group: CommandCenterRootGroup;
  scope: CommandCenterScopeSelection;
}): CommandCenterDefaults {
  return {
    group: input.group,
    scopeMode: input.scope.mode,
  };
}

export function createCommandCenterScopeFromDefaults(
  defaults: CommandCenterDefaults,
): CommandCenterScopeSelection {
  return { mode: defaults.scopeMode };
}

export function pushCommandCenterSubmenu(
  state: CommandCenterSubmenuState,
  descriptor: CommandCenterSubmenuDescriptor,
): CommandCenterSubmenuState {
  return { stack: [...state.stack, descriptor] };
}

export function popCommandCenterSubmenu(
  state: CommandCenterSubmenuState,
): CommandCenterSubmenuState {
  return { stack: state.stack.slice(0, -1) };
}

export function getActiveCommandCenterSubmenu(
  state: CommandCenterSubmenuState,
): CommandCenterSubmenuDescriptor | null {
  return state.stack.at(-1) ?? null;
}
