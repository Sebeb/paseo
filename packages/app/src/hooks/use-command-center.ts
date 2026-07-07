import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextInput } from "react-native";
import { router, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/shallow";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { keyboardActionDispatcher } from "@/keyboard/keyboard-action-dispatcher";
import { useAggregatedAgents, type AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { useOpenProjectPicker } from "@/hooks/use-open-project-picker";
import {
  clearCommandCenterFocusRestoreElement,
  takeCommandCenterFocusRestoreElement,
} from "@/utils/command-center-focus-restore";
import {
  buildOpenProjectRoute,
  buildProjectSettingsRoute,
  buildSettingsRoute,
} from "@/utils/host-routes";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { chordStringToShortcutKeys } from "@/keyboard/shortcut-string";
import { getBindingIdForAction, getDefaultKeysForAction } from "@/keyboard/keyboard-shortcuts";
import { useKeyboardShortcutOverrides } from "@/hooks/use-keyboard-shortcut-overrides";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { getIsElectronRuntime } from "@/constants/layout";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { focusWithRetries } from "@/utils/web-focus";
import { isWeb } from "@/constants/platform";
import {
  applyCommandCenterScopeCycle,
  buildCommandCenterGroups,
  createCommandCenterScopeFromDefaults,
  flattenCommandCenterGroups,
  getActiveCommandCenterSubmenu,
  popCommandCenterSubmenu,
  pushCommandCenterSubmenu,
  sanitizeCommandCenterDefaults,
  type CommandCenterConcreteGroup,
  type CommandCenterDisplayGroup,
  type CommandCenterRootGroup,
  type CommandCenterScopeMode,
  type CommandCenterScopeSelection,
  type CommandCenterSearchableItem,
  type CommandCenterSubmenuDescriptor,
  type CommandCenterSubmenuState,
} from "@/command-center/model";
import { useCommandCenterSettingsStore } from "@/stores/command-center-settings-store";
import { useHosts } from "@/runtime/host-runtime";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { collectAllTabs, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import {
  buildWorkspaceTabPersistenceKey,
  type WorkspaceTab,
  type WorkspaceTabTarget,
} from "@/stores/workspace-tabs-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useHostProjects, type HostProjectListItem } from "@/projects/host-projects";
import {
  useWorkspaceNavigationHistoryStore,
  type WorkspaceNavigationHistoryEntry,
  type WorkspaceNavigationHistoryScope,
} from "@/stores/workspace-navigation-history-store";
import { findPaneContainingTab } from "@/stores/workspace-layout-actions";
import { shortenPath } from "@/utils/shorten-path";

const EMPTY_COMMAND_CENTER_ITEMS: CommandCenterItem[] = [];
const EMPTY_COMMAND_CENTER_GROUPS: CommandCenterDisplayGroup<CommandCenterItem>[] = [];
const DEFAULT_STATUS_RANK = 4;

type CommandCenterActionIcon = "plus" | "settings" | "home" | "arrow-left" | "arrow-right" | "save";

interface CommandCenterActionDefinition {
  id: string;
  titleKey:
    | "shell.commandCenter.openProject"
    | "shell.commandCenter.home"
    | "sidebar.actions.settings"
    | "shell.commandCenter.back"
    | "shell.commandCenter.forward"
    | "shell.commandCenter.setDefaultSearchSettings";
  icon: CommandCenterActionIcon;
  actionId?: string;
  keywords: string[];
  routeKind: "settings" | "home" | "none";
  historyDirection?: "back" | "forward";
}

const COMMAND_CENTER_ACTIONS: readonly CommandCenterActionDefinition[] = [
  {
    id: "new-agent",
    titleKey: "shell.commandCenter.openProject",
    icon: "plus",
    actionId: "new-agent",
    keywords: ["open", "project", "folder", "workspace", "repo"],
    routeKind: "none",
  },
  {
    id: "home",
    titleKey: "shell.commandCenter.home",
    icon: "home",
    keywords: ["home", "start", "import", "session", "pair", "device", "providers"],
    routeKind: "home",
  },
  {
    id: "settings",
    titleKey: "sidebar.actions.settings",
    icon: "settings",
    keywords: ["settings", "preferences", "config", "configuration"],
    routeKind: "settings",
  },
  {
    id: "back",
    titleKey: "shell.commandCenter.back",
    icon: "arrow-left",
    keywords: ["back", "previous", "history"],
    routeKind: "none",
    historyDirection: "back",
  },
  {
    id: "forward",
    titleKey: "shell.commandCenter.forward",
    icon: "arrow-right",
    keywords: ["forward", "next", "history"],
    routeKind: "none",
    historyDirection: "forward",
  },
  {
    id: "set-default-search-settings",
    titleKey: "shell.commandCenter.setDefaultSearchSettings",
    icon: "save",
    keywords: ["default", "save", "search", "settings", "filters"],
    routeKind: "none",
  },
];

export interface CommandCenterActionItem extends CommandCenterSearchableItem {
  kind: "action";
  group: "actions";
  actionId: string;
  icon: CommandCenterActionIcon;
  route?: Href;
  shortcutKeys?: ShortcutKey[][];
  disabled?: boolean;
  historyDirection?: "back" | "forward";
  detail?: string;
}

export interface CommandCenterAgentItem extends CommandCenterSearchableItem {
  kind: "agent";
  group: "agents";
  agent: AggregatedAgent;
  detail: string;
}

export interface CommandCenterWindowItem extends CommandCenterSearchableItem {
  kind: "window";
  group: "windows";
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
  projectKey: string;
  tab: WorkspaceTab;
  windowKind: Exclude<WorkspaceTabTarget["kind"], "agent">;
  detail: string;
}

export interface CommandCenterWorkspaceItem extends CommandCenterSearchableItem {
  kind: "workspace";
  group: "workspaces";
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
  projectKey: string;
  workspace: WorkspaceDescriptor;
  detail: string;
}

export interface CommandCenterProjectItem extends CommandCenterSearchableItem {
  kind: "project";
  group: "projects";
  project: HostProjectListItem | ProjectFromWorkspace;
  projectKey: string;
  detail: string;
}

export interface CommandCenterHistoryItem extends CommandCenterSearchableItem {
  kind: "history";
  group: "actions";
  entry: WorkspaceNavigationHistoryEntry;
  historyIndex: number;
  detail: string;
}

export interface CommandCenterShowAllItem extends CommandCenterSearchableItem {
  kind: "show-all";
  showAllForGroup: CommandCenterConcreteGroup;
}

export type CommandCenterItem =
  | CommandCenterActionItem
  | CommandCenterAgentItem
  | CommandCenterWindowItem
  | CommandCenterWorkspaceItem
  | CommandCenterProjectItem
  | CommandCenterHistoryItem
  | CommandCenterShowAllItem;

interface ProjectFromWorkspace {
  serverId: string;
  projectKey: string;
  projectName: string;
  projectKind: WorkspaceDescriptor["projectKind"];
  iconWorkingDir: string;
  workspaceKeys: string[];
  canCreateWorktree: boolean;
}

export interface CommandCenterFilterPill {
  id: CommandCenterRootGroup;
  label: string;
  selected: boolean;
}

export interface CommandCenterScopePill {
  id: CommandCenterScopeMode;
  label: string;
  selected: boolean;
}

function resolveActionShortcutKeys(
  actionId: string | undefined,
  overrides: Record<string, string>,
): ShortcutKey[][] | undefined {
  if (!actionId) return undefined;
  const isMac = getShortcutOs() === "mac";
  const isDesktopApp = getIsElectronRuntime();
  const platform = { isMac, isDesktop: isDesktopApp };
  const bindingId = getBindingIdForAction(actionId, platform);
  if (!bindingId) return undefined;
  const override = overrides[bindingId];
  if (override) return chordStringToShortcutKeys(override);
  const defaultKeys = getDefaultKeysForAction(actionId, platform);
  return defaultKeys ? [defaultKeys] : undefined;
}

function workspaceKeyFor(serverId: string, workspaceId: string): string {
  return `${serverId}:${workspaceId}`;
}

function statusRankFromAgent(agent: AggregatedAgent): number {
  if ((agent.pendingPermissionCount ?? 0) > 0) return 0;
  if (agent.requiresAttention && agent.attentionReason === "error") return 1;
  if (agent.requiresAttention) return 2;
  if (agent.status === "running") return 3;
  return DEFAULT_STATUS_RANK;
}

function isImportantAgent(agent: AggregatedAgent): boolean {
  return (
    (agent.pendingPermissionCount ?? 0) > 0 ||
    Boolean(agent.requiresAttention) ||
    agent.status === "running"
  );
}

function statusRankFromWorkspace(workspace: WorkspaceDescriptor): number {
  switch (workspace.status) {
    case "needs_input":
      return 0;
    case "failed":
      return 1;
    case "attention":
      return 2;
    case "running":
      return 3;
    case "done":
      return DEFAULT_STATUS_RANK;
  }
}

function basename(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/g, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

function resolveWorkspaceLabel(workspace: WorkspaceDescriptor | null | undefined): string {
  if (!workspace) {
    return "";
  }
  return workspace.title ?? workspace.name ?? workspace.id;
}

function resolveProjectLabel(project: HostProjectListItem | ProjectFromWorkspace): string {
  return project.projectName || basename(project.iconWorkingDir) || project.projectKey;
}

function describeTabTarget(target: WorkspaceTabTarget): { title: string; keywords: string[] } {
  switch (target.kind) {
    case "terminal":
      return {
        title: "Terminal",
        keywords: ["shell", "cli", target.terminalId],
      };
    case "browser":
      return {
        title: "Browser",
        keywords: ["web", "browser", target.browserId],
      };
    case "file":
      return {
        title: basename(target.path) || target.path,
        keywords: ["file", target.path],
      };
    case "setup":
      return {
        title: "Setup",
        keywords: ["setup", "configuration", target.workspaceId],
      };
    case "draft":
      return {
        title: "Draft",
        keywords: ["draft", "new agent", target.draftId],
      };
    case "agent":
      return {
        title: "Agent",
        keywords: [target.agentId],
      };
  }
}

function createProjectRowsFromSessions(input: {
  projects: readonly HostProjectListItem[];
  workspacesByKey: ReadonlyMap<string, WorkspaceDescriptor>;
}): Array<HostProjectListItem | ProjectFromWorkspace> {
  const byKey = new Map<string, HostProjectListItem | ProjectFromWorkspace>();
  for (const project of input.projects) {
    byKey.set(project.projectKey, project);
  }
  for (const [workspaceKey, workspace] of input.workspacesByKey) {
    if (byKey.has(workspace.projectId)) {
      continue;
    }
    const existing = byKey.get(workspace.projectId) as ProjectFromWorkspace | undefined;
    const workspaceKeys = existing ? [...existing.workspaceKeys, workspaceKey] : [workspaceKey];
    byKey.set(workspace.projectId, {
      serverId: workspaceKey.split(":")[0] ?? "",
      projectKey: workspace.projectId,
      projectName: workspace.projectCustomName ?? workspace.projectDisplayName,
      projectKind: workspace.projectKind,
      iconWorkingDir: workspace.projectRootPath,
      workspaceKeys,
      canCreateWorktree: false,
    });
  }
  return [...byKey.values()];
}

function historyScopeFor(input: {
  serverId: string | null;
  projectId: string | null;
  scope: CommandCenterScopeSelection;
}): WorkspaceNavigationHistoryScope | null {
  if (!input.serverId || !input.projectId) {
    return null;
  }
  return {
    serverId: input.serverId,
    projectId: input.projectId,
    groupMode: input.scope.mode === "allProjects" ? "status" : "project",
  };
}

function createShowAllItem(
  group: CommandCenterConcreteGroup,
  hiddenCount: number,
  title: string,
): CommandCenterShowAllItem {
  return {
    kind: "show-all",
    id: `show-all:${group}`,
    group,
    title,
    showAllForGroup: group,
    keywords: [],
    updatedAt: 0,
    statusRank: DEFAULT_STATUS_RANK,
    isImportant: false,
  };
}

function isHistorySubmenu(id: string): id is "history:back" | "history:forward" {
  return id === "history:back" || id === "history:forward";
}

function directionFromSubmenu(id: "history:back" | "history:forward"): "back" | "forward" {
  return id === "history:back" ? "back" : "forward";
}

export function useCommandCenter() {
  const { t } = useTranslation();
  const { overrides } = useKeyboardShortcutOverrides();
  const open = useKeyboardShortcutsStore((s) => s.commandCenterOpen);
  const setOpen = useKeyboardShortcutsStore((s) => s.setCommandCenterOpen);
  const defaults = useCommandCenterSettingsStore((s) => s.defaults);
  const saveDefaults = useCommandCenterSettingsStore((s) => s.setDefaults);
  const inputRef = useRef<TextInput>(null);
  const didNavigateRef = useRef(false);
  const prevOpenRef = useRef(open);
  const activeIndexRef = useRef(0);
  const itemsRef = useRef<CommandCenterItem[]>([]);
  const handleCloseRef = useRef<() => void>(() => undefined);
  const handleSelectItemRef = useRef<(item: CommandCenterItem) => void>(() => undefined);
  const handleAlternateItemRef = useRef<(item: CommandCenterItem) => void>(() => undefined);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [groupFilter, setGroupFilter] = useState<CommandCenterRootGroup>(defaults.group);
  const [scope, setScope] = useState<CommandCenterScopeSelection>(() =>
    createCommandCenterScopeFromDefaults(defaults),
  );
  const [submenuState, setSubmenuState] = useState<CommandCenterSubmenuState>({ stack: [] });

  const hosts = useHosts();
  const hostProjects = useHostProjects(hosts.map((host) => host.serverId));
  const activeWorkspace = useActiveWorkspaceSelection();
  const { agents } = useAggregatedAgents();
  const openProjectPicker = useOpenProjectPicker();
  const layoutByWorkspace = useWorkspaceLayoutStore((s) => s.layoutByWorkspace);
  const focusWorkspaceTab = useWorkspaceLayoutStore((s) => s.focusTab);
  const focusWorkspacePane = useWorkspaceLayoutStore((s) => s.focusPane);
  const browsersById = useBrowserStore((s) => s.browsersById);
  const historyVersion = useWorkspaceNavigationHistoryStore(
    (s) => `${s.currentIndex}:${s.entries.length}`,
  );
  const getHistoryItems = useWorkspaceNavigationHistoryStore((s) => s.getHistoryItems);
  const setHistoryCurrentIndex = useWorkspaceNavigationHistoryStore((s) => s.setCurrentIndex);
  const sessionSnapshot = useSessionStore(
    useShallow((state) => {
      const workspacesByKey = new Map<string, WorkspaceDescriptor>();
      for (const [serverId, session] of Object.entries(state.sessions)) {
        for (const workspace of session.workspaces.values()) {
          workspacesByKey.set(workspaceKeyFor(serverId, workspace.id), workspace);
        }
      }
      return { workspacesByKey };
    }),
  );

  const currentWorkspaceKey =
    activeWorkspace?.serverId && activeWorkspace.workspaceId
      ? workspaceKeyFor(activeWorkspace.serverId, activeWorkspace.workspaceId)
      : null;
  const currentWorkspaceDescriptor = currentWorkspaceKey
    ? (sessionSnapshot.workspacesByKey.get(currentWorkspaceKey) ?? null)
    : null;
  const currentProjectKey = currentWorkspaceDescriptor?.projectId ?? null;

  const resolvedScope = useMemo<CommandCenterScopeSelection>(() => {
    if (scope.mode === "workspace" && !scope.workspaceKey && currentWorkspaceKey) {
      return {
        mode: "workspace",
        workspaceKey: currentWorkspaceKey,
        workspaceLabel: resolveWorkspaceLabel(currentWorkspaceDescriptor),
      };
    }
    if (scope.mode === "project" && !scope.projectKey && currentProjectKey) {
      return {
        mode: "project",
        projectKey: currentProjectKey,
        projectLabel:
          currentWorkspaceDescriptor?.projectCustomName ??
          currentWorkspaceDescriptor?.projectDisplayName ??
          currentProjectKey,
      };
    }
    return scope;
  }, [currentProjectKey, currentWorkspaceDescriptor, currentWorkspaceKey, scope]);

  const settingsRoute = useMemo<Href>(() => buildSettingsRoute(), []);
  const homeRoute = useMemo<Href>(() => buildOpenProjectRoute() as Href, []);

  const isHistoryEntryValid = useCallback(
    (entry: WorkspaceNavigationHistoryEntry) => {
      const workspaceKey = buildWorkspaceTabPersistenceKey({
        serverId: entry.serverId,
        workspaceId: entry.workspaceId,
      });
      if (!workspaceKey) {
        return false;
      }
      const layout = layoutByWorkspace[workspaceKey];
      if (!layout) {
        return false;
      }
      return Boolean(findPaneContainingTab(layout.root, entry.tabId));
    },
    [layoutByWorkspace],
  );

  const historyScope = useMemo(
    () =>
      historyScopeFor({
        serverId: activeWorkspace?.serverId ?? null,
        projectId: currentProjectKey,
        scope: resolvedScope,
      }),
    [activeWorkspace?.serverId, currentProjectKey, resolvedScope],
  );

  const historyItemsByDirection = useMemo(() => {
    void historyVersion;
    if (!historyScope) {
      return { back: [], forward: [] } as const;
    }
    return {
      back: getHistoryItems({
        direction: "back",
        scope: historyScope,
        isValidEntry: isHistoryEntryValid,
      }),
      forward: getHistoryItems({
        direction: "forward",
        scope: historyScope,
        isValidEntry: isHistoryEntryValid,
      }),
    } as const;
  }, [getHistoryItems, historyScope, historyVersion, isHistoryEntryValid]);

  const actionItems = useMemo<CommandCenterActionItem[]>(() => {
    if (!open) {
      return [];
    }
    return COMMAND_CENTER_ACTIONS.map((action) => {
      let route: Href | undefined;
      if (action.routeKind === "settings") route = settingsRoute;
      else if (action.routeKind === "home") route = homeRoute;
      const historyCount = action.historyDirection
        ? historyItemsByDirection[action.historyDirection].length
        : 0;
      return {
        kind: "action",
        group: "actions",
        id: `action:${action.id}`,
        actionId: action.id,
        title: t(action.titleKey),
        icon: action.icon,
        route,
        keywords: action.keywords,
        shortcutKeys: resolveActionShortcutKeys(action.actionId, overrides),
        disabled: Boolean(action.historyDirection && historyCount === 0),
        historyDirection: action.historyDirection,
        detail:
          action.historyDirection && historyCount > 0
            ? t("shell.commandCenter.historyCount", { count: historyCount })
            : undefined,
        updatedAt: 0,
        statusRank: DEFAULT_STATUS_RANK,
      };
    });
  }, [historyItemsByDirection, homeRoute, open, overrides, settingsRoute, t]);

  const agentItems = useMemo<CommandCenterAgentItem[]>(() => {
    if (!open) {
      return [];
    }
    return agents.map((agent) => {
      const projectKey = agent.projectPlacement?.projectKey ?? currentProjectKey ?? null;
      const workspaceKey = agent.workspaceId
        ? workspaceKeyFor(agent.serverId, agent.workspaceId)
        : null;
      const detailParts = [agent.serverLabel, shortenPath(agent.cwd)].filter(Boolean);
      return {
        kind: "agent",
        group: "agents",
        id: `agent:${agent.serverId}:${agent.id}`,
        title: agent.title || t("shell.commandCenter.newAgent"),
        keywords: [
          agent.cwd,
          agent.provider,
          agent.serverLabel,
          agent.projectPlacement?.projectName ?? "",
          agent.workspaceId ?? "",
        ],
        statusRank: statusRankFromAgent(agent),
        isImportant: isImportantAgent(agent),
        updatedAt: agent.lastActivityAt.getTime(),
        workspaceKey,
        projectKey,
        agent,
        detail: detailParts.join(" · "),
      };
    });
  }, [agents, currentProjectKey, open, t]);

  const windowItems = useMemo<CommandCenterWindowItem[]>(() => {
    if (!open) {
      return [];
    }
    const items: CommandCenterWindowItem[] = [];
    for (const [workspaceKey, layout] of Object.entries(layoutByWorkspace)) {
      const workspace = sessionSnapshot.workspacesByKey.get(workspaceKey);
      if (!workspace) {
        continue;
      }
      const [serverId, workspaceId] = workspaceKey.split(":");
      if (!serverId || !workspaceId) {
        continue;
      }
      for (const tab of collectAllTabs(layout.root)) {
        if (tab.target.kind === "agent") {
          continue;
        }
        const tabPresentation = describeTabTarget(tab.target);
        let title = tabPresentation.title;
        if (tab.target.kind === "browser") {
          const browser = browsersById[tab.target.browserId];
          title = browser?.title || browser?.url || title;
        }
        items.push({
          kind: "window",
          group: "windows",
          id: `window:${workspaceKey}:${tab.tabId}`,
          title,
          keywords: [
            ...tabPresentation.keywords,
            resolveWorkspaceLabel(workspace),
            workspace.projectDisplayName,
            workspace.projectRootPath,
          ],
          statusRank:
            tab.target.kind === "browser" && browsersById[tab.target.browserId]?.isLoading
              ? 3
              : DEFAULT_STATUS_RANK,
          isImportant: false,
          updatedAt: tab.createdAt,
          workspaceKey,
          projectKey: workspace.projectId,
          serverId,
          workspaceId,
          tab,
          windowKind: tab.target.kind,
          detail: `${resolveWorkspaceLabel(workspace)} · ${workspace.projectDisplayName}`,
        });
      }
    }
    return items;
  }, [browsersById, layoutByWorkspace, open, sessionSnapshot.workspacesByKey]);

  const workspaceItems = useMemo<CommandCenterWorkspaceItem[]>(() => {
    if (!open) {
      return [];
    }
    return [...sessionSnapshot.workspacesByKey.entries()].map(([workspaceKey, workspace]) => {
      const [serverId, workspaceId] = workspaceKey.split(":");
      return {
        kind: "workspace",
        group: "workspaces",
        id: `workspace:${workspaceKey}`,
        title: resolveWorkspaceLabel(workspace),
        keywords: [
          workspace.projectDisplayName,
          workspace.projectCustomName ?? "",
          workspace.projectRootPath,
          workspace.workspaceDirectory,
        ],
        statusRank: statusRankFromWorkspace(workspace),
        isImportant: workspace.status === "needs_input" || workspace.status === "failed",
        updatedAt:
          (workspace.activityAt ?? workspace.createdAt ?? workspace.statusEnteredAt)?.getTime() ??
          0,
        workspaceKey,
        projectKey: workspace.projectId,
        serverId: serverId ?? "",
        workspaceId: workspaceId ?? workspace.id,
        workspace,
        detail: `${workspace.projectDisplayName} · ${shortenPath(workspace.workspaceDirectory || workspace.projectRootPath)}`,
      };
    });
  }, [open, sessionSnapshot.workspacesByKey]);

  const projectItems = useMemo<CommandCenterProjectItem[]>(() => {
    if (!open) {
      return [];
    }
    return createProjectRowsFromSessions({
      projects: hostProjects,
      workspacesByKey: sessionSnapshot.workspacesByKey,
    }).map((project) => {
      const title = resolveProjectLabel(project);
      return {
        kind: "project",
        group: "projects",
        id: `project:${project.projectKey}`,
        title,
        keywords: [project.projectKey, project.iconWorkingDir, project.projectKind],
        statusRank: DEFAULT_STATUS_RANK,
        isImportant: false,
        updatedAt: 0,
        projectKey: project.projectKey,
        project,
        detail: shortenPath(project.iconWorkingDir),
      };
    });
  }, [hostProjects, open, sessionSnapshot.workspacesByKey]);

  const activeSubmenu = getActiveCommandCenterSubmenu(submenuState);

  const historySubmenuItems = useMemo<CommandCenterHistoryItem[]>(() => {
    if (!activeSubmenu || !isHistorySubmenu(activeSubmenu.id)) {
      return [];
    }
    const direction = directionFromSubmenu(activeSubmenu.id);
    return historyItemsByDirection[direction].map(({ entry, index }) => {
      const workspaceKey = workspaceKeyFor(entry.serverId, entry.workspaceId);
      const workspace = sessionSnapshot.workspacesByKey.get(workspaceKey);
      const layout = layoutByWorkspace[workspaceKey];
      const tab = layout
        ? collectAllTabs(layout.root).find((item) => item.tabId === entry.tabId)
        : null;
      const tabPresentation = tab ? describeTabTarget(tab.target) : null;
      return {
        kind: "history",
        group: "actions",
        id: `history:${direction}:${index}`,
        title:
          tabPresentation?.title ??
          resolveWorkspaceLabel(workspace) ??
          t("shell.commandCenter.window"),
        keywords: [
          ...(tabPresentation?.keywords ?? []),
          resolveWorkspaceLabel(workspace),
          workspace?.projectDisplayName ?? "",
        ],
        statusRank: DEFAULT_STATUS_RANK,
        isImportant: false,
        updatedAt: entry.timestamp,
        workspaceKey,
        projectKey: entry.projectId,
        entry,
        historyIndex: index,
        detail: workspace
          ? `${resolveWorkspaceLabel(workspace)} · ${workspace.projectDisplayName}`
          : entry.workspaceId,
      };
    });
  }, [
    activeSubmenu,
    historyItemsByDirection,
    layoutByWorkspace,
    sessionSnapshot.workspacesByKey,
    t,
  ]);

  const groupTitles = useMemo<Record<CommandCenterConcreteGroup, string>>(
    () => ({
      actions: t("shell.commandCenter.actions"),
      agents: t("shell.commandCenter.agents"),
      windows: t("shell.commandCenter.windows"),
      workspaces: t("shell.commandCenter.workspaces"),
      projects: t("shell.commandCenter.projects"),
    }),
    [t],
  );

  const groups = useMemo(() => {
    if (!open) {
      return EMPTY_COMMAND_CENTER_GROUPS;
    }
    if (activeSubmenu) {
      const submenuItems = historySubmenuItems.filter(
        (item) => !query.trim() || item.title.toLowerCase().includes(query.trim().toLowerCase()),
      );
      return submenuItems.length > 0
        ? [
            {
              group: "actions" as const,
              title: activeSubmenu.title,
              items: submenuItems,
              totalCount: submenuItems.length,
              topScore: 1,
            },
          ]
        : EMPTY_COMMAND_CENTER_GROUPS;
    }
    const rootItems: CommandCenterItem[] = [
      ...actionItems,
      ...agentItems,
      ...windowItems,
      ...workspaceItems,
      ...projectItems,
    ];
    return buildCommandCenterGroups({
      items: rootItems,
      query,
      groupFilter,
      scope: resolvedScope,
      groupTitles,
      includeShowAllRows: true,
      createShowAllItem: (group, hiddenCount) =>
        createShowAllItem(
          group,
          hiddenCount,
          t("shell.commandCenter.showAll", {
            count: hiddenCount,
            group: groupTitles[group].toLowerCase(),
          }),
        ),
    });
  }, [
    actionItems,
    activeSubmenu,
    agentItems,
    groupFilter,
    groupTitles,
    historySubmenuItems,
    open,
    projectItems,
    query,
    resolvedScope,
    t,
    windowItems,
    workspaceItems,
  ]);

  const items = useMemo(
    () => (open ? flattenCommandCenterGroups(groups) : EMPTY_COMMAND_CENTER_ITEMS),
    [groups, open],
  );

  const filterPills = useMemo<CommandCenterFilterPill[]>(
    () => [
      { id: "all", label: t("shell.commandCenter.all"), selected: groupFilter === "all" },
      { id: "actions", label: groupTitles.actions, selected: groupFilter === "actions" },
      { id: "agents", label: groupTitles.agents, selected: groupFilter === "agents" },
      { id: "windows", label: groupTitles.windows, selected: groupFilter === "windows" },
      { id: "workspaces", label: groupTitles.workspaces, selected: groupFilter === "workspaces" },
      { id: "projects", label: groupTitles.projects, selected: groupFilter === "projects" },
    ],
    [groupFilter, groupTitles, t],
  );

  const scopePills = useMemo<CommandCenterScopePill[]>(
    () => [
      {
        id: "workspace",
        label:
          resolvedScope.mode === "workspace" && resolvedScope.workspaceLabel
            ? resolvedScope.workspaceLabel
            : t("shell.commandCenter.currentWorkspace"),
        selected: resolvedScope.mode === "workspace",
      },
      {
        id: "project",
        label:
          resolvedScope.mode === "project" && resolvedScope.projectLabel
            ? resolvedScope.projectLabel
            : t("shell.commandCenter.currentProject"),
        selected: resolvedScope.mode === "project",
      },
      {
        id: "allProjects",
        label: t("shell.commandCenter.allProjects"),
        selected: resolvedScope.mode === "allProjects",
      },
    ],
    [resolvedScope, t],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const focusHistoryEntry = useCallback(
    (entry: WorkspaceNavigationHistoryEntry, index: number) => {
      if (!isHistoryEntryValid(entry)) {
        return;
      }
      const workspaceKey = buildWorkspaceTabPersistenceKey({
        serverId: entry.serverId,
        workspaceId: entry.workspaceId,
      });
      if (!workspaceKey) {
        return;
      }
      didNavigateRef.current = true;
      clearCommandCenterFocusRestoreElement();
      setOpen(false);
      setHistoryCurrentIndex(index);
      focusWorkspacePane(workspaceKey, entry.paneId);
      focusWorkspaceTab(workspaceKey, entry.tabId);
      navigateToWorkspace(entry.serverId, entry.workspaceId, {
        openAttentionAgent: false,
      });
    },
    [focusWorkspacePane, focusWorkspaceTab, isHistoryEntryValid, setHistoryCurrentIndex, setOpen],
  );

  const enterHistorySubmenu = useCallback(
    (direction: "back" | "forward") => {
      const descriptor: CommandCenterSubmenuDescriptor = {
        id: `history:${direction}`,
        title:
          direction === "back" ? t("shell.commandCenter.back") : t("shell.commandCenter.forward"),
        icon: direction === "back" ? "arrow-left" : "arrow-right",
        placeholder:
          direction === "back"
            ? t("shell.commandCenter.searchBack")
            : t("shell.commandCenter.searchForward"),
      };
      setSubmenuState((state) => pushCommandCenterSubmenu(state, descriptor));
      setQuery("");
      setActiveIndex(0);
    },
    [t],
  );

  const handleSelectAction = useCallback(
    (action: CommandCenterActionItem) => {
      if (action.disabled) {
        return;
      }
      if (action.historyDirection) {
        const next = historyItemsByDirection[action.historyDirection][0];
        if (next) {
          focusHistoryEntry(next.entry, next.index);
        }
        return;
      }
      if (action.actionId === "new-agent") {
        clearCommandCenterFocusRestoreElement();
        setOpen(false);
        void openProjectPicker();
        return;
      }
      if (action.actionId === "set-default-search-settings") {
        saveDefaults(sanitizeCommandCenterDefaults({ group: groupFilter, scope: resolvedScope }));
        setOpen(false);
        return;
      }
      if (action.route) {
        didNavigateRef.current = true;
        clearCommandCenterFocusRestoreElement();
        setOpen(false);
        router.push(action.route);
      }
    },
    [
      focusHistoryEntry,
      groupFilter,
      historyItemsByDirection,
      openProjectPicker,
      resolvedScope,
      saveDefaults,
      setOpen,
    ],
  );

  const handleSelectItem = useCallback(
    (item: CommandCenterItem) => {
      if (item.kind === "show-all") {
        setGroupFilter(item.showAllForGroup);
        setActiveIndex(0);
        return;
      }
      if (item.kind === "action") {
        handleSelectAction(item);
        return;
      }
      didNavigateRef.current = true;
      clearCommandCenterFocusRestoreElement();
      setOpen(false);
      if (item.kind === "agent") {
        navigateToAgent({
          serverId: item.agent.serverId,
          agentId: item.agent.id,
        });
        return;
      }
      if (item.kind === "window") {
        navigateToWorkspace(item.serverId, item.workspaceId, { openAttentionAgent: false });
        focusWorkspaceTab(item.workspaceKey, item.tab.tabId);
        return;
      }
      if (item.kind === "workspace") {
        navigateToWorkspace(item.serverId, item.workspaceId, { openAttentionAgent: false });
        return;
      }
      if (item.kind === "project") {
        router.push(buildProjectSettingsRoute(item.projectKey));
        return;
      }
      if (item.kind === "history") {
        focusHistoryEntry(item.entry, item.historyIndex);
      }
    },
    [focusHistoryEntry, focusWorkspaceTab, handleSelectAction, setOpen],
  );

  const handleAlternateItem = useCallback(
    (item: CommandCenterItem) => {
      if (item.kind === "workspace") {
        setScope({
          mode: "workspace",
          workspaceKey: item.workspaceKey,
          workspaceLabel: item.title,
        });
        setActiveIndex(0);
        return;
      }
      if (item.kind === "project") {
        setScope({
          mode: "project",
          projectKey: item.projectKey,
          projectLabel: item.title,
        });
        setActiveIndex(0);
        return;
      }
      if (item.kind === "action" && item.historyDirection && !item.disabled) {
        enterHistorySubmenu(item.historyDirection);
      }
    },
    [enterHistorySubmenu],
  );

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);

  useEffect(() => {
    handleSelectItemRef.current = handleSelectItem;
  }, [handleSelectItem]);

  useEffect(() => {
    handleAlternateItemRef.current = handleAlternateItem;
  }, [handleAlternateItem]);

  useEffect(() => {
    const prevOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) {
      setQuery("");
      setActiveIndex(0);
      setSubmenuState({ stack: [] });

      if (prevOpen && !didNavigateRef.current) {
        const el = takeCommandCenterFocusRestoreElement();
        const isFocused = () =>
          Boolean(el) && typeof document !== "undefined" && document.activeElement === el;

        const cancel = focusWithRetries({
          focus: () => el?.focus(),
          isFocused,
          onTimeout: () => {
            keyboardActionDispatcher.dispatch({
              id: "message-input.focus",
              scope: "message-input",
            });
          },
        });
        return cancel;
      }

      return;
    }

    didNavigateRef.current = false;
    setGroupFilter(defaults.group);
    setScope(createCommandCenterScopeFromDefaults(defaults));

    const id = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(id);
  }, [defaults, open]);

  useEffect(() => {
    if (!open) return;
    if (activeIndex >= items.length) {
      setActiveIndex(items.length > 0 ? items.length - 1 : 0);
    }
  }, [activeIndex, items.length, open]);

  const handleKeyEvent = useCallback(
    (key: string, options?: { shiftKey?: boolean }): boolean => {
      if (!open) return false;
      const currentItems = itemsRef.current;

      if (key === "Escape") {
        handleCloseRef.current();
        return true;
      }

      if (key === "Backspace" && activeSubmenu && query.length === 0) {
        setSubmenuState((state) => popCommandCenterSubmenu(state));
        setActiveIndex(0);
        return true;
      }

      if (key === "Tab") {
        if (options?.shiftKey) {
          setScope((current) => applyCommandCenterScopeCycle(current, 1));
        } else {
          setGroupFilter((current) => {
            const order: CommandCenterRootGroup[] = [
              "all",
              "actions",
              "agents",
              "windows",
              "workspaces",
              "projects",
            ];
            const index = Math.max(0, order.indexOf(current));
            return order[(index + 1) % order.length] ?? "all";
          });
        }
        setActiveIndex(0);
        return true;
      }

      if (key === "ArrowRight") {
        if (currentItems.length === 0) return false;
        const index = Math.max(0, Math.min(activeIndexRef.current, currentItems.length - 1));
        handleAlternateItemRef.current(currentItems[index]);
        return true;
      }

      if (key === "Enter") {
        if (currentItems.length === 0) return false;
        const index = Math.max(0, Math.min(activeIndexRef.current, currentItems.length - 1));
        handleSelectItemRef.current(currentItems[index]);
        return true;
      }

      if (key === "ArrowDown" || key === "ArrowUp") {
        if (currentItems.length === 0) return false;
        setActiveIndex((current) => {
          const delta = key === "ArrowDown" ? 1 : -1;
          const next = current + delta;
          if (next < 0) return currentItems.length - 1;
          if (next >= currentItems.length) return 0;
          return next;
        });
        return true;
      }

      return false;
    },
    [activeSubmenu, open, query.length],
  );

  useEffect(() => {
    if (!open || !isWeb) return;

    const handler = (event: KeyboardEvent) => {
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "ArrowRight" &&
        event.key !== "Enter" &&
        event.key !== "Escape" &&
        event.key !== "Tab" &&
        event.key !== "Backspace"
      ) {
        return;
      }
      if (handleKeyEvent(event.key, { shiftKey: event.shiftKey })) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, handleKeyEvent]);

  return {
    open,
    inputRef,
    query,
    setQuery,
    activeIndex,
    setActiveIndex,
    items,
    groups,
    filterPills,
    scopePills,
    groupFilter,
    setGroupFilter,
    scope: resolvedScope,
    setScope,
    activeSubmenu,
    placeholder: activeSubmenu?.placeholder ?? t("shell.commandCenter.placeholder"),
    handleClose,
    handleSelectItem,
    handleAlternateItem,
    handleKeyEvent,
  };
}
