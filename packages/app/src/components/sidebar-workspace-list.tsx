import {
  View,
  Text,
  Pressable,
  Platform,
  StatusBar,
  ScrollView,
  AccessibilityInfo,
  type GestureResponderEvent,
  type PointerEvent as RNPointerEvent,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import ReanimatedAnimated, {
  Easing as ReanimatedEasing,
  LinearTransition,
  useAnimatedStyle as useReanimatedAnimatedStyle,
  useSharedValue as useReanimatedSharedValue,
  withTiming as withReanimatedTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import equal from "fast-deep-equal";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { ProjectIconView } from "@/components/project-icon-view";
import { GitHubIcon } from "@/components/icons/github-icon";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import {
  memo,
  createElement,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  type ComponentProps,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type MutableRefObject,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";
import { router, usePathname, type Href } from "expo-router";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
  type ActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { type GestureType } from "react-native-gesture-handler";
import * as Clipboard from "expo-clipboard";
import { DiffStat } from "@/components/diff-stat";
import {
  Archive,
  ArrowLeftToLine,
  CalendarPlus,
  ArrowRightToLine,
  Bot,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  CopyX,
  ExternalLink,
  Folder,
  FolderGit2,
  GitPullRequest,
  MessageCircle,
  Monitor,
  Settings,
  MoreVertical,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  X,
} from "lucide-react-native";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { DraggableList, type DraggableRenderItemInfo } from "./draggable-list";
import type { DraggableListDragHandleProps } from "./draggable-list.types";
import { SortableInlineList } from "./sortable-inline-list";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useIsCompactFormFactor } from "@/constants/layout";
import {
  useProjectIconDataByProjectKey,
  useProjectIconPresentationByProjectKey,
  type ProjectIconRequestTarget,
} from "@/projects/project-icons";
import type { ProjectIconPresentation } from "@/hooks/use-project-icon-query";
import {
  buildNewWorkspaceRoute,
  buildProjectSettingsRoute,
  parseHostWorkspaceRouteFromPathname,
} from "@/utils/host-routes";
import {
  STATUS_BUCKET_LABELS,
  STATUS_BUCKET_ORDER,
  type StatusBucket,
} from "@/hooks/sidebar-status-view-model";
import { applySidebarShowLastCount } from "@/hooks/sidebar-workspaces-view-model";
import {
  useSidebarWorkspaceEntry,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import {
  useAppSettings,
  type AppTabLayoutMode,
  type WorkspaceTitleSource,
} from "@/hooks/use-settings";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { useSessionStore, type Agent } from "@/stores/session-store";
import {
  buildWorkspaceTabPersistenceKey,
  collectAllPanes,
  collectAllTabs,
  findMainPane,
  type SplitPane,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import {
  useSidebarViewStore,
  type SidebarBadgeMode,
  type SidebarEmbeddedTabSortMode,
  type SidebarEmbeddedRecentTabCount,
  type SidebarWorkspaceShowLastCount,
  type SidebarWorkspaceSortMode,
} from "@/stores/sidebar-view-store";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useDraftStore, type DraftInput } from "@/stores/draft-store";
import { useWorkspaceSetupStore } from "@/stores/workspace-setup-store";
import { useShowShortcutBadges } from "@/hooks/use-show-shortcut-badges";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  useContextMenu,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SyncedLoader } from "@/components/synced-loader";
import { useToast } from "@/contexts/toast-context";
import { type CheckoutGitAsyncActionId, useCheckoutGitActionsStore } from "@/git/actions-store";
import { toWorktreeArchiveRisk } from "@/git/worktree-archive-warning";
import { hasVisibleOrderChanged, mergeWithRemainder } from "@/utils/sidebar-reorder";
import { decideLongPressMove } from "@/utils/sidebar-gesture-arbitration";
import { confirmDialog } from "@/utils/confirm-dialog";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { shouldRenderSyncedStatusLoader } from "@/utils/status-loader";
import { shortenPath } from "@/utils/shorten-path";
import { isEmphasizedStatusDotBucket } from "@/utils/status-dot-color";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { SidebarStatusWorkspaceList } from "@/components/sidebar/sidebar-status-list";
import {
  SidebarWorkspaceTrailingActionBase,
  SidebarWorkspaceTrailingActionOverlay,
  SidebarWorkspaceRowFrame,
  SidebarWorkspaceRowContent,
  SidebarWorkspaceShortcutBadge,
  SidebarWorkspaceTrailingActionSlot,
} from "@/components/sidebar/sidebar-workspace-row-content";
import {
  SidebarVcOperationBadges,
  usePendingCheckoutBranchActionIds,
} from "@/components/sidebar/sidebar-vc-operation-badge";
import {
  SidebarEntryRowContent,
  SidebarEntryStatusBadges,
} from "@/components/sidebar/sidebar-entry-row";
import { SidebarEntryStatusExplainerRows } from "@/components/sidebar/sidebar-entry-status-explainer-rows";
import { SidebarShowAllToggle } from "@/components/sidebar/sidebar-show-all-toggle";
import { mergeEmbeddedVisibleTabOrder } from "@/components/sidebar/embedded-tabs-order";
import { buildStatusTabLine, type SidebarStatusTabLine } from "@/utils/sidebar-status-tab-line";
import {
  useProjectNamesMap,
  useStatusModeWorkspaceEntries,
} from "@/hooks/use-status-mode-workspaces";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoHoverCard } from "@/components/info-hover-card";
import { Shortcut } from "@/components/ui/shortcut";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useClearWorkspaceAttention } from "@/hooks/use-clear-workspace-attention";
import type { PrHint } from "@/git/use-pr-status-query";
import { buildSidebarProjectRowModel } from "@/utils/sidebar-project-row-model";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { openExternalUrl } from "@/utils/open-external-url";
import { requireWorkspaceDirectory, resolveWorkspaceDirectory } from "@/utils/workspace-directory";
import {
  getProjectAncestorHighlighted,
  getWorkspaceAncestorHighlighted,
  type SidebarRowHighlightState,
} from "@/utils/sidebar-active-ancestor-highlight";
import { findActiveSidebarWorkspaceRevealTarget } from "@/utils/sidebar-active-workspace-reveal";
import {
  getProjectStatusCountsFromStatuses,
  type SidebarProjectStatusCounts,
} from "@/utils/sidebar-single-project-view";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";
import { generateDraftId } from "@/stores/draft-keys";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import {
  buildTerminalsQueryKey,
  TERMINALS_QUERY_STALE_TIME,
  type ListTerminalsPayload,
} from "@/screens/workspace/terminals/state";
import {
  WorkspaceTabIcon,
  WorkspaceTabPresentationResolver,
} from "@/screens/workspace/workspace-tab-presentation";
import { useWorkspaceTabClose } from "@/screens/workspace/use-workspace-tab-close";
import {
  buildWorkspaceTabMenuEntries,
  type WorkspaceTabMenuEntry,
  type WorkspaceTabMenuLabels,
} from "@/screens/workspace/workspace-tab-menu";
import {
  buildBulkCloseConfirmationMessage,
  classifyBulkClosableTabs,
  closeBulkWorkspaceTabs,
  type BulkCloseConfirmationLabels,
} from "@/screens/workspace/workspace-bulk-close";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import {
  combineSidebarTabStatusSummaries,
  createEmptySidebarTabStatusSummary,
  getPrimarySidebarEntryStatusKind,
  summarizeSidebarTabs,
  type SidebarEntryStatusKind,
  type SidebarTabStatusSummary,
  type SidebarTerminalStatusRecord,
} from "@/utils/sidebar-tab-status-summary";
import {
  getWorkspaceRowRightVisibility,
  type WorkspaceRowRightVisibility,
} from "@/components/sidebar/sidebar-workspace-row-visibility";
import {
  buildSidebarEmbeddedTabTreeRows,
  type SidebarEmbeddedTabTreeRow,
} from "@/utils/sidebar-embedded-tab-tree";
import { sortSidebarTabItems } from "@/utils/sidebar-tab-sort";
import type { SidebarTabSortItem } from "@/utils/sidebar-tab-sort";
import {
  isWeb as platformIsWeb,
  isNative as platformIsNative,
  getIsElectron,
} from "@/constants/platform";
import { buildProviderCommand } from "@/utils/provider-command-templates";
import { getDesktopHost } from "@/desktop/host";
import type { StreamItem } from "@/types/stream";
import { formatAbsoluteDateTime, formatRecentOrAbsoluteDateTime } from "@/utils/time";
import { useStoreWithEqualityFn } from "zustand/traditional";

const workspaceKeyExtractor = (workspace: SidebarWorkspaceEntry) => workspace.workspaceKey;

const projectKeyExtractor = (project: SidebarProjectEntry) => project.projectKey;

const WORKSPACE_STATUS_DOT_WIDTH = 14;
const DEFAULT_STATUS_DOT_SIZE = 7;
const EMPHASIZED_STATUS_DOT_SIZE = 9;
const DEFAULT_STATUS_DOT_OFFSET = 0;
const EMPHASIZED_STATUS_DOT_OFFSET = -1;
const EMPTY_AGENT_MAP = new Map<string, Agent>();
const EMPTY_TAB_STATUS_SUMMARY = createEmptySidebarTabStatusSummary();
const WORKSPACE_PROJECT_STATUS_EXCLUDED_KINDS = [
  "draft",
] as const satisfies readonly SidebarEntryStatusKind[];
const PROJECT_SELECTOR_TRANSITION_MS = 360;
const PROJECT_SELECTOR_IDLE_SIZE = 28;
const PROJECT_SELECTOR_SELECTED_SIZE = 36;
const PROJECT_SELECTOR_IDLE_PADDING_HORIZONTAL = 4;
const PROJECT_SELECTOR_SELECTED_PADDING_HORIZONTAL = 6;
const PROJECT_SELECTOR_IDLE_MARGIN_BOTTOM = 4;
const PROJECT_SELECTOR_SELECTED_MARGIN_BOTTOM = 0;
const PROJECT_SELECTOR_LAYOUT_TRANSITION = LinearTransition.duration(
  PROJECT_SELECTOR_TRANSITION_MS,
).easing(ReanimatedEasing.out(ReanimatedEasing.cubic));
const EMPTY_PROJECT_ICON_PRESENTATION: ProjectIconPresentation = {
  dataUri: null,
  backgroundColor: null,
};
const EMBEDDED_TAB_ROW_HEIGHT = 36;
const EMBEDDED_TAB_PROJECT_LINE_ROW_HEIGHT = 46;
const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const ThemedGitHubIcon = withUnistyles(GitHubIcon);
const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedCircleX = withUnistyles(CircleX);
const ThemedSyncedLoader = withUnistyles(SyncedLoader);
const ThemedPlus = withUnistyles(Plus);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedX = withUnistyles(X);
const ThemedBot = withUnistyles(Bot);
const ThemedCalendarPlus = withUnistyles(CalendarPlus);
const ThemedClock3 = withUnistyles(Clock3);
const ThemedFolder = withUnistyles(Folder);
const ThemedFolderGit2 = withUnistyles(FolderGit2);
const ThemedMessageCircle = withUnistyles(MessageCircle);
const ThemedMonitor = withUnistyles(Monitor);

interface EmbeddedSidebarTabItem {
  descriptor: WorkspaceTabDescriptor;
  tab: WorkspaceTab;
  paneId: string;
  mainPane: boolean;
  forceShown: boolean;
}

type EmbeddedTabProjectLine = SidebarStatusTabLine;

interface StatusTabWorkspaceRow {
  project: SidebarProjectEntry;
  workspace: SidebarWorkspaceEntry;
}

interface StatusTabWorkspaceGroup {
  bucket: StatusBucket;
  rows: StatusTabWorkspaceRow[];
}

interface StatusTabWorkspaceCandidate extends SidebarTabSortItem {
  bucket: StatusBucket;
  project: SidebarProjectEntry;
  workspace: SidebarWorkspaceEntry;
  statusSummary: SidebarTabStatusSummary;
}

function createProjectIconTargets(
  serverId: string | null,
  projects: readonly SidebarProjectEntry[],
): ProjectIconRequestTarget[] {
  if (!serverId) {
    return [];
  }
  return projects.map((project) => ({
    serverId,
    projectKey: project.projectKey,
    iconWorkingDir: project.iconWorkingDir,
  }));
}

interface WorkspaceTabsForSummary {
  workspace: SidebarWorkspaceEntry;
  tabs: WorkspaceTab[];
}

interface TerminalQueryRequest {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  workspaceDirectory: string;
}

function useSidebarTabStatusSummaries(input: {
  workspaces: readonly SidebarWorkspaceEntry[];
  enabled: boolean;
}): Map<string, SidebarTabStatusSummary> {
  const serverId = input.workspaces[0]?.serverId ?? null;
  const layoutByWorkspace = useWorkspaceLayoutStore((state) => state.layoutByWorkspace);
  const agents = useSessionStore((state) =>
    serverId ? (state.sessions[serverId]?.agents ?? null) : null,
  );
  const queuedMessages = useSessionStore((state) =>
    serverId ? (state.sessions[serverId]?.queuedMessages ?? null) : null,
  );
  const client = useSessionStore((state) =>
    serverId ? (state.sessions[serverId]?.client ?? null) : null,
  );
  const pendingCreatesByDraftId = useCreateFlowStore((state) => state.pendingByDraftId);
  const setupSnapshots = useWorkspaceSetupStore((state) => state.snapshots);
  const browsersById = useBrowserStore((state) => state.browsersById);
  const draftRecords = useDraftStore((state) => state.drafts);
  const draftInputsByKey = useMemo<Record<string, DraftInput>>(() => {
    const inputs: Record<string, DraftInput> = {};
    for (const [key, record] of Object.entries(draftRecords)) {
      if (record.lifecycle !== "active") {
        continue;
      }
      inputs[key] = record.input;
    }
    return inputs;
  }, [draftRecords]);

  const workspaceTabs = useMemo<WorkspaceTabsForSummary[]>(() => {
    if (!input.enabled) {
      return [];
    }
    return input.workspaces.map((workspace) => {
      const persistenceKey = buildWorkspaceTabPersistenceKey({
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
      });
      const layout = persistenceKey ? (layoutByWorkspace[persistenceKey] ?? null) : null;
      return {
        workspace,
        tabs: layout ? collectAllTabs(layout.root) : [],
      };
    });
  }, [input.enabled, input.workspaces, layoutByWorkspace]);

  const terminalRequests = useMemo<TerminalQueryRequest[]>(() => {
    const requests: TerminalQueryRequest[] = [];
    for (const entry of workspaceTabs) {
      const workspaceDirectory = resolveWorkspaceDirectory({
        workspaceDirectory: entry.workspace.workspaceDirectory,
      });
      if (!workspaceDirectory) {
        continue;
      }
      const hasTerminalTab = entry.tabs.some((tab) => tab.target.kind === "terminal");
      if (!hasTerminalTab) {
        continue;
      }
      requests.push({
        workspaceKey: entry.workspace.workspaceKey,
        serverId: entry.workspace.serverId,
        workspaceId: entry.workspace.workspaceId,
        workspaceDirectory,
      });
    }
    return requests;
  }, [workspaceTabs]);

  const terminalQueries = useQueries({
    queries: terminalRequests.map((request) => ({
      queryKey: buildTerminalsQueryKey(
        request.serverId,
        request.workspaceDirectory,
        request.workspaceId,
      ),
      enabled: input.enabled && Boolean(client),
      queryFn: async (): Promise<ListTerminalsPayload> => {
        if (!client) {
          throw new Error("Host disconnected");
        }
        return client.listTerminals(request.workspaceDirectory, undefined, {
          workspaceId: request.workspaceId,
        });
      },
      staleTime: TERMINALS_QUERY_STALE_TIME,
    })),
  });

  const terminalsByWorkspaceKey = useMemo(() => {
    const byWorkspaceKey = new Map<string, Map<string, SidebarTerminalStatusRecord>>();
    for (let index = 0; index < terminalRequests.length; index += 1) {
      const request = terminalRequests[index];
      const query = terminalQueries[index];
      if (!request || !query?.data) {
        continue;
      }
      byWorkspaceKey.set(
        request.workspaceKey,
        new Map(
          query.data.terminals.map((terminal) => [
            terminal.id,
            { id: terminal.id, activity: terminal.activity ?? null },
          ]),
        ),
      );
    }
    return byWorkspaceKey;
  }, [terminalQueries, terminalRequests]);

  return useMemo(() => {
    const summaries = new Map<string, SidebarTabStatusSummary>();
    for (const entry of workspaceTabs) {
      summaries.set(
        entry.workspace.workspaceKey,
        summarizeSidebarTabs({
          tabs: entry.tabs,
          serverId: entry.workspace.serverId,
          workspaceId: entry.workspace.workspaceId,
          agents,
          pendingCreatesByDraftId,
          setupSnapshots,
          browsersById,
          terminalsById: terminalsByWorkspaceKey.get(entry.workspace.workspaceKey) ?? new Map(),
          draftInputsByKey,
          queuedMessageCountsByAgentId: queuedMessages
            ? new Map(
                Array.from(queuedMessages.entries()).map(([agentId, queue]) => [
                  agentId,
                  queue.length,
                ]),
              )
            : undefined,
        }),
      );
    }
    return summaries;
  }, [
    agents,
    browsersById,
    draftInputsByKey,
    pendingCreatesByDraftId,
    queuedMessages,
    setupSnapshots,
    terminalsByWorkspaceKey,
    workspaceTabs,
  ]);
}

function resolveStatusBucketFromTabSummary(summary: SidebarTabStatusSummary): StatusBucket {
  for (const bucket of STATUS_BUCKET_ORDER) {
    if (summary.counts[bucket] > 0) {
      return bucket;
    }
  }
  return "done";
}

function useSidebarStatusTabWorkspaceGroups(input: {
  projects: readonly SidebarProjectEntry[];
  serverId: string | null;
}): StatusTabWorkspaceGroup[] {
  const layoutByWorkspace = useWorkspaceLayoutStore((state) => state.layoutByWorkspace);
  const agents = useSessionStore((state) =>
    input.serverId ? (state.sessions[input.serverId]?.agents ?? null) : null,
  );
  const queuedMessages = useSessionStore((state) =>
    input.serverId ? (state.sessions[input.serverId]?.queuedMessages ?? null) : null,
  );
  const pendingCreatesByDraftId = useCreateFlowStore((state) => state.pendingByDraftId);
  const setupSnapshots = useWorkspaceSetupStore((state) => state.snapshots);
  const browsersById = useBrowserStore((state) => state.browsersById);
  const draftRecords = useDraftStore((state) => state.drafts);
  const tabSortMode = useSidebarViewStore((state) =>
    input.serverId ? state.getEmbeddedTabSortMode(input.serverId) : "manual",
  );
  const expandedParentTabKeys = useSidebarCollapsedSectionsStore(
    (state) => state.expandedParentTabKeys,
  );
  const draftInputsByKey = useMemo<Record<string, DraftInput>>(() => {
    const inputs: Record<string, DraftInput> = {};
    for (const [key, record] of Object.entries(draftRecords)) {
      if (record.lifecycle === "active") {
        inputs[key] = record.input;
      }
    }
    return inputs;
  }, [draftRecords]);
  const queuedMessageCountsByAgentId = useMemo(
    () =>
      queuedMessages
        ? new Map(
            Array.from(queuedMessages.entries()).map(([agentId, queue]) => [agentId, queue.length]),
          )
        : undefined,
    [queuedMessages],
  );
  const emptyTerminalsById = useMemo(() => new Map<string, SidebarTerminalStatusRecord>(), []);

  return useMemo(() => {
    const candidatesByBucket = new Map<StatusBucket, StatusTabWorkspaceCandidate[]>();
    const agentMap = agents ?? EMPTY_AGENT_MAP;
    for (const project of input.projects) {
      for (const workspace of project.workspaces) {
        const persistenceKey = buildWorkspaceTabPersistenceKey({
          serverId: workspace.serverId,
          workspaceId: workspace.workspaceId,
        });
        const workspaceLayout = persistenceKey ? (layoutByWorkspace[persistenceKey] ?? null) : null;
        if (!workspaceLayout) {
          continue;
        }
        const uiTabs = collectAllTabs(workspaceLayout.root);
        const mainPane = findMainPane(workspaceLayout.root);
        const panes = collectAllPanes(workspaceLayout.root);
        const allItems = buildEmbeddedSidebarTabItems({
          mainPane,
          panes,
          uiTabs,
          agents: agentMap,
        });
        const statusSummariesByTabId = new Map<string, SidebarTabStatusSummary>();
        for (const item of allItems) {
          statusSummariesByTabId.set(
            item.tab.tabId,
            summarizeSidebarTabs({
              tabs: [item.tab],
              serverId: workspace.serverId,
              workspaceId: workspace.workspaceId,
              agents: agentMap,
              pendingCreatesByDraftId,
              setupSnapshots,
              browsersById,
              terminalsById: emptyTerminalsById,
              draftInputsByKey,
              queuedMessageCountsByAgentId,
            }),
          );
        }
        const sortedItems = sortSidebarTabItems({
          items: allItems,
          sortMode: tabSortMode,
          agents: agentMap,
          statusSummariesByTabId,
        });
        const treeRows = buildSidebarEmbeddedTabTreeRows({
          workspaceKey: workspace.workspaceKey,
          items: sortedItems,
          parentTabIdByTabId: workspaceLayout.parentTabIdByTabId ?? null,
          expandedParentTabKeys,
          statusSummariesByTabId,
        });
        for (const row of treeRows) {
          const bucket = resolveStatusBucketFromTabSummary(row.statusSummary);
          const candidates = candidatesByBucket.get(bucket) ?? [];
          candidates.push({
            bucket,
            project,
            workspace,
            tab: row.item.tab,
            statusSummary: row.statusSummary,
          });
          candidatesByBucket.set(bucket, candidates);
        }
      }
    }
    return STATUS_BUCKET_ORDER.flatMap((bucket) => {
      const candidates = candidatesByBucket.get(bucket);
      if (!candidates || candidates.length === 0) {
        return [];
      }
      const orderedCandidates = sortSidebarStatusTabWorkspaceCandidates({
        candidates,
        sortMode: tabSortMode,
        agents: agentMap,
        statusSummariesByTabId: new Map(
          candidates.map((candidate) => [candidate.tab.tabId, candidate.statusSummary]),
        ),
      });
      return [
        {
          bucket,
          rows: uniqueStatusTabWorkspaceRows(orderedCandidates),
        },
      ];
    });
  }, [
    agents,
    browsersById,
    draftInputsByKey,
    emptyTerminalsById,
    expandedParentTabKeys,
    input.projects,
    layoutByWorkspace,
    pendingCreatesByDraftId,
    queuedMessageCountsByAgentId,
    setupSnapshots,
    tabSortMode,
  ]);
}

function sortSidebarStatusTabWorkspaceCandidates(input: {
  candidates: StatusTabWorkspaceCandidate[];
  sortMode: SidebarEmbeddedTabSortMode;
  agents: ReadonlyMap<string, Agent> | null;
  statusSummariesByTabId: ReadonlyMap<string, SidebarTabStatusSummary>;
}): StatusTabWorkspaceCandidate[] {
  if (input.sortMode === "manual") {
    return input.candidates;
  }
  return sortSidebarTabItems({
    items: input.candidates,
    sortMode: input.sortMode,
    agents: input.agents,
    statusSummariesByTabId: input.statusSummariesByTabId,
  });
}

function uniqueStatusTabWorkspaceRows(
  candidates: readonly StatusTabWorkspaceCandidate[],
): StatusTabWorkspaceRow[] {
  const rows: StatusTabWorkspaceRow[] = [];
  const seenWorkspaceKeys = new Set<string>();
  for (const candidate of candidates) {
    if (seenWorkspaceKeys.has(candidate.workspace.workspaceKey)) {
      continue;
    }
    seenWorkspaceKeys.add(candidate.workspace.workspaceKey);
    rows.push({
      project: candidate.project,
      workspace: candidate.workspace,
    });
  }
  return rows;
}

function isTabForceShown(input: {
  tab: WorkspaceTab;
  activeTabId: string | null;
  agents: ReadonlyMap<string, Agent>;
}): boolean {
  if (input.tab.tabId === input.activeTabId) {
    return true;
  }
  const agent =
    input.tab.target.kind === "agent" ? (input.agents.get(input.tab.target.agentId) ?? null) : null;
  if (!agent) {
    return false;
  }
  return (
    agent.requiresAttention === true ||
    agent.pendingPermissions.length > 0 ||
    agent.status === "initializing" ||
    agent.status === "running"
  );
}

function buildEmbeddedSidebarTabItems(input: {
  mainPane: SplitPane | null;
  panes: readonly SplitPane[];
  uiTabs: WorkspaceTab[];
  agents: ReadonlyMap<string, Agent>;
}): EmbeddedSidebarTabItem[] {
  const paneState = deriveWorkspacePaneState({
    pane: input.mainPane,
    tabs: input.uiTabs,
  });
  const tabById = new Map(input.uiTabs.map((tab) => [tab.tabId, tab]));
  const mainPaneItems = paneState.tabs.flatMap((entry) => {
    const tab = tabById.get(entry.descriptor.tabId);
    if (!tab) {
      return [];
    }
    return [
      {
        descriptor: entry.descriptor,
        tab,
        paneId: input.mainPane?.id ?? "",
        mainPane: true,
        forceShown: isTabForceShown({
          tab,
          activeTabId: paneState.activeTabId,
          agents: input.agents,
        }),
      },
    ];
  });
  const secondaryPaneItems = input.panes.flatMap((pane) => {
    if (!input.mainPane || pane.id === input.mainPane.id) {
      return [];
    }
    const secondaryPaneState = deriveWorkspacePaneState({
      pane,
      tabs: input.uiTabs,
    });
    const activeTab = secondaryPaneState.activeTab;
    if (!activeTab) {
      return [];
    }
    const tab = tabById.get(activeTab.descriptor.tabId);
    if (!tab) {
      return [];
    }
    return [
      {
        descriptor: activeTab.descriptor,
        tab,
        paneId: pane.id,
        mainPane: false,
        forceShown: true,
      },
    ];
  });
  return [...mainPaneItems, ...secondaryPaneItems];
}

function filterEmbeddedTabRowsByStatus(input: {
  rows: SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>[];
  statusBucketFilter: StatusBucket | null;
}): SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>[] {
  if (!input.statusBucketFilter) {
    return input.rows;
  }
  return input.rows.filter(
    (row) => resolveStatusBucketFromTabSummary(row.statusSummary) === input.statusBucketFilter,
  );
}

function useVisibleEmbeddedTabRows(input: {
  rows: SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>[];
  recentTabCount: SidebarEmbeddedRecentTabCount;
  showAllTabs: boolean;
  limitRecentTabs: boolean;
}): {
  visibleRows: SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>[];
  shouldShowVisibilityToggle: boolean;
} {
  const recentVisibleRows = useMemo(
    () =>
      applyRecentTreeRowCount({
        rows: input.rows,
        recentCount: input.recentTabCount,
      }),
    [input.recentTabCount, input.rows],
  );
  const hiddenTabCount = Math.max(0, input.rows.length - recentVisibleRows.length);
  const shouldShowVisibilityToggle =
    input.limitRecentTabs && input.recentTabCount !== "all" && hiddenTabCount > 0;
  const visibleRows = !input.limitRecentTabs || input.showAllTabs ? input.rows : recentVisibleRows;
  return { visibleRows, shouldShowVisibilityToggle };
}

function shouldEnableEmbeddedTabManualSort(input: {
  statusBucketFilter: StatusBucket | null;
  tabSortMode: SidebarEmbeddedTabSortMode;
}): boolean {
  return input.statusBucketFilter === null && input.tabSortMode === "manual";
}

interface SidebarEmbeddedTabHoverInfo {
  createdAt: Date | null;
  updatedAt: Date | null;
  initialUserMessage: string | null;
  userInputMessageCount: number | null;
}

function getUserInputMessageSummary(items: readonly StreamItem[]): {
  initialUserMessage: string | null;
  count: number;
} {
  let initialUserMessage: string | null = null;
  let count = 0;
  for (const item of items) {
    if (item.kind === "user_message") {
      count += 1;
      if (!initialUserMessage) {
        const text = item.text.trim();
        if (text) {
          initialUserMessage = text;
        }
      }
    }
  }
  return { initialUserMessage, count };
}

function useSidebarEmbeddedTabHoverInfo({
  serverId,
  tab,
}: {
  serverId: string;
  tab: WorkspaceTabDescriptor;
}): SidebarEmbeddedTabHoverInfo {
  const agentId = tab.target.kind === "agent" ? tab.target.agentId : null;
  return useStoreWithEqualityFn(
    useSessionStore,
    useCallback(
      (state) => {
        const tabCreatedAt = tab.createdAt ? new Date(tab.createdAt) : null;
        if (!agentId) {
          return {
            createdAt: tabCreatedAt,
            updatedAt: null,
            initialUserMessage: null,
            userInputMessageCount: null,
          };
        }

        const session = state.sessions[serverId];
        const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId) ?? null;
        const tail = session?.agentStreamTail.get(agentId) ?? [];
        const head = session?.agentStreamHead.get(agentId) ?? [];
        const userInputMessageSummary = getUserInputMessageSummary([...head, ...tail]);
        return {
          createdAt: agent?.createdAt ?? tabCreatedAt,
          updatedAt: agent?.updatedAt ?? null,
          initialUserMessage: userInputMessageSummary.initialUserMessage,
          userInputMessageCount: userInputMessageSummary.count,
        };
      },
      [agentId, serverId, tab.createdAt],
    ),
    equal,
  );
}

function applyRecentTreeRowCount(input: {
  rows: SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>[];
  recentCount: SidebarEmbeddedRecentTabCount;
}): SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>[] {
  if (input.recentCount === "all") {
    return input.rows;
  }
  const visible = input.rows.slice(0, input.recentCount);
  const visibleIds = new Set(visible.map((row) => row.item.tab.tabId));
  for (const row of input.rows) {
    if (!row.item.forceShown || visibleIds.has(row.item.tab.tabId)) {
      continue;
    }
    visible.push(row);
    visibleIds.add(row.item.tab.tabId);
  }
  return visible;
}
const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedTrash2 = withUnistyles(Trash2);
const ThemedSettings = withUnistyles(Settings);
const ThemedCopy = withUnistyles(Copy);
const ThemedCopyX = withUnistyles(CopyX);
const ThemedArchive = withUnistyles(Archive);
const ThemedPencil = withUnistyles(Pencil);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedArrowLeftToLine = withUnistyles(ArrowLeftToLine);
const ThemedArrowRightToLine = withUnistyles(ArrowRightToLine);

const foregroundColorMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
});
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const redColorMapping = (theme: Theme) => ({
  color: theme.colors.palette.red[500],
});
const amberColorMapping = (theme: Theme) => ({
  color: theme.colors.palette.amber[500],
});
const greenColorMapping = (theme: Theme) => ({
  color: theme.colors.palette.green[500],
});
const blueColorMapping = (theme: Theme) => ({
  color: theme.colors.palette.blue[500],
});
const purpleColorMapping = (theme: Theme) => ({
  color: theme.colors.palette.purple[500],
});
const syncedLoaderColorMapping = (theme: Theme) => ({
  color: theme.colors.palette.blue[500],
});

function getPrIconUniMapping(state: PrHint["state"]) {
  switch (state) {
    case "merged":
      return purpleColorMapping;
    case "open":
      return greenColorMapping;
    case "closed":
      return redColorMapping;
  }
}

function isWorkspaceSelected(input: {
  selection: ActiveWorkspaceSelection | null;
  serverId: string | null;
  workspaceId: string;
  enabled: boolean;
}): boolean {
  return (
    input.enabled &&
    input.selection?.serverId === input.serverId &&
    input.selection.workspaceId === input.workspaceId
  );
}

function isProjectSelectedByRoute(input: {
  selection: ActiveWorkspaceSelection | null;
  project: SidebarProjectEntry;
  serverId: string | null;
  enabled: boolean;
}): boolean {
  return (
    input.enabled &&
    input.selection?.serverId === input.serverId &&
    input.project.workspaces.some(
      (workspace) => workspace.workspaceId === input.selection?.workspaceId,
    )
  );
}

function activeWorkspaceSelectionKey(selection: ActiveWorkspaceSelection | null): string {
  return selection ? `${selection.serverId}:${selection.workspaceId}` : "";
}

function getSelectedProjectKey(input: {
  projects: readonly SidebarProjectEntry[];
  selection: ActiveWorkspaceSelection | null;
  serverId: string | null;
  selectionEnabled: boolean;
}): string | null {
  if (!input.selectionEnabled || !input.serverId || input.selection?.serverId !== input.serverId) {
    return null;
  }
  const selectedWorkspaceId = input.selection.workspaceId;
  const selectedProject = input.projects.find((project) =>
    project.workspaces.some((workspace) => workspace.workspaceId === selectedWorkspaceId),
  );
  return selectedProject?.projectKey ?? null;
}

function getSelectedWorkspaceKey(input: {
  project: SidebarProjectEntry;
  selection: ActiveWorkspaceSelection | null;
  serverId: string | null;
  selectionEnabled: boolean;
}): string | null {
  if (!input.selectionEnabled || !input.serverId || input.selection?.serverId !== input.serverId) {
    return null;
  }
  const selectedWorkspace = input.project.workspaces.find(
    (workspace) => workspace.workspaceId === input.selection?.workspaceId,
  );
  return selectedWorkspace?.workspaceKey ?? null;
}

function selectionForSelectedWorkspace(
  selected: boolean,
  workspace: SidebarWorkspaceEntry,
): ActiveWorkspaceSelection | null {
  return selected ? { serverId: workspace.serverId, workspaceId: workspace.workspaceId } : null;
}

function isShiftPressed(event: GestureResponderEvent): boolean {
  if (!("shiftKey" in event.nativeEvent)) {
    return false;
  }
  return event.nativeEvent.shiftKey === true;
}

interface SidebarWorkspaceListProps {
  projects: SidebarProjectEntry[];
  serverId: string | null;
  collapsedProjectKeys: ReadonlySet<string>;
  onToggleProjectCollapsed: (projectKey: string) => void;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  groupMode: "project" | "status";
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onWorkspacePress?: () => void;
  onAddProject?: () => void;
  listFooterComponent?: ReactElement | null;
  singleProjectViewEnabled?: boolean;
  singleProjectViewProject?: SidebarProjectEntry | null;
  onSingleProjectSelected?: (projectKey: string) => void;
  /** Gesture ref for coordinating with parent gestures (e.g., sidebar close) */
  parentGestureRef?: MutableRefObject<GestureType | undefined>;
}

interface ProjectHeaderRowProps {
  project: SidebarProjectEntry;
  displayName: string;
  iconDataUri: string | null;
  workspaceCount: number;
  agentCount: number;
  workspace: SidebarWorkspaceEntry | null;
  statusSummary?: SidebarTabStatusSummary | null;
  showStatusSummary?: boolean;
  leadingStatusKind?: SidebarEntryStatusKind | null;
  highlightState?: SidebarRowHighlightState;
  chevron: "expand" | "collapse" | null;
  onPress: (event: GestureResponderEvent) => void;
  serverId: string | null;
  canCreateWorktree: boolean;
  isProjectActive?: boolean;
  onWorkspacePress?: () => void;
  onWorktreeCreated?: (workspaceId: string) => void;
  shortcutNumber?: number | null;
  showShortcutBadge?: boolean;
  drag: () => void;
  isDragging: boolean;
  isArchiving?: boolean;
  menuController: ReturnType<typeof useContextMenu> | null;
  onRemoveProject?: () => void;
  removeProjectStatus?: "idle" | "pending";
  dragHandleProps?: DraggableListDragHandleProps;
}

interface WorkspaceRowInnerProps {
  workspace: SidebarWorkspaceEntry;
  badgeMode: SidebarBadgeMode;
  tabStatusSummary: SidebarTabStatusSummary;
  workspaceTitleSource: WorkspaceTitleSource;
  highlightState: SidebarRowHighlightState;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  onPress: (event: GestureResponderEvent) => void;
  drag: () => void;
  isDragging: boolean;
  isArchiving: boolean;
  isCreating?: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  menuController: ReturnType<typeof useContextMenu> | null;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  onArchive?: () => void;
  onCreateTab?: (event?: GestureResponderEvent) => void;
  onCopyBranchName?: () => void;
  onCopyPath?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpanded?: (event: GestureResponderEvent) => void;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  statusSummaryToggleActive?: boolean;
  onStatusSummaryPress?: (event: GestureResponderEvent) => void;
}

function getWorkspaceArchiveStatus(
  isWorktree: boolean,
  archiveStatus: "idle" | "pending" | "success",
  isArchivingWorkspace: boolean,
): "idle" | "pending" | "success" {
  if (isWorktree) return archiveStatus;
  if (isArchivingWorkspace) return "pending";
  return "idle";
}

export function PrBadge({ hint }: { hint: PrHint }) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      void openExternalUrl(hint.url);
    },
    [hint.url],
  );

  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);

  const textStyle = isHovered ? prBadgeTextHoveredCombined : prBadgeStyles.text;
  const iconUniProps = isHovered ? foregroundColorMapping : getPrIconUniMapping(hint.state);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t("workspace.git.pr.accessibility.pullRequest", {
        number: hint.number,
      })}
      hitSlop={4}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={prBadgePressableStyle}
    >
      {isHovered ? (
        <ThemedExternalLink size={12} uniProps={iconUniProps} />
      ) : (
        <ThemedGitPullRequest size={12} uniProps={iconUniProps} />
      )}
      <Text style={textStyle} numberOfLines={1}>
        {hint.number}
      </Text>
    </Pressable>
  );
}

function ChecksBadge({ checks }: { checks: PrHint["checks"] }) {
  if (!checks || checks.length === 0) return null;
  const failed = checks.filter((check) => check.status === "failure").length;
  if (failed === 0) return null;
  return (
    <View style={checksBadgeStyles.badge}>
      <ThemedGitHubIcon size={10} uniProps={redColorMapping} />
      <Text style={checksBadgeStyles.text}>{failed} failed</Text>
    </View>
  );
}

function prBadgePressableStyle({ pressed }: PressableStateCallbackType) {
  return [prBadgeStyles.badge, pressed && prBadgeStyles.badgePressed];
}

function projectKebabStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.projectKebabButton, hovered && styles.projectKebabButtonHovered];
}

function workspaceKebabStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.kebabButton, hovered && styles.kebabButtonHovered];
}

function newWorkspaceTabButtonStyle({
  hovered = false,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.workspaceIconButton, (hovered || pressed) && styles.workspaceIconButtonHovered];
}

function embeddedTabCloseButtonStyle({
  hovered = false,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.embeddedTabCloseButton,
    (hovered || pressed) && styles.embeddedTabCloseButtonHovered,
  ];
}

function getProjectWorkspaceRowStyle({
  embeddedTabsEnabled = false,
  isDragging,
  highlightState,
  isHovered,
}: {
  embeddedTabsEnabled?: boolean;
  isDragging: boolean;
  highlightState: SidebarRowHighlightState;
  isHovered: boolean;
}) {
  return [
    styles.workspaceRow,
    embeddedTabsEnabled && styles.workspaceRowEmbeddedTabs,
    isDragging && styles.workspaceRowDragging,
    getSidebarRowHighlightStyle(highlightState),
    isHovered && styles.workspaceRowHovered,
  ];
}

function noop() {}

function getSidebarRowHighlightStyle(highlightState: SidebarRowHighlightState) {
  switch (highlightState) {
    case "selected":
      return styles.sidebarRowSelected;
    case "active":
      return styles.sidebarRowActive;
    case "idle":
      return null;
  }
}

const prBadgeStyles = StyleSheet.create((theme) => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  badgePressed: {
    opacity: 0.82,
  },
  text: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 14,
    color: theme.colors.foregroundMuted,
  },
  textHovered: {
    color: theme.colors.foreground,
  },
}));

const checksBadgeStyles = StyleSheet.create((theme) => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  text: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 14,
    color: theme.colors.palette.red[500],
  },
}));

const prBadgeTextHoveredCombined = [prBadgeStyles.text, prBadgeStyles.textHovered];

function StatusDotOverlay({
  dotColorStyle,
  size,
  offset,
}: {
  dotColorStyle: ViewStyle;
  size: number;
  offset: number;
}) {
  const overlayStyle = useMemo(
    () => [
      styles.statusDotOverlay,
      dotColorStyle,
      {
        width: size,
        height: size,
        right: offset,
        bottom: offset,
      },
    ],
    [dotColorStyle, size, offset],
  );
  return <View style={overlayStyle} />;
}

function ProjectLeadingVisual({
  displayName,
  iconDataUri,
  workspace,
  projectKey,
  isArchiving = false,
  suppressWorkspaceStatusVisual = false,
  chevron = null,
  isHovered = false,
}: {
  displayName: string;
  iconDataUri: string | null;
  workspace: SidebarWorkspaceEntry | null;
  projectKey: string;
  isArchiving?: boolean;
  suppressWorkspaceStatusVisual?: boolean;
  chevron?: "expand" | "collapse" | null;
  isHovered?: boolean;
}) {
  const placeholderLabel = projectIconPlaceholderLabelFromDisplayName(displayName);
  const placeholderInitial = placeholderLabel.charAt(0).toUpperCase();
  const activeWorkspace = workspace;
  if (suppressWorkspaceStatusVisual || !activeWorkspace) {
    return (
      <ProjectLeadingVisualSlot chevron={chevron} isHovered={isHovered}>
        <ProjectIcon
          iconDataUri={iconDataUri}
          placeholderInitial={placeholderInitial}
          projectKey={projectKey}
        />
      </ProjectLeadingVisualSlot>
    );
  }
  const shouldShowWorkspaceStatus =
    activeWorkspace !== null && (isArchiving || activeWorkspace.statusBucket !== "done");
  const shouldShowSyncedLoader = activeWorkspace
    ? shouldRenderSyncedStatusLoader({ bucket: activeWorkspace.statusBucket })
    : false;

  if (!shouldShowWorkspaceStatus) {
    return (
      <ProjectLeadingVisualSlot chevron={chevron} isHovered={isHovered}>
        <ProjectIcon
          iconDataUri={iconDataUri}
          placeholderInitial={placeholderInitial}
          projectKey={projectKey}
        />
      </ProjectLeadingVisualSlot>
    );
  }

  return (
    <ProjectLeadingVisualStatus
      iconDataUri={iconDataUri}
      placeholderInitial={placeholderInitial}
      projectKey={projectKey}
      isArchiving={isArchiving}
      shouldShowSyncedLoader={shouldShowSyncedLoader}
      activeWorkspace={activeWorkspace}
      chevron={chevron}
      isHovered={isHovered}
    />
  );
}

function ProjectRowTrailingActions({
  project,
  displayName,
  canCreateWorktree,
  isProjectActive,
  onBeginWorkspaceSetup,
  onRemoveProject,
  removeProjectStatus,
}: {
  project: SidebarProjectEntry;
  displayName: string;
  canCreateWorktree: boolean;
  isProjectActive: boolean;
  onBeginWorkspaceSetup: () => void;
  onRemoveProject?: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
}) {
  return (
    <View style={styles.projectTrailingActions}>
      {canCreateWorktree ? (
        <NewWorktreeButton
          displayName={displayName}
          onPress={onBeginWorkspaceSetup}
          showShortcutHint={isProjectActive}
          testID={`sidebar-project-new-worktree-${project.projectKey}`}
        />
      ) : null}
      {onRemoveProject ? (
        <ProjectKebabMenu
          projectKey={project.projectKey}
          projectPath={project.iconWorkingDir}
          onRemoveProject={onRemoveProject}
          removeProjectStatus={removeProjectStatus}
        />
      ) : null}
    </View>
  );
}

const trash2LeadingIcon = <ThemedTrash2 size={14} uniProps={foregroundMutedColorMapping} />;
const settingsLeadingIcon = <ThemedSettings size={14} uniProps={foregroundMutedColorMapping} />;
const copyLeadingIcon = <ThemedCopy size={14} uniProps={foregroundMutedColorMapping} />;
const markAsReadLeadingIcon = (
  <ThemedCircleCheck size={14} uniProps={foregroundMutedColorMapping} />
);
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;
const renameLeadingIcon = <ThemedPencil size={14} uniProps={foregroundMutedColorMapping} />;
const openInNewWindowLeadingIcon = (
  <ThemedExternalLink size={14} uniProps={foregroundMutedColorMapping} />
);

function renderKebabTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreVertical
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function ProjectKebabMenu({
  projectKey,
  projectPath,
  onRemoveProject,
  removeProjectStatus,
}: {
  projectKey: string;
  projectPath: string;
  onRemoveProject: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const handleOpenProjectSettings = useCallback(() => {
    if (projectKey.trim().length === 0) return;
    router.navigate(buildProjectSettingsRoute(projectKey));
  }, [projectKey]);
  const canOpenProjectSettings = projectKey.trim().length > 0;
  // Desktop-only: open a second window that lands on this project via the same
  // open-project flow as a CLI launch. The project stays visible here too — no
  // ownership, no move.
  const canOpenInNewWindow = getIsElectron() && projectPath.trim().length > 0;
  const handleOpenInNewWindow = useCallback(() => {
    const trimmedPath = projectPath.trim();
    if (trimmedPath.length === 0) return;
    void getDesktopHost()
      ?.window?.openNew?.({ pendingOpenProjectPath: trimmedPath })
      ?.catch((error) => {
        console.warn("[sidebar] openNew failed", error);
        toast.error(t("sidebar.project.actions.openNewWindowFailed"));
      });
  }, [projectPath, t, toast]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={projectKebabStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.project.actions.menu")}
        testID={`sidebar-project-kebab-${projectKey}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220}>
        {canOpenProjectSettings ? (
          <DropdownMenuItem
            testID={`sidebar-project-menu-open-settings-${projectKey}`}
            leading={settingsLeadingIcon}
            onSelect={handleOpenProjectSettings}
          >
            {t("sidebar.project.actions.openSettings")}
          </DropdownMenuItem>
        ) : null}
        {canOpenInNewWindow ? (
          <DropdownMenuItem
            testID={`sidebar-project-menu-open-new-window-${projectKey}`}
            leading={openInNewWindowLeadingIcon}
            onSelect={handleOpenInNewWindow}
          >
            {t("sidebar.project.actions.openNewWindow")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID={`sidebar-project-menu-remove-${projectKey}`}
          leading={trash2LeadingIcon}
          status={removeProjectStatus}
          pendingLabel={t("sidebar.project.actions.removing")}
          onSelect={onRemoveProject}
        >
          {t("sidebar.project.actions.remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectContextMenuContent({
  projectKey,
  projectPath,
  onRemoveProject,
  removeProjectStatus,
}: {
  projectKey: string;
  projectPath: string;
  onRemoveProject: () => void;
  removeProjectStatus: "idle" | "pending" | "success";
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const handleOpenProjectSettings = useCallback(() => {
    if (projectKey.trim().length === 0) return;
    router.navigate(buildProjectSettingsRoute(projectKey));
  }, [projectKey]);
  const canOpenProjectSettings = projectKey.trim().length > 0;
  const canOpenInNewWindow = getIsElectron() && projectPath.trim().length > 0;
  const handleOpenInNewWindow = useCallback(() => {
    const trimmedPath = projectPath.trim();
    if (trimmedPath.length === 0) return;
    void getDesktopHost()
      ?.window?.openNew?.({ pendingOpenProjectPath: trimmedPath })
      ?.catch((error) => {
        console.warn("[sidebar] openNew failed", error);
        toast.error(t("sidebar.project.actions.openNewWindowFailed"));
      });
  }, [projectPath, t, toast]);

  return (
    <ContextMenuContent align="end" width={220}>
      {canOpenProjectSettings ? (
        <ContextMenuItem
          testID={`sidebar-project-menu-open-settings-${projectKey}`}
          leading={settingsLeadingIcon}
          onSelect={handleOpenProjectSettings}
        >
          {t("sidebar.project.actions.openSettings")}
        </ContextMenuItem>
      ) : null}
      {canOpenInNewWindow ? (
        <ContextMenuItem
          testID={`sidebar-project-menu-open-new-window-${projectKey}`}
          leading={openInNewWindowLeadingIcon}
          onSelect={handleOpenInNewWindow}
        >
          {t("sidebar.project.actions.openNewWindow")}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        testID={`sidebar-project-menu-remove-${projectKey}`}
        leading={trash2LeadingIcon}
        status={removeProjectStatus}
        pendingLabel={t("sidebar.project.actions.removing")}
        onSelect={onRemoveProject}
      >
        {t("sidebar.project.actions.remove")}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

function WorkspaceRowRightGroup({
  workspace,
  badgeMode,
  tabStatusSummary,
  isHovered,
  isTouchPlatform,
  isCompactLayout,
  isCreating,
  showShortcutBadge,
  shortcutNumber,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  onArchive,
  onCreateTab,
  onMarkAsRead,
  onCopyBranchName,
  onCopyPath,
  onRename,
  expanded,
  visibility: providedVisibility,
  pendingBranchActionIds,
  statusSummaryToggleActive = false,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  badgeMode: SidebarBadgeMode;
  tabStatusSummary: SidebarTabStatusSummary;
  isHovered: boolean;
  isTouchPlatform: boolean;
  isCompactLayout: boolean;
  isCreating: boolean;
  showShortcutBadge: boolean;
  shortcutNumber: number | null;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  onArchive?: () => void;
  onCreateTab?: (event?: GestureResponderEvent) => void;
  onMarkAsRead?: () => void;
  onCopyBranchName?: () => void;
  onCopyPath?: () => void;
  onRename?: () => void;
  expanded: boolean;
  visibility?: WorkspaceRowRightVisibility;
  pendingBranchActionIds: readonly CheckoutGitAsyncActionId[];
  statusSummaryToggleActive?: boolean;
  onStatusSummaryPress?: (event: GestureResponderEvent) => void;
}) {
  const { t } = useTranslation();
  const visibility =
    providedVisibility ??
    getWorkspaceRowRightVisibility({
      badgeMode,
      expanded,
      hasArchiveAction: Boolean(onArchive),
      hasCreateTabAction: Boolean(onCreateTab),
      hasDiffStat: Boolean(workspace.diffStat),
      hasVcOperationBadges: pendingBranchActionIds.length > 0,
      isCompactLayout,
      isHovered,
      isTouchPlatform,
      showShortcutBadge,
      shortcutNumber,
      tabStatusSummary,
    });

  return (
    <>
      {isCreating ? (
        <Text style={styles.workspaceCreatingText}>{t("sidebar.workspace.status.creating")}</Text>
      ) : null}
      {visibility.shouldRenderActionSlot ? (
        <WorkspaceRowActionSlot
          workspace={workspace}
          statusSummary={tabStatusSummary}
          showCreateTab={visibility.showCreateTab}
          showCreateTabMenu={visibility.showCreateTab}
          showKebab={visibility.showKebabInSlot}
          showVcOperationBadges={visibility.showVcOperationBadges}
          showDiffStat={visibility.showDiffStat}
          showStatusSummary={visibility.showStatusSummary}
          archiveLabel={archiveLabel}
          archiveStatus={archiveStatus}
          archivePendingLabel={archivePendingLabel}
          archiveShortcutKeys={archiveShortcutKeys}
          onArchive={onArchive}
          onCreateTab={onCreateTab}
          onCopyBranchName={onCopyBranchName}
          onCopyPath={onCopyPath}
          onMarkAsRead={onMarkAsRead}
          onRename={onRename}
          pendingBranchActionIds={pendingBranchActionIds}
          statusSummaryToggleActive={statusSummaryToggleActive}
          onStatusSummaryPress={onStatusSummaryPress}
        />
      ) : null}
    </>
  );
}

function WorkspaceRowActionSlot({
  workspace,
  statusSummary,
  showCreateTab,
  showCreateTabMenu,
  showKebab,
  showVcOperationBadges,
  showDiffStat,
  showStatusSummary,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  onArchive,
  onCreateTab,
  onCopyBranchName,
  onCopyPath,
  onMarkAsRead,
  onRename,
  pendingBranchActionIds,
  statusSummaryToggleActive,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  statusSummary: SidebarTabStatusSummary;
  showCreateTab: boolean;
  showCreateTabMenu: boolean;
  showKebab: boolean;
  showVcOperationBadges: boolean;
  showDiffStat: boolean;
  showStatusSummary: boolean;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  onArchive?: () => void;
  onCreateTab?: (event?: GestureResponderEvent) => void;
  onCopyBranchName?: () => void;
  onCopyPath?: () => void;
  onMarkAsRead?: () => void;
  onRename?: () => void;
  pendingBranchActionIds: readonly CheckoutGitAsyncActionId[];
  statusSummaryToggleActive: boolean;
  onStatusSummaryPress?: (event: GestureResponderEvent) => void;
}) {
  const showActionControls = showCreateTab || showCreateTabMenu || showKebab;
  const actionControlCount = Number(showCreateTab) + Number(showCreateTabMenu) + Number(showKebab);
  const showOperationBadges = showVcOperationBadges && pendingBranchActionIds.length > 0;
  const showTrailingMeta = Boolean(
    (showOperationBadges || showDiffStat || showStatusSummary) && !showActionControls,
  );
  const trailingSlotStyle = useMemo(
    () => [
      actionControlCount === 2 && styles.workspaceTrailingActionSlotDouble,
      actionControlCount >= 3 && styles.workspaceTrailingActionSlotTriple,
    ],
    [actionControlCount],
  );

  return (
    <SidebarWorkspaceTrailingActionSlot style={trailingSlotStyle}>
      <SidebarWorkspaceTrailingActionBase visible={showTrailingMeta}>
        <WorkspaceRowTrailingMeta
          workspace={workspace}
          statusSummary={statusSummary}
          showOperationBadges={showOperationBadges}
          showDiffStat={showDiffStat}
          showStatusSummary={showStatusSummary}
          pendingBranchActionIds={pendingBranchActionIds}
          statusSummaryToggleActive={statusSummaryToggleActive}
          onStatusSummaryPress={onStatusSummaryPress}
        />
      </SidebarWorkspaceTrailingActionBase>
      <SidebarWorkspaceTrailingActionOverlay visible={showActionControls}>
        <WorkspaceRowActionControls
          workspace={workspace}
          showCreateTab={showCreateTab}
          showCreateTabMenu={showCreateTabMenu}
          showKebab={showKebab}
          archiveLabel={archiveLabel}
          archiveStatus={archiveStatus}
          archivePendingLabel={archivePendingLabel}
          archiveShortcutKeys={archiveShortcutKeys}
          onArchive={onArchive}
          onCreateTab={onCreateTab}
          onCopyBranchName={onCopyBranchName}
          onCopyPath={onCopyPath}
          onMarkAsRead={onMarkAsRead}
          onRename={onRename}
        />
      </SidebarWorkspaceTrailingActionOverlay>
    </SidebarWorkspaceTrailingActionSlot>
  );
}

function WorkspaceRowTrailingMeta({
  workspace,
  statusSummary,
  showOperationBadges,
  showDiffStat,
  showStatusSummary,
  pendingBranchActionIds,
  statusSummaryToggleActive,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  statusSummary: SidebarTabStatusSummary;
  showOperationBadges: boolean;
  showDiffStat: boolean;
  showStatusSummary: boolean;
  pendingBranchActionIds: readonly CheckoutGitAsyncActionId[];
  statusSummaryToggleActive: boolean;
  onStatusSummaryPress?: (event: GestureResponderEvent) => void;
}) {
  const showPrHint = Boolean(!showOperationBadges && showDiffStat && workspace.prHint);
  let statusBadges: ReactNode = null;
  if (!showOperationBadges && showStatusSummary) {
    statusBadges = (
      <SidebarEntryStatusBadges
        summary={statusSummary}
        excludeKinds={WORKSPACE_PROJECT_STATUS_EXCLUDED_KINDS}
      />
    );
    if (onStatusSummaryPress) {
      statusBadges = (
        <StatusSummaryToggleButton
          active={statusSummaryToggleActive}
          testID={`sidebar-workspace-status-toggle-${workspace.workspaceKey}`}
          onPress={onStatusSummaryPress}
        >
          {statusBadges}
        </StatusSummaryToggleButton>
      );
    }
  }

  return (
    <View style={styles.workspaceDiffMetaRow}>
      {showOperationBadges ? <SidebarVcOperationBadges actionIds={pendingBranchActionIds} /> : null}
      {statusBadges}
      {!showOperationBadges && showDiffStat ? (
        <WorkspaceRowDiffMeta workspace={workspace} showPrHint={showPrHint} />
      ) : null}
    </View>
  );
}

function StatusSummaryToggleButton({
  active,
  testID,
  onPress,
  children,
}: {
  active: boolean;
  testID: string;
  onPress: (event: GestureResponderEvent) => void;
  children: ReactNode;
}) {
  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onPress(event);
    },
    [onPress],
  );
  const style = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.workspaceStatusSummaryToggle,
      active && styles.workspaceStatusSummaryToggleActive,
      (hovered || pressed) && styles.workspaceStatusSummaryToggleHovered,
    ],
    [active],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        active ? "Show workspaces grouped by workspace" : "Show workspaces grouped by status"
      }
      hitSlop={4}
      onPressIn={handlePressIn}
      onPress={handlePress}
      style={style}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

function WorkspaceRowDiffMeta({
  workspace,
  showPrHint,
}: {
  workspace: SidebarWorkspaceEntry;
  showPrHint: boolean;
}) {
  return (
    <>
      {showPrHint && workspace.prHint ? (
        <View style={styles.workspacePrMetaGroup}>
          <PrBadge hint={workspace.prHint} />
          <ChecksBadge checks={workspace.prHint.checks} />
        </View>
      ) : null}
      {workspace.diffStat ? (
        <DiffStat
          additions={workspace.diffStat.additions}
          deletions={workspace.diffStat.deletions}
        />
      ) : null}
    </>
  );
}

function WorkspaceRowActionControls({
  workspace,
  showCreateTab,
  showCreateTabMenu,
  showKebab,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  onArchive,
  onCreateTab,
  onCopyBranchName,
  onCopyPath,
  onMarkAsRead,
  onRename,
}: {
  workspace: SidebarWorkspaceEntry;
  showCreateTab: boolean;
  showCreateTabMenu: boolean;
  showKebab: boolean;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  onArchive?: () => void;
  onCreateTab?: (event?: GestureResponderEvent) => void;
  onCopyBranchName?: () => void;
  onCopyPath?: () => void;
  onMarkAsRead?: () => void;
  onRename?: () => void;
}) {
  const { t } = useTranslation();
  const handleCreateTabMenuSelect = useCallback(() => {
    onCreateTab?.();
  }, [onCreateTab]);

  if (!showCreateTab && !showCreateTabMenu && !showKebab) {
    return null;
  }

  return (
    <View style={styles.workspaceTrailingActionOverlayRow}>
      {showCreateTab ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("workspace.tabs.actions.newAgent")}
          testID={`sidebar-workspace-new-tab-${workspace.workspaceKey}`}
          onPress={onCreateTab}
          style={newWorkspaceTabButtonStyle}
          hitSlop={6}
        >
          {({ hovered, pressed }) => (
            <ThemedPlus
              size={14}
              uniProps={hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping}
            />
          )}
        </Pressable>
      ) : null}
      {showCreateTabMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            accessibilityRole="button"
            accessibilityLabel={t("workspace.tabs.actions.moreActions")}
            testID={`sidebar-workspace-new-tab-menu-${workspace.workspaceKey}`}
            style={newWorkspaceTabButtonStyle}
            hitSlop={6}
          >
            {({ hovered, pressed }) => (
              <ThemedChevronDown
                size={14}
                uniProps={hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping}
              />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" width={180}>
            <DropdownMenuItem
              testID={`sidebar-workspace-new-tab-menu-agent-${workspace.workspaceKey}`}
              onSelect={handleCreateTabMenuSelect}
            >
              {t("workspace.tabs.actions.newAgent")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {showKebab && onArchive ? (
        <WorkspaceKebabMenu
          workspaceKey={workspace.workspaceKey}
          onCopyPath={onCopyPath}
          onCopyBranchName={onCopyBranchName}
          onRename={onRename}
          onMarkAsRead={onMarkAsRead}
          onArchive={onArchive}
          archiveLabel={archiveLabel}
          archiveStatus={archiveStatus}
          archivePendingLabel={archivePendingLabel}
          archiveShortcutKeys={archiveShortcutKeys}
        />
      ) : null}
    </View>
  );
}

function WorkspaceKebabMenu({
  workspaceKey,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
}: {
  workspaceKey: string;
  onCopyPath?: () => void;
  onCopyBranchName?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onArchive: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
}) {
  const { t } = useTranslation();
  const archiveTrailing = useMemo(
    () => (archiveShortcutKeys ? <Shortcut chord={archiveShortcutKeys} /> : null),
    [archiveShortcutKeys],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={workspaceKebabStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.workspace.actions.menu")}
        testID={`sidebar-workspace-kebab-${workspaceKey}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={260}>
        {onCopyPath ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-copy-path-${workspaceKey}`}
            leading={copyLeadingIcon}
            onSelect={onCopyPath}
          >
            {t("sidebar.workspace.actions.copyPath")}
          </DropdownMenuItem>
        ) : null}
        {onCopyBranchName ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-copy-branch-name-${workspaceKey}`}
            leading={copyLeadingIcon}
            onSelect={onCopyBranchName}
          >
            {t("sidebar.workspace.actions.copyBranchName")}
          </DropdownMenuItem>
        ) : null}
        {onRename ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
            leading={renameLeadingIcon}
            onSelect={onRename}
          >
            {t("sidebar.workspace.actions.rename")}
          </DropdownMenuItem>
        ) : null}
        {onMarkAsRead ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-mark-as-read-${workspaceKey}`}
            leading={markAsReadLeadingIcon}
            onSelect={onMarkAsRead}
          >
            Mark as read
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID={`sidebar-workspace-menu-archive-${workspaceKey}`}
          leading={archiveLeadingIcon}
          trailing={archiveTrailing}
          status={archiveStatus}
          pendingLabel={archivePendingLabel}
          onSelect={onArchive}
        >
          {archiveLabel ?? t("sidebar.workspace.actions.archive")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceContextMenuContent({
  workspaceKey,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
}: {
  workspaceKey: string;
  onCopyPath?: () => void;
  onCopyBranchName?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onArchive: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
}) {
  const { t } = useTranslation();
  const archiveTrailing = useMemo(
    () => (archiveShortcutKeys ? <Shortcut chord={archiveShortcutKeys} /> : null),
    [archiveShortcutKeys],
  );

  return (
    <ContextMenuContent align="end" width={260}>
      {onCopyPath ? (
        <ContextMenuItem
          testID={`sidebar-workspace-menu-copy-path-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyPath}
        >
          {t("sidebar.workspace.actions.copyPath")}
        </ContextMenuItem>
      ) : null}
      {onCopyBranchName ? (
        <ContextMenuItem
          testID={`sidebar-workspace-menu-copy-branch-name-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyBranchName}
        >
          {t("sidebar.workspace.actions.copyBranchName")}
        </ContextMenuItem>
      ) : null}
      {onRename ? (
        <ContextMenuItem
          testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
          leading={renameLeadingIcon}
          onSelect={onRename}
        >
          {t("sidebar.workspace.actions.rename")}
        </ContextMenuItem>
      ) : null}
      {onMarkAsRead ? (
        <ContextMenuItem
          testID={`sidebar-workspace-menu-mark-as-read-${workspaceKey}`}
          leading={markAsReadLeadingIcon}
          onSelect={onMarkAsRead}
        >
          Mark as read
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem
        testID={`sidebar-workspace-menu-archive-${workspaceKey}`}
        leading={archiveLeadingIcon}
        trailing={archiveTrailing}
        status={archiveStatus}
        pendingLabel={archivePendingLabel}
        onSelect={onArchive}
      >
        {archiveLabel ?? t("sidebar.workspace.actions.archive")}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

function ProjectIcon({
  iconDataUri,
  placeholderInitial,
  projectKey,
}: {
  iconDataUri: string | null;
  placeholderInitial: string;
  projectKey: string;
}) {
  return (
    <ProjectIconView
      iconDataUri={iconDataUri}
      initial={placeholderInitial}
      projectKey={projectKey}
      imageStyle={styles.projectIcon}
      fallbackStyle={styles.projectIconFallback}
      textStyle={styles.projectIconFallbackText}
    />
  );
}

function ProjectLeadingVisualStatus({
  iconDataUri,
  placeholderInitial,
  projectKey,
  isArchiving,
  shouldShowSyncedLoader,
  activeWorkspace,
  chevron,
  isHovered,
}: {
  iconDataUri: string | null;
  placeholderInitial: string;
  projectKey: string;
  isArchiving: boolean;
  shouldShowSyncedLoader: boolean;
  activeWorkspace: SidebarWorkspaceEntry;
  chevron: "expand" | "collapse" | null;
  isHovered: boolean;
}) {
  if (isArchiving) {
    return (
      <ProjectLeadingVisualSlot chevron={chevron} isHovered={isHovered}>
        <LoadingSpinner size={8} />
      </ProjectLeadingVisualSlot>
    );
  }

  if (shouldShowSyncedLoader) {
    return (
      <ProjectLeadingVisualSlot chevron={chevron} isHovered={isHovered}>
        <ThemedSyncedLoader size={11} uniProps={syncedLoaderColorMapping} />
      </ProjectLeadingVisualSlot>
    );
  }

  if (activeWorkspace.statusBucket === "needs_input") {
    return (
      <ProjectLeadingVisualSlot chevron={chevron} isHovered={isHovered}>
        <ThemedCircleAlert size={14} uniProps={amberColorMapping} />
      </ProjectLeadingVisualSlot>
    );
  }

  const dotColorStyle = getStatusDotColorStyle(activeWorkspace.statusBucket);
  const statusDotSize = isEmphasizedStatusDotBucket(activeWorkspace.statusBucket)
    ? EMPHASIZED_STATUS_DOT_SIZE
    : DEFAULT_STATUS_DOT_SIZE;
  const statusDotOffset =
    statusDotSize === EMPHASIZED_STATUS_DOT_SIZE
      ? EMPHASIZED_STATUS_DOT_OFFSET
      : DEFAULT_STATUS_DOT_OFFSET;

  return (
    <ProjectLeadingVisualSlot chevron={chevron} isHovered={isHovered}>
      <ProjectIcon
        iconDataUri={iconDataUri}
        placeholderInitial={placeholderInitial}
        projectKey={projectKey}
      />
      {dotColorStyle ? (
        <StatusDotOverlay
          dotColorStyle={dotColorStyle}
          size={statusDotSize}
          offset={statusDotOffset}
        />
      ) : null}
    </ProjectLeadingVisualSlot>
  );
}

function ProjectLeadingVisualSlot({
  chevron,
  isHovered,
  children,
}: {
  chevron: "expand" | "collapse" | null;
  isHovered: boolean;
  children: ReactNode;
}) {
  const showChevron = chevron !== null && isHovered;
  const contentStyle = useMemo(
    () => [styles.projectLeadingVisualContent, showChevron && styles.projectLeadingVisualHidden],
    [showChevron],
  );
  return (
    <View style={styles.projectLeadingVisualSlot}>
      <View style={contentStyle}>{children}</View>
      {chevron !== null ? (
        <View
          style={showChevron ? styles.projectChevronOverlay : styles.projectChevronOverlayHidden}
          pointerEvents="none"
        >
          <ProjectInlineChevron chevron={chevron} />
        </View>
      ) : null}
    </View>
  );
}

function ProjectInlineChevron({ chevron }: { chevron: "expand" | "collapse" | null }) {
  if (chevron === null) {
    return null;
  }
  if (chevron === "collapse") {
    return <ChevronDown size={14} color="#9ca3af" />;
  }
  return <ChevronRight size={14} color="#9ca3af" />;
}

function NewWorktreeButton({
  displayName,
  onPress,
  loading = false,
  testID,
  showShortcutHint = false,
}: {
  displayName: string;
  onPress: () => void;
  loading?: boolean;
  testID: string;
  showShortcutHint?: boolean;
}) {
  const { t } = useTranslation();
  const newWorktreeKeys = useShortcutKeys("new-worktree");

  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.projectIconActionButton,
      (Boolean(hovered) || pressed) && !loading && styles.projectIconActionButtonHovered,
    ],
    [loading],
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onPress();
    },
    [onPress],
  );

  return (
    <View style={styles.projectTrailingControlSlot}>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <Pressable
            style={pressableStyle}
            onPress={handlePress}
            disabled={loading}
            accessibilityRole={platformIsWeb ? undefined : "button"}
            accessibilityLabel={t("sidebar.workspace.actions.createWorkspaceFor", {
              projectName: displayName,
            })}
            testID={testID}
          >
            {({ hovered, pressed }) =>
              loading ? (
                <LoadingSpinner size={14} />
              ) : (
                <ThemedPlus
                  size={15}
                  uniProps={
                    hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping
                  }
                />
              )
            }
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <View style={styles.projectActionTooltipRow}>
            <Text style={styles.projectActionTooltipText}>
              {t("sidebar.workspace.actions.newWorkspace")}
            </Text>
            {showShortcutHint && newWorktreeKeys ? (
              <Shortcut chord={newWorktreeKeys} style={styles.projectActionTooltipShortcut} />
            ) : null}
          </View>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

function useLongPressDragInteraction(input: {
  drag: () => void;
  menuController: ReturnType<typeof useContextMenu> | null;
}) {
  const didLongPressRef = useRef(false);
  const dragArmedRef = useRef(false);
  const dragActivatedRef = useRef(false);
  const didStartDragRef = useRef(false);
  const scrollIntentRef = useRef(false);
  const menuOpenedRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const dragArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (dragArmTimerRef.current) {
      clearTimeout(dragArmTimerRef.current);
      dragArmTimerRef.current = null;
    }
    if (contextMenuTimerRef.current) {
      clearTimeout(contextMenuTimerRef.current);
      contextMenuTimerRef.current = null;
    }
  }, []);

  const openContextMenuAtStartPoint = useCallback(() => {
    if (!input.menuController || !touchStartRef.current) {
      return;
    }
    const statusBarHeight = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
    input.menuController.setAnchorRect({
      x: touchStartRef.current.x,
      y: touchStartRef.current.y + statusBarHeight,
      width: 0,
      height: 0,
    });
    input.menuController.setOpen(true);
    menuOpenedRef.current = true;
    didLongPressRef.current = true;
  }, [input.menuController]);

  const handleLongPress = useCallback(() => {
    // Manual timers own long-press behavior on mobile.
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const armTimers = useCallback(() => {
    clearTimers();

    const DRAG_ARM_DELAY_MS = 180;
    const DRAG_ARM_STATIONARY_SLOP_PX = 4;
    const CONTEXT_MENU_DELAY_MS = 450;
    const CONTEXT_MENU_STATIONARY_SLOP_PX = 6;

    dragArmTimerRef.current = setTimeout(() => {
      if (scrollIntentRef.current || didStartDragRef.current || menuOpenedRef.current) {
        return;
      }
      const start = touchStartRef.current;
      const current = touchCurrentRef.current ?? start;
      if (!start || !current) {
        return;
      }
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > DRAG_ARM_STATIONARY_SLOP_PX) {
        return;
      }
      dragArmedRef.current = true;
      dragActivatedRef.current = true;
      didLongPressRef.current = true;
      void Haptics.selectionAsync().catch(() => {});
      input.drag();
    }, DRAG_ARM_DELAY_MS);

    if (!input.menuController || platformIsWeb) {
      return;
    }

    contextMenuTimerRef.current = setTimeout(() => {
      if (scrollIntentRef.current || didStartDragRef.current || menuOpenedRef.current) {
        return;
      }
      const start = touchStartRef.current;
      const current = touchCurrentRef.current ?? start;
      if (!start || !current) {
        return;
      }
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > CONTEXT_MENU_STATIONARY_SLOP_PX) {
        return;
      }
      void Haptics.selectionAsync().catch(() => {});
      openContextMenuAtStartPoint();
    }, CONTEXT_MENU_DELAY_MS);
  }, [clearTimers, input, openContextMenuAtStartPoint]);

  const handleDragIntent = useCallback(
    (_details: { dx: number; dy: number; distance: number }) => {
      if (!dragActivatedRef.current) {
        return;
      }
      didStartDragRef.current = true;
      didLongPressRef.current = true;
      clearTimers();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    [clearTimers],
  );

  const handleScrollIntent = useCallback(
    (_details: { dx: number; dy: number; distance: number }) => {
      scrollIntentRef.current = true;
      didLongPressRef.current = true;
      clearTimers();
    },
    [clearTimers],
  );

  const handleSwipeIntent = useCallback(
    (_details: { dx: number; dy: number; distance: number }) => {
      didLongPressRef.current = true;
      clearTimers();
    },
    [clearTimers],
  );

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      didLongPressRef.current = false;
      dragArmedRef.current = false;
      dragActivatedRef.current = false;
      didStartDragRef.current = false;
      scrollIntentRef.current = false;
      menuOpenedRef.current = false;
      touchStartRef.current = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };
      touchCurrentRef.current = {
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      };
      armTimers();
    },
    [armTimers],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const start = touchStartRef.current;
      if (!start || didStartDragRef.current || menuOpenedRef.current) {
        return;
      }

      const touch = event?.nativeEvent?.touches?.[0] ?? event?.nativeEvent;
      const x = touch?.pageX;
      const y = touch?.pageY;
      if (typeof x !== "number" || typeof y !== "number") {
        return;
      }

      const current = { x, y };
      touchCurrentRef.current = current;
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const decision = decideLongPressMove({
        dragArmed: dragArmedRef.current,
        didStartDrag: didStartDragRef.current,
        startPoint: start,
        currentPoint: current,
      });

      if (decision === "vertical_scroll") {
        handleScrollIntent({ dx, dy, distance });
        return;
      }

      if (decision === "horizontal_swipe" || decision === "cancel_long_press") {
        handleSwipeIntent({ dx, dy, distance });
        return;
      }

      if (decision === "start_drag") {
        handleDragIntent({ dx, dy, distance });
      }
    },
    [handleDragIntent, handleScrollIntent, handleSwipeIntent],
  );

  const handlePressOut = useCallback(() => {
    clearTimers();
    dragArmedRef.current = false;
    dragActivatedRef.current = false;
    touchStartRef.current = null;
    touchCurrentRef.current = null;
  }, [clearTimers]);

  return {
    didLongPressRef,
    handleLongPress,
    handlePressIn,
    handleTouchMove,
    handlePressOut,
  };
}

function ProjectHeaderRow({
  project,
  displayName,
  iconDataUri,
  workspaceCount,
  agentCount,
  workspace,
  statusSummary = null,
  showStatusSummary = false,
  leadingStatusKind = null,
  highlightState = "idle",
  chevron,
  onPress,
  serverId,
  canCreateWorktree,
  isProjectActive = false,
  onWorkspacePress,
  onWorktreeCreated: _onWorktreeCreated,
  shortcutNumber = null,
  showShortcutBadge = false,
  drag,
  isDragging,
  isArchiving = false,
  menuController,
  onRemoveProject,
  removeProjectStatus = "idle",
  dragHandleProps,
}: ProjectHeaderRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isMobileBreakpoint = useIsCompactFormFactor();
  const handleBeginWorkspaceSetup = useCallback(() => {
    if (!serverId) {
      return;
    }
    onWorkspacePress?.();
    router.navigate(
      buildNewWorkspaceRoute({
        serverId,
        sourceDirectory: project.iconWorkingDir,
        displayName,
        projectId: project.projectKey,
      }) as Href,
    );
  }, [displayName, onWorkspacePress, project.iconWorkingDir, project.projectKey, serverId]);
  const interaction = useLongPressDragInteraction({
    drag,
    menuController,
  });
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    "aria-roledescription": _dragRoleDescription,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (interaction.didLongPressRef.current) {
        interaction.didLongPressRef.current = false;
        return;
      }
      onPress(event);
    },
    [interaction.didLongPressRef, onPress],
  );

  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);

  const projectRowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.projectRow,
      isDragging && styles.projectRowDragging,
      getSidebarRowHighlightStyle(highlightState),
      isHovered && styles.projectRowHovered,
      pressed && styles.projectRowPressed,
    ],
    [highlightState, isDragging, isHovered],
  );
  const showShortcut = showShortcutBadge && shortcutNumber !== null;
  const showTrailingActions = isHovered || platformIsNative || isMobileBreakpoint;
  const rowChildren = createElement(ProjectHeaderEntryContent, {
    project,
    displayName,
    iconDataUri,
    workspace,
    isArchiving,
    showStatusSummary,
    statusSummary,
    leadingStatusKind,
    chevron,
    isHovered,
    showShortcut,
    shortcutNumber,
    isProjectActive,
    canCreateWorktree,
    onBeginWorkspaceSetup: handleBeginWorkspaceSetup,
    onRemoveProject,
    removeProjectStatus,
    showTrailingActions,
  });
  const hoverCardContent = createElement(ProjectHoverCardContent, {
    project,
    displayName,
    workspaceCount,
    agentCount,
    statusSummary,
  });

  const row = menuController ? (
    <View
      {...dragAttributes}
      {...dragHandleProps?.listeners}
      ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <ContextMenuTrigger
        enabledOnMobile={false}
        accessibilityRole="button"
        style={projectRowStyle}
        onPressIn={interaction.handlePressIn}
        onTouchMove={interaction.handleTouchMove}
        onPressOut={interaction.handlePressOut}
        onPress={handlePress}
        testID={`sidebar-project-row-${project.projectKey}`}
      >
        {rowChildren}
      </ContextMenuTrigger>
    </View>
  ) : (
    <View
      {...dragAttributes}
      {...dragHandleProps?.listeners}
      ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        accessibilityRole="button"
        style={projectRowStyle}
        onPressIn={interaction.handlePressIn}
        onTouchMove={interaction.handleTouchMove}
        onPressOut={interaction.handlePressOut}
        onPress={handlePress}
        testID={`sidebar-project-row-${project.projectKey}`}
      >
        {rowChildren}
      </Pressable>
    </View>
  );

  return (
    <InfoHoverCard
      content={hoverCardContent}
      accessibilityLabel={displayName}
      testID={`sidebar-project-hover-card-${project.projectKey}`}
      isDragging={isDragging}
    >
      {row}
    </InfoHoverCard>
  );
}

function ProjectHeaderEntryContent({
  project,
  displayName,
  iconDataUri,
  workspace,
  isArchiving,
  showStatusSummary,
  statusSummary,
  leadingStatusKind,
  chevron,
  isHovered,
  showShortcut,
  shortcutNumber,
  isProjectActive,
  canCreateWorktree,
  onBeginWorkspaceSetup,
  onRemoveProject,
  removeProjectStatus,
  showTrailingActions,
}: {
  project: SidebarProjectEntry;
  displayName: string;
  iconDataUri: string | null;
  workspace: SidebarWorkspaceEntry | null;
  isArchiving: boolean;
  showStatusSummary: boolean;
  statusSummary: SidebarTabStatusSummary | null;
  leadingStatusKind: SidebarEntryStatusKind | null;
  chevron: "expand" | "collapse" | null;
  isHovered: boolean;
  showShortcut: boolean;
  shortcutNumber: number | null;
  isProjectActive: boolean;
  canCreateWorktree: boolean;
  onBeginWorkspaceSetup: () => void;
  onRemoveProject?: () => void;
  removeProjectStatus: "idle" | "pending";
  showTrailingActions: boolean;
}) {
  return (
    <SidebarEntryRowContent
      leading={createElement(ProjectLeadingVisual, {
        displayName,
        iconDataUri,
        workspace,
        projectKey: project.projectKey,
        isArchiving,
        suppressWorkspaceStatusVisual: showStatusSummary,
        chevron,
        isHovered,
      })}
      label={displayName}
      leadingStatus={leadingStatusKind}
      rightContext={
        showStatusSummary && statusSummary && !showShortcut
          ? createElement(SidebarEntryStatusBadges, {
              summary: statusSummary,
              excludeKinds: WORKSPACE_PROJECT_STATUS_EXCLUDED_KINDS,
            })
          : null
      }
      hoverRightContext={createElement(ProjectRowTrailingActions, {
        project,
        displayName,
        isProjectActive,
        canCreateWorktree,
        onBeginWorkspaceSetup,
        onRemoveProject,
        removeProjectStatus,
      })}
      showHoverRightContext={showTrailingActions && !showShortcut && !showStatusSummary}
      shortcutBadge={
        showShortcut && shortcutNumber !== null
          ? createElement(SidebarWorkspaceShortcutBadge, { number: shortcutNumber })
          : null
      }
    />
  );
}

type ProjectHeaderRowWithMenuProps = Omit<ProjectHeaderRowProps, "menuController">;

function ProjectHeaderRowWithMenu(props: ProjectHeaderRowWithMenuProps) {
  if (!props.onRemoveProject) {
    return <ProjectHeaderRow {...props} menuController={null} />;
  }

  return (
    <ContextMenu>
      <ProjectHeaderRowWithMenuTrigger {...props} />
      <ProjectContextMenuContent
        projectKey={props.project.projectKey}
        projectPath={props.project.iconWorkingDir}
        onRemoveProject={props.onRemoveProject}
        removeProjectStatus={props.removeProjectStatus ?? "idle"}
      />
    </ContextMenu>
  );
}

function ProjectHeaderRowWithMenuTrigger(props: ProjectHeaderRowWithMenuProps) {
  const menuController = useContextMenu();
  return <ProjectHeaderRow {...props} menuController={menuController} />;
}

function WorkspaceRowInner({
  workspace,
  badgeMode,
  tabStatusSummary,
  workspaceTitleSource,
  highlightState,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  drag,
  isDragging,
  isArchiving,
  isCreating = false,
  dragHandleProps,
  menuController,
  archiveLabel,
  archiveStatus = "idle",
  archivePendingLabel,
  onArchive,
  onCreateTab,
  onCopyBranchName,
  onCopyPath,
  onRename,
  expandable = false,
  expanded = false,
  onToggleExpanded,
  archiveShortcutKeys,
  statusSummaryToggleActive = false,
  onStatusSummaryPress,
}: WorkspaceRowInnerProps) {
  const embeddedTabsEnabled = expandable;
  const isCompact = useIsCompactFormFactor();
  const isTouchPlatform = platformIsNative;
  const workspaceDirectory = resolveWorkspaceDirectory({
    workspaceDirectory: workspace.workspaceDirectory,
  });
  const pendingBranchActionIds = usePendingCheckoutBranchActionIds({
    serverId: workspace.serverId,
    cwd: workspace.projectKind === "git" ? workspaceDirectory : null,
  });
  const interaction = useLongPressDragInteraction({
    drag,
    menuController,
  });
  const {
    role: _dragRole,
    tabIndex: _dragTabIndex,
    "aria-roledescription": _dragRoleDescription,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (interaction.didLongPressRef.current) {
        interaction.didLongPressRef.current = false;
        return;
      }
      onPress(event);
    },
    [interaction.didLongPressRef, onPress],
  );

  const accessibilitySelected = highlightState === "selected";
  const accessibilityState = useMemo(
    () => ({ selected: accessibilitySelected }),
    [accessibilitySelected],
  );

  return (
    <SidebarWorkspaceRowFrame
      workspace={workspace}
      isDragging={isDragging}
      statusSummary={tabStatusSummary}
      statusExcludeKinds={WORKSPACE_PROJECT_STATUS_EXCLUDED_KINDS}
    >
      {({ isHovered, hoverHandlers }) => {
        const isDesktop = !isTouchPlatform;
        const showScriptsIcon = isDesktop && workspace.hasRunningScripts;
        const hasRunningService = workspace.scripts.some(
          (s) => s.lifecycle === "running" && (s.type ?? "service") === "service",
        );
        let scriptIconKind: "service" | "command" | null = null;
        if (showScriptsIcon) {
          scriptIconKind = hasRunningService ? "service" : "command";
        }
        const workspaceRowStyle = getProjectWorkspaceRowStyle({
          embeddedTabsEnabled,
          isDragging,
          highlightState,
          isHovered,
        });
        const workspaceRightVisibility = getWorkspaceRowRightVisibility({
          badgeMode,
          expanded,
          hasArchiveAction: Boolean(onArchive),
          hasCreateTabAction: Boolean(onCreateTab),
          hasDiffStat: Boolean(workspace.diffStat),
          hasVcOperationBadges: pendingBranchActionIds.length > 0,
          isCompactLayout: isCompact,
          isHovered,
          isTouchPlatform,
          showShortcutBadge,
          shortcutNumber,
          tabStatusSummary,
        });
        const hasWorkspaceRightContent =
          isCreating ||
          workspaceRightVisibility.showCreateTab ||
          workspaceRightVisibility.showKebabInSlot ||
          workspaceRightVisibility.showDiffStat ||
          workspaceRightVisibility.showStatusSummary;
        const shouldSuppressWorkspaceStatusVisual =
          badgeMode === "status" || workspaceRightVisibility.showStatusSummary;
        const workspaceLeadingStatusKind =
          badgeMode === "status"
            ? null
            : getPrimarySidebarEntryStatusKind(tabStatusSummary, {
                excludeKinds: WORKSPACE_PROJECT_STATUS_EXCLUDED_KINDS,
              });
        return (
          <View
            {...dragAttributes}
            {...dragHandleProps?.listeners}
            ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
            style={styles.workspaceRowContainer}
            {...hoverHandlers}
          >
            <Pressable
              disabled={isArchiving}
              aria-selected={accessibilitySelected}
              accessibilityRole="button"
              accessibilityState={accessibilityState}
              style={workspaceRowStyle}
              onPressIn={interaction.handlePressIn}
              onTouchMove={interaction.handleTouchMove}
              onPressOut={interaction.handlePressOut}
              onPress={handlePress}
              testID={`sidebar-workspace-row-${workspace.workspaceKey}`}
            >
              <SidebarWorkspaceRowContent
                workspace={workspace}
                workspaceTitleSource={workspaceTitleSource}
                scriptIconKind={scriptIconKind}
                isHovered={isHovered}
                isLoading={isArchiving || isCreating}
                isCreating={isCreating}
                suppressStatusLoader={badgeMode === "status"}
                suppressStatusVisual={shouldSuppressWorkspaceStatusVisual}
                shortcutNumber={shortcutNumber}
                showShortcutBadge={showShortcutBadge}
                hasTrailingContent={hasWorkspaceRightContent}
                leadingStatusKind={workspaceLeadingStatusKind}
                expandable={expandable}
                expanded={expanded}
                onToggleExpanded={onToggleExpanded}
              >
                <WorkspaceRowRightGroup
                  workspace={workspace}
                  badgeMode={badgeMode}
                  tabStatusSummary={tabStatusSummary}
                  isHovered={isHovered}
                  isTouchPlatform={isTouchPlatform}
                  isCompactLayout={isCompact}
                  isCreating={isCreating}
                  showShortcutBadge={showShortcutBadge}
                  shortcutNumber={shortcutNumber}
                  archiveLabel={archiveLabel}
                  archiveStatus={archiveStatus}
                  archivePendingLabel={archivePendingLabel}
                  archiveShortcutKeys={archiveShortcutKeys}
                  onArchive={onArchive}
                  onCreateTab={onCreateTab}
                  onCopyBranchName={onCopyBranchName}
                  onCopyPath={onCopyPath}
                  onRename={onRename}
                  expanded={expanded}
                  visibility={workspaceRightVisibility}
                  pendingBranchActionIds={pendingBranchActionIds}
                  statusSummaryToggleActive={statusSummaryToggleActive}
                  onStatusSummaryPress={
                    workspaceRightVisibility.showStatusSummary ? onStatusSummaryPress : undefined
                  }
                />
              </SidebarWorkspaceRowContent>
            </Pressable>
          </View>
        );
      }}
    </SidebarWorkspaceRowFrame>
  );
}

function WorkspaceRowWithMenu({
  workspace,
  badgeMode,
  tabStatusSummary,
  selected,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  onWorkspacePress,
  drag,
  isDragging,
  dragHandleProps,
  canCopyBranchName,
  workspaceKeysForAutoCollapse,
  isCreating = false,
  statusSummaryToggleActive = false,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  badgeMode: SidebarBadgeMode;
  tabStatusSummary: SidebarTabStatusSummary;
  selected: boolean;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  onPress: () => void;
  onWorkspacePress?: () => void;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  canCopyBranchName: boolean;
  workspaceKeysForAutoCollapse: readonly string[];
  isCreating?: boolean;
  statusSummaryToggleActive?: boolean;
  onStatusSummaryPress?: (event: GestureResponderEvent) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings: appSettings } = useAppSettings();
  const isCompact = useIsCompactFormFactor();
  const embeddedTabsEnabled = appSettings.tabLayoutMode === "sidebar" && !isCompact;
  const [isHidingWorkspace, setIsHidingWorkspace] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const persistenceKey = useMemo(
    () =>
      buildWorkspaceTabPersistenceKey({
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
      }),
    [workspace.serverId, workspace.workspaceId],
  );
  const workspaceLayout = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.layoutByWorkspace[persistenceKey] ?? null) : null,
  );
  const openWorkspaceTabFocused = useWorkspaceLayoutStore((state) => state.openTabFocused);
  const focusWorkspacePane = useWorkspaceLayoutStore((state) => state.focusPane);
  const collapsedWorkspaceKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedWorkspaceKeys,
  );
  const setWorkspaceCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setWorkspaceCollapsed,
  );
  const setOnlyWorkspaceExpanded = useSidebarCollapsedSectionsStore(
    (state) => state.setOnlyWorkspaceExpanded,
  );
  const autoCollapseWorkspaces = useSidebarViewStore((state) => state.autoCollapseWorkspaces);
  const [showAllEmbeddedTabs, setShowAllEmbeddedTabs] = useState(false);
  const isWorkspaceExpanded = !collapsedWorkspaceKeys.has(workspace.workspaceKey);
  const mainPaneId = useMemo(
    () => (workspaceLayout ? (findMainPane(workspaceLayout.root)?.id ?? null) : null),
    [workspaceLayout],
  );
  const workspaceDirectory = resolveWorkspaceDirectory({
    workspaceDirectory: workspace.workspaceDirectory,
  });
  const worktreeArchiveStatus = useCheckoutGitActionsStore((state) =>
    workspaceDirectory
      ? state.getStatus({
          serverId: workspace.serverId,
          cwd: workspaceDirectory,
          actionId: "archive-worktree",
        })
      : "idle",
  );
  const isWorktree = workspace.workspaceKind === "worktree";
  const isArchiving = isWorktree ? workspace.archivingAt !== null : isHidingWorkspace;
  const redirectAfterArchive = useCallback(() => {
    redirectIfArchivingActiveWorkspace({
      serverId: workspace.serverId,
      workspaceId: workspace.workspaceId,
      activeWorkspaceSelection: selectionForSelectedWorkspace(selected, workspace),
    });
  }, [selected, workspace]);

  const archiveController = useWorkspaceArchive({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
    workspaceDirectory: workspace.workspaceDirectory,
    workspaceKind: workspace.workspaceKind,
    name: workspace.name,
    ...toWorktreeArchiveRisk(workspace),
    onArchiveStarted: redirectAfterArchive,
    onSetHiding: setIsHidingWorkspace,
  });

  const handleArchive = useCallback(() => {
    if (isArchiving) {
      return;
    }
    archiveController.archive();
  }, [archiveController, isArchiving]);

  const handleCopyPath = useCallback(() => {
    let copyTargetDirectory: string;
    try {
      copyTargetDirectory = requireWorkspaceDirectory({
        workspaceId: workspace.workspaceId,
        workspaceDirectory: workspace.workspaceDirectory,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("sidebar.workspace.toasts.workspacePathUnavailable"),
      );
      return;
    }
    void Clipboard.setStringAsync(copyTargetDirectory);
    toast.copied(t("sidebar.workspace.toasts.pathCopied"));
  }, [t, toast, workspace.workspaceDirectory, workspace.workspaceId]);

  const handleCopyBranchName = useCallback(() => {
    if (!workspace.currentBranch) {
      return;
    }
    void Clipboard.setStringAsync(workspace.currentBranch);
    toast.copied(t("sidebar.workspace.toasts.branchNameCopied"));
  }, [t, toast, workspace.currentBranch]);

  const renameMutation = useMutation({
    mutationFn: async (title: string) => {
      const client = getHostRuntimeStore().getClient(workspace.serverId);
      if (!client) {
        throw new Error(t("sidebar.workspace.toasts.hostDisconnected"));
      }
      await client.setWorkspaceTitle(workspace.workspaceId, title.length === 0 ? null : title);
    },
  });

  const handleOpenRename = useCallback(() => {
    setIsRenameOpen(true);
  }, []);

  const handleCloseRename = useCallback(() => {
    setIsRenameOpen(false);
  }, []);

  const handleSubmitRename = useCallback(
    async (value: string) => {
      await renameMutation.mutateAsync(value.trim());
    },
    [renameMutation],
  );

  const archiveShortcutKeys = useShortcutKeys("archive-worktree");
  const { hasClearableAttention, clearAttention } = useClearWorkspaceAttention({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
  });
  const handleMarkAsRead = useCallback(() => {
    void clearAttention().catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to mark workspace as read");
    });
  }, [clearAttention, toast]);

  const setWorkspaceExpanded = useCallback(
    (expanded: boolean) => {
      if (expanded && autoCollapseWorkspaces) {
        setOnlyWorkspaceExpanded(workspace.workspaceKey, workspaceKeysForAutoCollapse);
        return;
      }
      setWorkspaceCollapsed(workspace.workspaceKey, !expanded);
    },
    [
      autoCollapseWorkspaces,
      setOnlyWorkspaceExpanded,
      setWorkspaceCollapsed,
      workspace.workspaceKey,
      workspaceKeysForAutoCollapse,
    ],
  );

  const handleToggleWorkspaceExpanded = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      const targetExpanded = !isWorkspaceExpanded;
      if (isShiftPressed(event)) {
        setShowAllEmbeddedTabs(targetExpanded);
        setWorkspaceExpanded(targetExpanded);
        return;
      }
      setWorkspaceExpanded(targetExpanded);
    },
    [isWorkspaceExpanded, setWorkspaceExpanded],
  );
  const handleWorkspaceRowPress = useCallback(
    (event: GestureResponderEvent) => {
      if (embeddedTabsEnabled) {
        const targetExpanded = !isWorkspaceExpanded;
        if (targetExpanded && persistenceKey && mainPaneId) {
          focusWorkspacePane(persistenceKey, mainPaneId);
        }
        if (isShiftPressed(event)) {
          setShowAllEmbeddedTabs(targetExpanded);
          setWorkspaceExpanded(targetExpanded);
        } else {
          setWorkspaceExpanded(targetExpanded);
        }
      }
      onPress();
    },
    [
      embeddedTabsEnabled,
      focusWorkspacePane,
      isWorkspaceExpanded,
      mainPaneId,
      onPress,
      persistenceKey,
      setWorkspaceExpanded,
    ],
  );

  const handleCreateEmbeddedTab = useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation();
      if (!persistenceKey) {
        return;
      }
      if (mainPaneId) {
        focusWorkspacePane(persistenceKey, mainPaneId);
      }
      openWorkspaceTabFocused(persistenceKey, {
        kind: "draft",
        draftId: generateDraftId(),
      });
      if (!isWorkspaceExpanded) {
        setWorkspaceExpanded(true);
      }
      onWorkspacePress?.();
      navigateToWorkspace(workspace.serverId, workspace.workspaceId, {
        openAttentionAgent: false,
      });
    },
    [
      focusWorkspacePane,
      isWorkspaceExpanded,
      mainPaneId,
      onWorkspacePress,
      openWorkspaceTabFocused,
      persistenceKey,
      setWorkspaceExpanded,
      workspace.serverId,
      workspace.workspaceId,
    ],
  );

  useKeyboardActionHandler({
    handlerId: `worktree-archive-${workspace.workspaceKey}`,
    actions: ["worktree.archive"],
    enabled: selected && !isArchiving,
    priority: 0,
    handle: () => {
      handleArchive();
      return true;
    },
  });

  const archiveLabel = t("sidebar.workspace.actions.archive");
  const archiveStatus = getWorkspaceArchiveStatus(
    isWorktree,
    worktreeArchiveStatus,
    isHidingWorkspace,
  );
  const archivePendingLabel = t("sidebar.workspace.actions.archiving");
  const onCopyBranchName = canCopyBranchName ? handleCopyBranchName : undefined;
  const onMarkAsRead = hasClearableAttention ? handleMarkAsRead : undefined;
  const contextArchiveShortcutKeys = selected ? archiveShortcutKeys : null;
  const hasSelectedEmbeddedTab = useMemo(() => {
    if (!workspaceLayout) {
      return false;
    }
    const panes = collectAllPanes(workspaceLayout.root);
    const uiTabs = collectAllTabs(workspaceLayout.root);
    const mainPane = findMainPane(workspaceLayout.root);
    const mainPaneState = deriveWorkspacePaneState({
      pane: mainPane,
      tabs: uiTabs,
    });
    if (mainPaneState.activeTabId) {
      return true;
    }
    return panes.some((pane) => {
      if (!mainPane || pane.id === mainPane.id) {
        return false;
      }
      const paneState = deriveWorkspacePaneState({
        pane,
        tabs: uiTabs,
      });
      return paneState.activeTab !== null && workspaceLayout.focusedPaneId === pane.id;
    });
  }, [workspaceLayout]);
  const highlightState = getWorkspaceAncestorHighlighted({
    selected,
    embeddedTabsEnabled: embeddedTabsEnabled && hasSelectedEmbeddedTab,
  });

  return (
    <ContextMenu>
      <WorkspaceRowInnerWithMenu
        workspace={workspace}
        badgeMode={badgeMode}
        tabStatusSummary={tabStatusSummary}
        workspaceTitleSource={appSettings.workspaceTitleSource}
        highlightState={highlightState}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        onPress={handleWorkspaceRowPress}
        drag={drag}
        isDragging={isDragging}
        isArchiving={isArchiving}
        isCreating={isCreating}
        dragHandleProps={dragHandleProps}
        archiveLabel={archiveLabel}
        archiveStatus={archiveStatus}
        archivePendingLabel={archivePendingLabel}
        expandable={embeddedTabsEnabled}
        expanded={isWorkspaceExpanded}
        onToggleExpanded={handleToggleWorkspaceExpanded}
        onArchive={handleArchive}
        onCreateTab={embeddedTabsEnabled ? handleCreateEmbeddedTab : undefined}
        onCopyBranchName={onCopyBranchName}
        onCopyPath={handleCopyPath}
        onRename={handleOpenRename}
        onMarkAsRead={onMarkAsRead}
        archiveShortcutKeys={contextArchiveShortcutKeys}
        statusSummaryToggleActive={statusSummaryToggleActive}
        onStatusSummaryPress={selected ? onStatusSummaryPress : undefined}
      />
      {embeddedTabsEnabled ? (
        <EmbeddedWorkspaceTabs
          workspace={workspace}
          badgeMode={badgeMode}
          expanded={isWorkspaceExpanded}
          showAllTabs={showAllEmbeddedTabs}
          onShowAllTabsChange={setShowAllEmbeddedTabs}
          onWorkspacePress={onWorkspacePress}
        />
      ) : null}
      <WorkspaceContextMenuContent
        workspaceKey={workspace.workspaceKey}
        onCopyPath={handleCopyPath}
        onCopyBranchName={onCopyBranchName}
        onRename={handleOpenRename}
        onMarkAsRead={onMarkAsRead}
        onArchive={handleArchive}
        archiveLabel={archiveLabel}
        archiveStatus={archiveStatus}
        archivePendingLabel={archivePendingLabel}
        archiveShortcutKeys={contextArchiveShortcutKeys}
      />
      <AdaptiveRenameModal
        visible={isRenameOpen}
        title={t("sidebar.workspace.rename.title")}
        initialValue={workspace.title ?? workspace.name}
        placeholder={workspace.name}
        submitLabel={t("sidebar.workspace.rename.submit")}
        onClose={handleCloseRename}
        onSubmit={handleSubmitRename}
        testID={`sidebar-workspace-rename-modal-${workspace.workspaceKey}`}
      />
    </ContextMenu>
  );
}

type WorkspaceRowInnerWithMenuProps = Omit<WorkspaceRowInnerProps, "menuController">;

function WorkspaceRowInnerWithMenu(props: WorkspaceRowInnerWithMenuProps) {
  const menuController = useContextMenu();
  return <WorkspaceRowInner {...props} menuController={menuController} />;
}

function embeddedTabKeyExtractor(row: SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>): string {
  return `${row.item.paneId}:${row.item.tab.tabId}`;
}

function useMiddleClickClose(onClose: () => void): MutableRefObject<View | null> {
  const ref = useRef<View | null>(null);

  useEffect(() => {
    if (platformIsNative) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;

    function handleAuxClick(event: MouseEvent) {
      if (event.button === 1) {
        event.preventDefault();
        onClose();
      }
    }

    node.addEventListener("auxclick", handleAuxClick);
    return () => node.removeEventListener("auxclick", handleAuxClick);
  }, [onClose]);

  return ref;
}

function EmbeddedTabMenuItem({
  entry,
}: {
  entry: Extract<WorkspaceTabMenuEntry, { kind: "item" }>;
}) {
  const iconStyle = entry.iconRotation === "clockwise-90" ? styles.rotatedMenuIcon : undefined;
  const leading = useMemo(() => {
    switch (entry.icon) {
      case "copy":
        return <ThemedCopy size={16} uniProps={foregroundMutedColorMapping} />;
      case "rotate-cw":
        return <ThemedRotateCw size={16} uniProps={foregroundMutedColorMapping} />;
      case "arrow-left-to-line":
        return (
          <ThemedArrowLeftToLine
            size={16}
            style={iconStyle}
            uniProps={foregroundMutedColorMapping}
          />
        );
      case "arrow-right-to-line":
        return (
          <ThemedArrowRightToLine
            size={16}
            style={iconStyle}
            uniProps={foregroundMutedColorMapping}
          />
        );
      case "copy-x":
        return <ThemedCopyX size={16} uniProps={foregroundMutedColorMapping} />;
      case "pencil":
        return <ThemedPencil size={16} uniProps={foregroundMutedColorMapping} />;
      case "x":
        return <ThemedX size={16} uniProps={foregroundMutedColorMapping} />;
      default:
        return undefined;
    }
  }, [entry.icon, iconStyle]);
  const trailing = useMemo(
    () => (entry.hint ? <Text style={styles.embeddedTabMenuItemHint}>{entry.hint}</Text> : null),
    [entry.hint],
  );

  return (
    <ContextMenuItem
      testID={entry.testID}
      disabled={entry.disabled}
      destructive={entry.destructive}
      leading={leading}
      trailing={trailing}
      onSelect={entry.onSelect}
    >
      {entry.label}
    </ContextMenuItem>
  );
}

function EmbeddedTabContextMenuContent({
  tabId,
  entries,
}: {
  tabId: string;
  entries: WorkspaceTabMenuEntry[];
}) {
  return (
    <ContextMenuContent align="end" width={220} testID={`sidebar-embedded-tab-menu-${tabId}`}>
      {entries.map((entry) =>
        entry.kind === "separator" ? (
          <ContextMenuSeparator key={entry.key} />
        ) : (
          <EmbeddedTabMenuItem key={entry.key} entry={entry} />
        ),
      )}
    </ContextMenuContent>
  );
}

function SidebarHoverInfoRow({
  icon: Icon,
  label,
  testID,
}: {
  icon: ComponentType<ComponentProps<typeof ThemedCalendarPlus>>;
  label: string;
  testID: string;
}) {
  return (
    <View style={styles.embeddedTabHoverInfoRow}>
      <Icon size={13} uniProps={foregroundMutedColorMapping} />
      <Text style={styles.embeddedTabHoverInfoText} numberOfLines={1} testID={testID}>
        {label}
      </Text>
    </View>
  );
}

function ProjectHoverCardContent({
  project,
  displayName,
  workspaceCount,
  agentCount,
  statusSummary,
}: {
  project: SidebarProjectEntry;
  displayName: string;
  workspaceCount: number;
  agentCount: number;
  statusSummary: SidebarTabStatusSummary | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.embeddedTabHoverHeader}>
        <Text style={styles.embeddedTabHoverTitle} numberOfLines={2}>
          {displayName}
        </Text>
      </View>
      <SidebarHoverInfoRow
        icon={ThemedFolder}
        label={t("sidebar.project.info.workspaceCount", { count: workspaceCount })}
        testID={`sidebar-project-workspace-count-${project.projectKey}`}
      />
      <SidebarHoverInfoRow
        icon={ThemedBot}
        label={t("sidebar.project.info.agentCount", { count: agentCount })}
        testID={`sidebar-project-agent-count-${project.projectKey}`}
      />
      <SidebarEntryStatusExplainerRows
        summary={statusSummary}
        excludeKinds={WORKSPACE_PROJECT_STATUS_EXCLUDED_KINDS}
        testIDPrefix={`sidebar-project-status-${project.projectKey}`}
      />
    </>
  );
}

function EmbeddedTabHoverCardContent({
  label,
  subtitle,
  tabId,
  info,
  statusSummary,
}: {
  label: string;
  subtitle: string;
  tabId: string;
  info: SidebarEmbeddedTabHoverInfo;
  statusSummary: SidebarTabStatusSummary;
}) {
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.embeddedTabHoverHeader}>
        <Text style={styles.embeddedTabHoverTitle} numberOfLines={2}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.embeddedTabHoverSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {info.initialUserMessage ? (
        <Text
          style={styles.embeddedTabHoverInitialMessage}
          numberOfLines={3}
          ellipsizeMode="tail"
          testID={`sidebar-embedded-tab-initial-message-${tabId}`}
        >
          {info.initialUserMessage}
        </Text>
      ) : null}
      {info.createdAt ? (
        <SidebarHoverInfoRow
          icon={ThemedCalendarPlus}
          label={t("workspace.tabs.info.created", {
            value: formatAbsoluteDateTime(info.createdAt),
          })}
          testID={`sidebar-embedded-tab-created-${tabId}`}
        />
      ) : null}
      {info.updatedAt ? (
        <SidebarHoverInfoRow
          icon={ThemedClock3}
          label={t("workspace.tabs.info.updated", {
            value: formatRecentOrAbsoluteDateTime(info.updatedAt),
          })}
          testID={`sidebar-embedded-tab-updated-${tabId}`}
        />
      ) : null}
      {info.userInputMessageCount !== null ? (
        <SidebarHoverInfoRow
          icon={ThemedMessageCircle}
          label={t("workspace.tabs.info.promptCount", {
            count: info.userInputMessageCount,
          })}
          testID={`sidebar-embedded-tab-prompt-count-${tabId}`}
        />
      ) : null}
      <SidebarEntryStatusExplainerRows
        summary={statusSummary}
        testIDPrefix={`sidebar-embedded-tab-status-${tabId}`}
      />
    </>
  );
}

function EmbeddedWorkspaceTabRow({
  row,
  serverId,
  workspaceId,
  badgeMode,
  active,
  manualSort,
  isDragging,
  drag,
  dragHandleProps,
  onPress,
  menuEntries,
  onToggleParentExpanded,
  projectLine,
}: {
  row: SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>;
  serverId: string;
  workspaceId: string;
  badgeMode: SidebarBadgeMode;
  active: boolean;
  manualSort: boolean;
  isDragging: boolean;
  drag: () => void;
  dragHandleProps?: DraggableListDragHandleProps;
  onPress: (item: EmbeddedSidebarTabItem) => void;
  menuEntries: WorkspaceTabMenuEntry[];
  onToggleParentExpanded: (parentTabKey: string) => void;
  projectLine?: EmbeddedTabProjectLine | null;
}) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const { item } = row;
  const hoverInfo = useSidebarEmbeddedTabHoverInfo({
    serverId,
    tab: item.descriptor,
  });
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);
  const handleSelectCloseTab = useCallback(() => {
    const closeEntry = menuEntries.find((entry) => entry.kind === "item" && entry.key === "close");
    if (closeEntry?.kind === "item") {
      closeEntry.onSelect();
    }
  }, [menuEntries]);
  const middleClickRef = useMiddleClickClose(handleSelectCloseTab);
  const handleClose = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      handleSelectCloseTab();
    },
    [handleSelectCloseTab],
  );
  const dragListeners = manualSort ? dragHandleProps?.listeners : undefined;
  const setDragActivatorNodeRef = dragHandleProps?.setActivatorNodeRef;
  const handleLongPress = useCallback(() => {
    if (manualSort) {
      drag();
    }
  }, [drag, manualSort]);
  const handleDragPointerDown = useCallback(
    (event: RNPointerEvent) => {
      event.stopPropagation();
      const listener = dragListeners?.onPointerDown;
      if (typeof listener === "function") {
        listener(event);
      }
    },
    [dragListeners],
  );
  const handleWrapperRef = useCallback(
    (node: View | null) => {
      middleClickRef.current = node;
      if (manualSort) {
        setDragActivatorNodeRef?.(node);
      }
    },
    [manualSort, middleClickRef, setDragActivatorNodeRef],
  );
  const showCloseButton = isHovered || platformIsNative || isCompact;
  const showParentToggle = row.childCount > 0 && (isHovered || platformIsNative || isCompact);
  const collapsedBranchCount = row.childCount > 0 && !row.expanded ? row.statusSummary.total : null;
  const handleToggleExpanded = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (row.parentTabKey) {
        onToggleParentExpanded(row.parentTabKey);
      }
    },
    [onToggleParentExpanded, row.parentTabKey],
  );
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.embeddedTabRow,
      projectLine && styles.embeddedTabRowWithProjectLine,
      row.depth > 0 && { paddingLeft: 24 + row.depth * 16 },
      active && styles.sidebarRowSelected,
      isDragging && styles.embeddedTabRowDragging,
      (hovered || pressed) && styles.embeddedTabRowHovered,
    ],
    [active, isDragging, projectLine, row.depth],
  );
  const wrapperStyle = useMemo(
    () => [styles.embeddedTabWrapper, projectLine && styles.embeddedTabWrapperWithProjectLine],
    [projectLine],
  );
  const accessibilityState = useMemo(() => ({ selected: active }), [active]);

  return (
    <WorkspaceTabPresentationResolver
      tab={item.descriptor}
      serverId={serverId}
      workspaceId={workspaceId}
    >
      {(presentation) => {
        const label =
          presentation.titleState === "loading" ? t("workspace.tabs.loading") : presentation.label;
        const leadingStatus =
          badgeMode === "status" ? null : getPrimarySidebarEntryStatusKind(row.statusSummary);
        const rightContext =
          badgeMode === "status"
            ? createElement(SidebarEntryStatusBadges, { summary: row.statusSummary })
            : null;
        const hoverRightContext = createElement(
          View,
          { style: styles.embeddedTabActionRow },
          createElement(EmbeddedTabKebabMenu, { tabId: item.tab.tabId, entries: menuEntries }),
          createElement(EmbeddedTabCloseButton, {
            tabId: item.tab.tabId,
            accessibilityLabel: t("common.actions.close"),
            onClose: handleClose,
          }),
        );
        const hoverCardContent = createElement(EmbeddedTabHoverCardContent, {
          label,
          subtitle: presentation.subtitle,
          tabId: item.tab.tabId,
          info: hoverInfo,
          statusSummary: row.statusSummary,
        });
        return (
          <InfoHoverCard
            content={hoverCardContent}
            accessibilityLabel={label}
            testID={`sidebar-embedded-tab-hover-card-${item.tab.tabId}`}
            isDragging={isDragging}
            triggerStyle={wrapperStyle}
            surfaceStyle={styles.embeddedTabHoverCardSurface}
          >
            <ContextMenu>
              <View
                {...(manualSort ? (dragHandleProps?.attributes as object | undefined) : undefined)}
                {...(manualSort ? (dragListeners as object | undefined) : undefined)}
                style={wrapperStyle}
                onPointerDown={manualSort ? handleDragPointerDown : undefined}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                ref={handleWrapperRef}
              >
                <ContextMenuTrigger
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={accessibilityState}
                  onPress={handlePress}
                  onLongPress={handleLongPress}
                  style={rowStyle}
                  testID={`sidebar-embedded-tab-${item.tab.tabId}`}
                >
                  <SidebarEntryRowContent
                    leading={createElement(WorkspaceTabIcon, {
                      presentation,
                      active,
                      size: 14,
                      showStatusBadge: false,
                    })}
                    hoverLeading={
                      row.childCount > 0
                        ? createElement(EmbeddedTabChevronButton, {
                            expanded: row.expanded,
                            tabId: row.item.tab.tabId,
                            onPress: handleToggleExpanded,
                          })
                        : null
                    }
                    showHoverLeading={showParentToggle}
                    leadingBadge={
                      projectLine
                        ? createElement(ProjectLineIcon, {
                            projectKey: projectLine.projectKey,
                            projectName: projectLine.projectName,
                            iconDataUri: projectLine.iconDataUri,
                            kind: projectLine.kind,
                            workspaceKind: projectLine.workspaceKind,
                          })
                        : null
                    }
                    leadingStatus={projectLine ? null : leadingStatus}
                    label={label}
                    labelPrefix={
                      collapsedBranchCount
                        ? createElement(EmbeddedTabBranchCountBadge, {
                            tabId: item.tab.tabId,
                            count: collapsedBranchCount,
                          })
                        : null
                    }
                    subtitle={projectLine?.projectName ?? null}
                    rightContext={rightContext}
                    hoverRightContext={hoverRightContext}
                    showHoverRightContext={showCloseButton}
                  />
                </ContextMenuTrigger>
              </View>
              <EmbeddedTabContextMenuContent tabId={item.tab.tabId} entries={menuEntries} />
            </ContextMenu>
          </InfoHoverCard>
        );
      }}
    </WorkspaceTabPresentationResolver>
  );
}

function EmbeddedTabBranchCountBadge({ tabId, count }: { tabId: string; count: number }) {
  return (
    <View style={styles.embeddedTabBranchCountBadge} testID={`sidebar-embedded-tab-count-${tabId}`}>
      <Text style={styles.embeddedTabBranchCountBadgeText}>{count}</Text>
    </View>
  );
}

function EmbeddedTabCloseButton({
  tabId,
  accessibilityLabel,
  onClose,
}: {
  tabId: string;
  accessibilityLabel: string;
  onClose: (event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onClose}
      style={embeddedTabCloseButtonStyle}
      hitSlop={6}
      testID={`sidebar-embedded-tab-close-${tabId}`}
    >
      {({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => (
        <ThemedX
          size={13}
          uniProps={hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping}
        />
      )}
    </Pressable>
  );
}

function EmbeddedTabChevronButton({
  expanded,
  tabId,
  onPress,
}: {
  expanded: boolean;
  tabId: string;
  onPress: (event: GestureResponderEvent) => void;
}) {
  const { t } = useTranslation();
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        expanded
          ? t("sidebar.workspace.embeddedTabs.collapse")
          : t("sidebar.workspace.embeddedTabs.expand")
      }
      accessibilityState={accessibilityState}
      onPress={onPress}
      hitSlop={6}
      style={embeddedTabCloseButtonStyle}
      testID={`sidebar-embedded-tab-parent-toggle-${tabId}`}
    >
      {expanded ? (
        <ThemedChevronDown size={14} uniProps={foregroundMutedColorMapping} />
      ) : (
        <ThemedChevronRight size={14} uniProps={foregroundMutedColorMapping} />
      )}
    </Pressable>
  );
}

function EmbeddedTabKebabMenu({
  tabId,
  entries,
}: {
  tabId: string;
  entries: WorkspaceTabMenuEntry[];
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={workspaceKebabStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel={t("workspace.tabs.actions.moreActions")}
        testID={`sidebar-embedded-tab-kebab-${tabId}`}
      >
        {renderKebabTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220} testID={`sidebar-embedded-tab-menu-${tabId}`}>
        {entries.map((entry) =>
          entry.kind === "separator" ? (
            <DropdownMenuSeparator key={entry.key} />
          ) : (
            <DropdownMenuItem
              key={entry.key}
              testID={entry.testID}
              disabled={entry.disabled}
              destructive={entry.destructive}
              onSelect={entry.onSelect}
            >
              {entry.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectLineIcon({
  projectKey,
  projectName,
  iconDataUri,
  kind = "project",
  workspaceKind,
}: {
  projectKey: string;
  projectName: string;
  iconDataUri: string | null;
  kind?: "project" | "workspace";
  workspaceKind?: SidebarWorkspaceEntry["workspaceKind"];
}) {
  if (kind === "workspace") {
    return <WorkspaceLineIcon workspaceKind={workspaceKind ?? "directory"} />;
  }
  const placeholderLabel = projectIconPlaceholderLabelFromDisplayName(projectName);
  const placeholderInitial = placeholderLabel.charAt(0).toUpperCase();
  return (
    <ProjectIconView
      iconDataUri={iconDataUri}
      initial={placeholderInitial}
      projectKey={projectKey}
      imageStyle={styles.projectLineIcon}
      fallbackStyle={styles.projectLineIconFallback}
      textStyle={styles.projectLineIconFallbackText}
    />
  );
}

function WorkspaceLineIcon({
  workspaceKind,
}: {
  workspaceKind: SidebarWorkspaceEntry["workspaceKind"];
}) {
  let KindIcon: typeof ThemedMonitor;
  if (workspaceKind === "local_checkout") KindIcon = ThemedMonitor;
  else if (workspaceKind === "worktree") KindIcon = ThemedFolderGit2;
  else KindIcon = ThemedFolder;

  return (
    <View style={styles.workspaceLineIcon} testID={`sidebar-workspace-line-icon-${workspaceKind}`}>
      <KindIcon size={10} uniProps={foregroundMutedColorMapping} />
    </View>
  );
}

function EmbeddedWorkspaceTabs({
  workspace,
  badgeMode,
  expanded,
  showAllTabs,
  onShowAllTabsChange,
  onWorkspacePress,
  statusBucketFilter = null,
  projectLine = null,
  limitRecentTabs = true,
}: {
  workspace: SidebarWorkspaceEntry;
  badgeMode: SidebarBadgeMode;
  expanded: boolean;
  showAllTabs: boolean;
  onShowAllTabsChange: (showAllTabs: boolean) => void;
  onWorkspacePress?: () => void;
  statusBucketFilter?: StatusBucket | null;
  projectLine?: EmbeddedTabProjectLine | null;
  limitRecentTabs?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const client = useSessionStore((state) => state.sessions[workspace.serverId]?.client ?? null);
  const [renamingTab, setRenamingTab] = useState<{
    kind: "terminal" | "agent";
    id: string;
    currentTitle: string;
  } | null>(null);
  const persistenceKey = useMemo(
    () =>
      buildWorkspaceTabPersistenceKey({
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
      }),
    [workspace.serverId, workspace.workspaceId],
  );
  const workspaceLayout = useWorkspaceLayoutStore((state) =>
    persistenceKey ? (state.layoutByWorkspace[persistenceKey] ?? null) : null,
  );
  const focusWorkspaceTab = useWorkspaceLayoutStore((state) => state.focusTab);
  const focusWorkspacePane = useWorkspaceLayoutStore((state) => state.focusPane);
  const reorderTabsInPane = useWorkspaceLayoutStore((state) => state.reorderTabsInPane);
  const workspaceAgents = useSessionStore(
    (state) => state.sessions[workspace.serverId]?.agents ?? null,
  );
  const queuedMessages = useSessionStore(
    (state) => state.sessions[workspace.serverId]?.queuedMessages ?? null,
  );
  const pendingCreatesByDraftId = useCreateFlowStore((state) => state.pendingByDraftId);
  const setupSnapshots = useWorkspaceSetupStore((state) => state.snapshots);
  const browsersById = useBrowserStore((state) => state.browsersById);
  const draftRecords = useDraftStore((state) => state.drafts);
  const tabSortMode = useSidebarViewStore((state) =>
    state.getEmbeddedTabSortMode(workspace.serverId),
  );
  const recentTabCount = useSidebarViewStore((state) =>
    state.getEmbeddedRecentTabCount(workspace.serverId),
  );
  const expandedParentTabKeys = useSidebarCollapsedSectionsStore(
    (state) => state.expandedParentTabKeys,
  );
  const toggleParentTabExpanded = useSidebarCollapsedSectionsStore(
    (state) => state.toggleParentTabExpanded,
  );
  const mainPane = useMemo(
    () => (workspaceLayout ? findMainPane(workspaceLayout.root) : null),
    [workspaceLayout],
  );
  const panes = useMemo(
    () => (workspaceLayout ? collectAllPanes(workspaceLayout.root) : []),
    [workspaceLayout],
  );
  const uiTabs = useMemo(
    () => (workspaceLayout ? collectAllTabs(workspaceLayout.root) : []),
    [workspaceLayout],
  );
  const terminalsQueryKey = useMemo(
    () =>
      buildTerminalsQueryKey(
        workspace.serverId,
        workspace.workspaceDirectory ?? null,
        workspace.workspaceId,
      ),
    [workspace.serverId, workspace.workspaceDirectory, workspace.workspaceId],
  );
  const paneState = useMemo(
    () =>
      deriveWorkspacePaneState({
        pane: mainPane,
        tabs: uiTabs,
      }),
    [mainPane, uiTabs],
  );
  const paneTabsByPaneId = useMemo(() => {
    const map = new Map<string, WorkspaceTabDescriptor[]>();
    for (const pane of panes) {
      map.set(
        pane.id,
        deriveWorkspacePaneState({
          pane,
          tabs: uiTabs,
        }).tabs.map((entry) => entry.descriptor),
      );
    }
    return map;
  }, [panes, uiTabs]);
  const agentMap = workspaceAgents ?? EMPTY_AGENT_MAP;
  const draftInputsByKey = useMemo<Record<string, DraftInput>>(() => {
    const inputs: Record<string, DraftInput> = {};
    for (const [key, record] of Object.entries(draftRecords)) {
      if (record.lifecycle === "active") {
        inputs[key] = record.input;
      }
    }
    return inputs;
  }, [draftRecords]);
  const queuedMessageCountsByAgentId = useMemo(
    () =>
      queuedMessages
        ? new Map(
            Array.from(queuedMessages.entries()).map(([agentId, queue]) => [agentId, queue.length]),
          )
        : undefined,
    [queuedMessages],
  );
  const emptyTerminalsById = useMemo(() => new Map<string, SidebarTerminalStatusRecord>(), []);
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const isActiveWorkspace = isWorkspaceSelected({
    selection: activeWorkspaceSelection,
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
    enabled: true,
  });
  const allItems = useMemo<EmbeddedSidebarTabItem[]>(() => {
    return buildEmbeddedSidebarTabItems({
      mainPane,
      panes,
      uiTabs,
      agents: agentMap,
    });
  }, [agentMap, mainPane, panes, uiTabs]);
  const statusSummariesByTabId = useMemo(() => {
    const summaries = new Map<string, SidebarTabStatusSummary>();
    for (const item of allItems) {
      summaries.set(
        item.tab.tabId,
        summarizeSidebarTabs({
          tabs: [item.tab],
          serverId: workspace.serverId,
          workspaceId: workspace.workspaceId,
          agents: agentMap,
          pendingCreatesByDraftId,
          setupSnapshots,
          browsersById,
          terminalsById: emptyTerminalsById,
          draftInputsByKey,
          queuedMessageCountsByAgentId,
        }),
      );
    }
    return summaries;
  }, [
    agentMap,
    allItems,
    browsersById,
    draftInputsByKey,
    emptyTerminalsById,
    pendingCreatesByDraftId,
    queuedMessageCountsByAgentId,
    setupSnapshots,
    workspace.serverId,
    workspace.workspaceId,
  ]);
  const sortedItems = useMemo(
    () =>
      sortSidebarTabItems({
        items: allItems,
        sortMode: tabSortMode,
        agents: agentMap,
        statusSummariesByTabId,
      }),
    [agentMap, allItems, statusSummariesByTabId, tabSortMode],
  );
  const treeRows = useMemo(
    () =>
      buildSidebarEmbeddedTabTreeRows({
        workspaceKey: workspace.workspaceKey,
        items: sortedItems,
        parentTabIdByTabId: workspaceLayout?.parentTabIdByTabId ?? null,
        expandedParentTabKeys,
        statusSummariesByTabId,
      }),
    [
      expandedParentTabKeys,
      sortedItems,
      statusSummariesByTabId,
      workspace.workspaceKey,
      workspaceLayout?.parentTabIdByTabId,
    ],
  );
  const filteredRows = useMemo(
    () => filterEmbeddedTabRowsByStatus({ rows: treeRows, statusBucketFilter }),
    [statusBucketFilter, treeRows],
  );
  const orderedTabIds = useMemo(() => sortedItems.map((item) => item.tab.tabId), [sortedItems]);
  const { closeTab, closeWorkspaceTabWithCleanup, handleCloseTabById } = useWorkspaceTabClose({
    serverId: workspace.serverId,
    workspaceId: workspace.workspaceId,
    workspaceDirectory: workspace.workspaceDirectory ?? null,
    tabs: uiTabs,
    orderedTabIds,
    parentTabIdByTabId: workspaceLayout?.parentTabIdByTabId ?? null,
  });
  const { visibleRows, shouldShowVisibilityToggle } = useVisibleEmbeddedTabRows({
    rows: filteredRows,
    recentTabCount,
    showAllTabs,
    limitRecentTabs,
  });
  const embeddedTabsContainerStyle = useMemo(
    () => [
      styles.embeddedTabsContainer,
      projectLine && styles.embeddedTabsContainerWithProjectLine,
    ],
    [projectLine],
  );
  const totalTabCount = sortedItems.length;
  const handleToggleShowAllTabs = useCallback(() => {
    onShowAllTabsChange(!showAllTabs);
  }, [onShowAllTabsChange, showAllTabs]);
  const visibilityToggleFooter = useMemo(
    () =>
      shouldShowVisibilityToggle ? (
        <EmbeddedTabsVisibilityToggle
          expanded={showAllTabs}
          totalTabCount={totalTabCount}
          onPress={handleToggleShowAllTabs}
        />
      ) : null,
    [handleToggleShowAllTabs, shouldShowVisibilityToggle, showAllTabs, totalTabCount],
  );

  const handlePressTab = useCallback(
    (item: EmbeddedSidebarTabItem) => {
      if (persistenceKey) {
        if (item.mainPane) {
          focusWorkspaceTab(persistenceKey, item.tab.tabId);
        } else {
          focusWorkspacePane(persistenceKey, item.paneId);
        }
      }
      onWorkspacePress?.();
      navigateToWorkspace(workspace.serverId, workspace.workspaceId, {
        openAttentionAgent: false,
      });
    },
    [
      focusWorkspacePane,
      focusWorkspaceTab,
      onWorkspacePress,
      persistenceKey,
      workspace.serverId,
      workspace.workspaceId,
    ],
  );
  const handleCopyAgentId = useCallback(
    async (agentId: string) => {
      try {
        await Clipboard.setStringAsync(agentId);
        toast.copied(t("workspace.tabs.toasts.agentIdCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t],
  );
  const handleCopyFilePath = useCallback(
    async (path: string) => {
      try {
        await Clipboard.setStringAsync(path);
        toast.copied(t("workspace.tabs.toasts.filePathCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t],
  );
  const handleCopyResumeCommand = useCallback(
    async (agentId: string) => {
      const agent = useSessionStore.getState().sessions[workspace.serverId]?.agents?.get(agentId);
      const providerSessionId = agent?.runtimeInfo?.sessionId ?? agent?.persistence?.sessionId;
      if (!agent || !providerSessionId) {
        toast.error(t("workspace.tabs.toasts.resumeIdUnavailable"));
        return;
      }
      const command = buildProviderCommand({
        provider: agent.provider,
        id: "resume",
        sessionId: providerSessionId,
      });
      if (!command) {
        toast.error(t("workspace.tabs.toasts.resumeCommandUnavailable"));
        return;
      }
      try {
        await Clipboard.setStringAsync(command);
        toast.copied(t("workspace.tabs.toasts.resumeCommandCopiedLabel"));
      } catch {
        toast.error(t("workspace.tabs.toasts.copyFailed"));
      }
    },
    [toast, t, workspace.serverId],
  );
  const handleReloadAgent = useCallback(
    async (agentId: string) => {
      if (!client) {
        toast.error(t("workspace.terminal.hostDisconnected"));
        return;
      }
      toast.show(t("workspace.tabs.toasts.reloadingAgent"), { durationMs: null });
      try {
        await client.refreshAgent(agentId);
        const sessionState = useSessionStore.getState().sessions[workspace.serverId];
        const currentCursor = sessionState?.agentTimelineCursor.get(agentId);
        await client.fetchAgentTimeline(agentId, {
          direction: "tail",
          projection: "projected",
          ...(currentCursor
            ? { cursor: { epoch: currentCursor.epoch, seq: currentCursor.endSeq } }
            : {}),
        });
        toast.show(t("workspace.tabs.toasts.reloadedAgent"), { variant: "success" });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("workspace.tabs.toasts.failedToReloadAgent"),
        );
      }
    },
    [client, toast, t, workspace.serverId],
  );
  const handleRenameTab = useCallback(
    (tab: WorkspaceTabDescriptor) => {
      if (tab.target.kind === "agent") {
        const agent =
          useSessionStore
            .getState()
            .sessions[workspace.serverId]?.agents?.get(tab.target.agentId) ?? null;
        setRenamingTab({
          kind: "agent",
          id: tab.target.agentId,
          currentTitle: agent?.title ?? "",
        });
        return;
      }
      if (tab.target.kind === "terminal") {
        const { terminalId } = tab.target;
        const payload = queryClient.getQueryData<ListTerminalsPayload>(terminalsQueryKey);
        const terminal = payload?.terminals.find((entry) => entry.id === terminalId) ?? null;
        setRenamingTab({
          kind: "terminal",
          id: terminalId,
          currentTitle: terminal?.title ?? terminal?.name ?? "",
        });
      }
    },
    [queryClient, terminalsQueryKey, workspace.serverId],
  );
  const handleRenameModalClose = useCallback(() => setRenamingTab(null), []);
  const handleRenameModalSubmit = useCallback(
    async (nextTitle: string) => {
      if (!renamingTab) {
        return;
      }
      if (!client) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      const title = nextTitle.trim();
      if (renamingTab.kind === "terminal") {
        const result = await client.renameTerminal({ terminalId: renamingTab.id, title });
        if (!result.success) {
          throw new Error(result.error ?? "Failed to rename terminal");
        }
        void queryClient.invalidateQueries({ queryKey: terminalsQueryKey });
        return;
      }
      await client.updateAgent(renamingTab.id, { name: title });
      void queryClient.invalidateQueries({ queryKey: ["sidebarAgentsList", workspace.serverId] });
      void queryClient.invalidateQueries({ queryKey: ["allAgents", workspace.serverId] });
    },
    [client, queryClient, renamingTab, t, terminalsQueryKey, workspace.serverId],
  );
  const tabMenuLabels = useMemo<WorkspaceTabMenuLabels>(
    () => ({
      copyResumeCommand: t("workspace.tabs.menu.copyResumeCommand"),
      copyAgentId: t("workspace.tabs.menu.copyAgentId"),
      copyFilePath: t("workspace.tabs.menu.copyFilePath"),
      rename: t("workspace.tabs.menu.rename"),
      closeAbove: t("workspace.tabs.menu.closeAbove"),
      closeBelow: t("workspace.tabs.menu.closeBelow"),
      closeLeft: t("workspace.tabs.menu.closeLeft"),
      closeRight: t("workspace.tabs.menu.closeRight"),
      closeOthers: t("workspace.tabs.menu.closeOthers"),
      reloadAgent: t("workspace.tabs.menu.reloadAgent"),
      reloadAgentTooltip: t("workspace.tabs.menu.reloadAgentTooltip"),
      close: t("workspace.tabs.menu.close"),
    }),
    [t],
  );
  const bulkCloseConfirmationLabels = useMemo<BulkCloseConfirmationLabels>(
    () => ({
      all: ({ agents: agentCount, terminals: terminalCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.all", {
          agents: agentCount,
          terminals: terminalCount,
          tabs: tabCount,
        }),
      agentsAndTerminals: ({ agents: agentCount, terminals: terminalCount }) =>
        t("workspace.tabs.confirmations.bulk.agentsAndTerminals", {
          agents: agentCount,
          terminals: terminalCount,
        }),
      terminalsAndTabs: ({ terminals: terminalCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.terminalsAndTabs", {
          terminals: terminalCount,
          tabs: tabCount,
        }),
      agentsAndTabs: ({ agents: agentCount, tabs: tabCount }) =>
        t("workspace.tabs.confirmations.bulk.agentsAndTabs", {
          agents: agentCount,
          tabs: tabCount,
        }),
      terminals: ({ terminals: terminalCount }) =>
        t("workspace.tabs.confirmations.bulk.terminals", { terminals: terminalCount }),
      tabs: ({ tabs: tabCount }) => t("workspace.tabs.confirmations.bulk.tabs", { tabs: tabCount }),
      agents: ({ agents: agentCount }) =>
        t("workspace.tabs.confirmations.bulk.agents", { agents: agentCount }),
    }),
    [t],
  );
  const manualSortEnabled = shouldEnableEmbeddedTabManualSort({
    statusBucketFilter,
    tabSortMode,
  });
  const handleBulkCloseTabs = useCallback(
    async (input: { tabsToClose: WorkspaceTabDescriptor[]; title: string; logLabel: string }) => {
      if (input.tabsToClose.length === 0) {
        return;
      }
      const groups = classifyBulkClosableTabs(input.tabsToClose);
      const confirmed = await confirmDialog({
        title: input.title,
        message: buildBulkCloseConfirmationMessage(groups, bulkCloseConfirmationLabels),
        confirmLabel: t("workspace.tabs.confirmations.close"),
        cancelLabel: t("workspace.tabs.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      await closeBulkWorkspaceTabs({
        client,
        groups,
        closeTab,
        closeWorkspaceTabWithCleanup,
        logLabel: input.logLabel,
        warn: (message, payload) => {
          console.warn(message, payload);
        },
      });
    },
    [bulkCloseConfirmationLabels, client, closeTab, closeWorkspaceTabWithCleanup, t],
  );
  const buildMenuEntries = useCallback(
    (item: EmbeddedSidebarTabItem) => {
      const paneTabs = paneTabsByPaneId.get(item.paneId) ?? [item.descriptor];
      const index = Math.max(
        0,
        paneTabs.findIndex((tab) => tab.tabId === item.tab.tabId),
      );
      const menuTestIDBase = `workspace-tab-context-${item.tab.tabId}`;
      return buildWorkspaceTabMenuEntries({
        surface: "vertical",
        tab: item.descriptor,
        index,
        tabCount: paneTabs.length,
        menuTestIDBase,
        onCopyResumeCommand: handleCopyResumeCommand,
        onCopyAgentId: handleCopyAgentId,
        onCopyFilePath: handleCopyFilePath,
        onReloadAgent: handleReloadAgent,
        onRenameTab: handleRenameTab,
        onCloseTab: () => {
          void handleCloseTabById(item.tab.tabId);
        },
        onCloseTabsBefore: async () => {
          await handleBulkCloseTabs({
            tabsToClose: paneTabs.slice(0, index),
            title: t("workspace.tabs.confirmations.closeTabsLeftTitle"),
            logLabel: "to the left",
          });
        },
        onCloseTabsAfter: async () => {
          await handleBulkCloseTabs({
            tabsToClose: paneTabs.slice(index + 1),
            title: t("workspace.tabs.confirmations.closeTabsRightTitle"),
            logLabel: "to the right",
          });
        },
        onCloseOtherTabs: async () => {
          await handleBulkCloseTabs({
            tabsToClose: paneTabs.filter((tab) => tab.tabId !== item.tab.tabId),
            title: t("workspace.tabs.confirmations.closeOtherTabsTitle"),
            logLabel: "from close other tabs",
          });
        },
        labels: tabMenuLabels,
      });
    },
    [
      handleBulkCloseTabs,
      handleCloseTabById,
      handleCopyAgentId,
      handleCopyFilePath,
      handleCopyResumeCommand,
      handleReloadAgent,
      handleRenameTab,
      paneTabsByPaneId,
      t,
      tabMenuLabels,
    ],
  );

  const handleManualDragEnd = useCallback(
    (nextVisibleRows: SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>[]) => {
      if (!persistenceKey || !mainPane || !manualSortEnabled) {
        return;
      }
      const mainPaneItems = allItems.filter((item) => item.mainPane);
      const nextTabIds = mergeEmbeddedVisibleTabOrder({
        mainPaneItems,
        nextVisibleItems: nextVisibleRows.map((row) => row.item),
      });
      reorderTabsInPane(persistenceKey, mainPane.id, nextTabIds);
    },
    [allItems, mainPane, manualSortEnabled, persistenceKey, reorderTabsInPane],
  );

  const renderEmbeddedTab = useCallback(
    ({
      item: row,
      drag,
      isActive,
      dragHandleProps,
    }: DraggableRenderItemInfo<SidebarEmbeddedTabTreeRow<EmbeddedSidebarTabItem>>) => (
      <EmbeddedWorkspaceTabRow
        row={row}
        serverId={workspace.serverId}
        workspaceId={workspace.workspaceId}
        badgeMode={badgeMode}
        active={
          isActiveWorkspace &&
          (row.item.mainPane
            ? row.item.tab.tabId === paneState.activeTabId
            : workspaceLayout?.focusedPaneId === row.item.paneId)
        }
        manualSort={manualSortEnabled && row.item.mainPane && row.depth === 0}
        isDragging={isActive}
        drag={drag}
        dragHandleProps={dragHandleProps}
        onPress={handlePressTab}
        menuEntries={buildMenuEntries(row.item)}
        onToggleParentExpanded={toggleParentTabExpanded}
        projectLine={projectLine}
      />
    ),
    [
      badgeMode,
      buildMenuEntries,
      handlePressTab,
      isActiveWorkspace,
      manualSortEnabled,
      paneState.activeTabId,
      projectLine,
      toggleParentTabExpanded,
      workspace.serverId,
      workspace.workspaceId,
      workspaceLayout?.focusedPaneId,
    ],
  );

  if (!expanded || !mainPane || visibleRows.length === 0) {
    return null;
  }

  return (
    <>
      {manualSortEnabled ? (
        <DraggableList
          testID={`sidebar-embedded-tabs-${workspace.workspaceKey}`}
          data={visibleRows}
          keyExtractor={embeddedTabKeyExtractor}
          renderItem={renderEmbeddedTab}
          onDragEnd={handleManualDragEnd}
          scrollEnabled={false}
          useDragHandle
          containerStyle={embeddedTabsContainerStyle}
          ListFooterComponent={visibilityToggleFooter}
        />
      ) : (
        <View
          style={embeddedTabsContainerStyle}
          testID={`sidebar-embedded-tabs-${workspace.workspaceKey}`}
        >
          {visibleRows.map((row) => (
            <EmbeddedWorkspaceTabRow
              key={row.item.tab.tabId}
              row={row}
              serverId={workspace.serverId}
              workspaceId={workspace.workspaceId}
              badgeMode={badgeMode}
              active={
                isActiveWorkspace &&
                (row.item.mainPane
                  ? row.item.tab.tabId === paneState.activeTabId
                  : workspaceLayout?.focusedPaneId === row.item.paneId)
              }
              manualSort={false}
              isDragging={false}
              drag={noop}
              onPress={handlePressTab}
              menuEntries={buildMenuEntries(row.item)}
              onToggleParentExpanded={toggleParentTabExpanded}
              projectLine={projectLine}
            />
          ))}
          {shouldShowVisibilityToggle ? (
            <EmbeddedTabsVisibilityToggle
              expanded={showAllTabs}
              totalTabCount={totalTabCount}
              onPress={handleToggleShowAllTabs}
            />
          ) : null}
        </View>
      )}
      <AdaptiveRenameModal
        visible={renamingTab !== null}
        title={
          renamingTab?.kind === "terminal"
            ? t("workspace.tabs.menu.renameTerminal")
            : t("workspace.tabs.menu.renameAgent")
        }
        initialValue={renamingTab?.currentTitle ?? ""}
        submitLabel={t("workspace.tabs.menu.rename")}
        maxLength={200}
        onClose={handleRenameModalClose}
        onSubmit={handleRenameModalSubmit}
        testID={
          renamingTab
            ? `sidebar-embedded-tab-rename-modal-${renamingTab.kind}-${renamingTab.id}`
            : undefined
        }
      />
    </>
  );
}

export function SidebarVerticalWorkspaceTabs({
  workspace,
  badgeMode,
  onWorkspacePress,
  statusBucketFilter = null,
  projectLine = null,
  limitRecentTabs = true,
}: {
  workspace: SidebarWorkspaceEntry;
  badgeMode: SidebarBadgeMode;
  onWorkspacePress?: () => void;
  statusBucketFilter?: StatusBucket | null;
  projectLine?: EmbeddedTabProjectLine | null;
  limitRecentTabs?: boolean;
}) {
  const [showAllTabs, setShowAllTabs] = useState(false);

  useEffect(() => {
    setShowAllTabs(false);
  }, [workspace.workspaceKey]);

  return (
    <EmbeddedWorkspaceTabs
      workspace={workspace}
      badgeMode={badgeMode}
      expanded
      showAllTabs={showAllTabs}
      onShowAllTabsChange={setShowAllTabs}
      onWorkspacePress={onWorkspacePress}
      statusBucketFilter={statusBucketFilter}
      projectLine={projectLine}
      limitRecentTabs={limitRecentTabs}
    />
  );
}

function EmbeddedTabsVisibilityToggle({
  expanded,
  totalTabCount,
  onPress,
}: {
  expanded: boolean;
  totalTabCount: number;
  onPress: () => void;
}) {
  return (
    <SidebarShowAllToggle
      expanded={expanded}
      totalCount={totalTabCount}
      testID="sidebar-embedded-tabs-visibility-toggle"
      onPress={onPress}
    />
  );
}

interface WorkspaceRowItemProps {
  workspace: SidebarWorkspaceEntry;
  badgeMode: SidebarBadgeMode;
  tabStatusSummary: SidebarTabStatusSummary;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  canCopyBranchName: boolean;
  isCreating?: boolean;
  selectionEnabled: boolean;
  serverId: string | null;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  onWorkspacePress?: () => void;
  drag?: () => void;
  isDragging?: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  workspaceKeysForAutoCollapse: readonly string[];
  statusSummaryToggleActive?: boolean;
  onStatusSummaryPress?: (event: GestureResponderEvent) => void;
}

function WorkspaceRowItem({
  workspace,
  badgeMode,
  tabStatusSummary,
  shortcutNumber,
  showShortcutBadge,
  canCopyBranchName,
  isCreating = false,
  selectionEnabled,
  serverId,
  activeWorkspaceSelection,
  onWorkspacePress,
  drag,
  isDragging = false,
  dragHandleProps,
  workspaceKeysForAutoCollapse,
  statusSummaryToggleActive,
  onStatusSummaryPress,
}: WorkspaceRowItemProps) {
  const handlePress = useCallback(() => {
    if (!serverId) {
      return;
    }
    onWorkspacePress?.();
    navigateToWorkspace(serverId, workspace.workspaceId);
  }, [serverId, onWorkspacePress, workspace.workspaceId]);

  return (
    <WorkspaceRow
      workspace={workspace}
      badgeMode={badgeMode}
      tabStatusSummary={tabStatusSummary}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      canCopyBranchName={canCopyBranchName}
      isCreating={isCreating}
      selected={isWorkspaceSelected({
        selection: activeWorkspaceSelection,
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
        enabled: selectionEnabled,
      })}
      onPress={handlePress}
      onWorkspacePress={onWorkspacePress}
      drag={drag ?? noop}
      isDragging={isDragging}
      dragHandleProps={dragHandleProps}
      workspaceKeysForAutoCollapse={workspaceKeysForAutoCollapse}
      statusSummaryToggleActive={statusSummaryToggleActive}
      onStatusSummaryPress={onStatusSummaryPress}
    />
  );
}

function areWorkspaceRowItemPropsEqual(
  previous: WorkspaceRowItemProps,
  next: WorkspaceRowItemProps,
): boolean {
  const previousSelected = isWorkspaceSelected({
    selection: previous.activeWorkspaceSelection,
    serverId: previous.workspace.serverId,
    workspaceId: previous.workspace.workspaceId,
    enabled: previous.selectionEnabled,
  });
  const nextSelected = isWorkspaceSelected({
    selection: next.activeWorkspaceSelection,
    serverId: next.workspace.serverId,
    workspaceId: next.workspace.workspaceId,
    enabled: next.selectionEnabled,
  });
  return (
    previous.workspace === next.workspace &&
    previous.badgeMode === next.badgeMode &&
    previous.tabStatusSummary === next.tabStatusSummary &&
    previous.shortcutNumber === next.shortcutNumber &&
    previous.showShortcutBadge === next.showShortcutBadge &&
    previous.canCopyBranchName === next.canCopyBranchName &&
    previous.isCreating === next.isCreating &&
    previous.serverId === next.serverId &&
    previous.onWorkspacePress === next.onWorkspacePress &&
    previous.drag === next.drag &&
    previous.isDragging === next.isDragging &&
    previous.dragHandleProps === next.dragHandleProps &&
    previous.workspaceKeysForAutoCollapse === next.workspaceKeysForAutoCollapse &&
    previous.statusSummaryToggleActive === next.statusSummaryToggleActive &&
    previous.onStatusSummaryPress === next.onStatusSummaryPress &&
    previousSelected === nextSelected
  );
}

const MemoWorkspaceRowItem = memo(WorkspaceRowItem, areWorkspaceRowItemPropsEqual);

function WorkspaceRow({
  workspace,
  badgeMode,
  tabStatusSummary,
  shortcutNumber,
  showShortcutBadge,
  onPress,
  onWorkspacePress,
  drag,
  isDragging,
  dragHandleProps,
  canCopyBranchName,
  isCreating = false,
  selected,
  workspaceKeysForAutoCollapse,
  statusSummaryToggleActive = false,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  badgeMode: SidebarBadgeMode;
  tabStatusSummary: SidebarTabStatusSummary;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  onPress: () => void;
  onWorkspacePress?: () => void;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  canCopyBranchName: boolean;
  isCreating?: boolean;
  selected: boolean;
  workspaceKeysForAutoCollapse: readonly string[];
  statusSummaryToggleActive?: boolean;
  onStatusSummaryPress?: (event: GestureResponderEvent) => void;
}) {
  const hydratedWorkspace = useSidebarWorkspaceEntry(workspace.serverId, workspace.workspaceId);

  if (!hydratedWorkspace) {
    return null;
  }

  return (
    <WorkspaceRowWithMenu
      workspace={hydratedWorkspace}
      badgeMode={badgeMode}
      tabStatusSummary={tabStatusSummary}
      selected={selected}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      onPress={onPress}
      onWorkspacePress={onWorkspacePress}
      drag={drag}
      isDragging={isDragging}
      dragHandleProps={dragHandleProps}
      canCopyBranchName={canCopyBranchName}
      workspaceKeysForAutoCollapse={workspaceKeysForAutoCollapse}
      isCreating={isCreating}
      statusSummaryToggleActive={statusSummaryToggleActive}
      onStatusSummaryPress={onStatusSummaryPress}
    />
  );
}

function ProjectBlock({
  project,
  collapsed,
  displayName,
  iconDataUri,
  serverId,
  canRemoveProject,
  selectionEnabled,
  badgeMode,
  showShortcutBadges,
  shortcutIndexByWorkspaceKey,
  parentGestureRef,
  onToggleCollapsed,
  onWorkspacePress,
  onWorkspaceReorder,
  onWorktreeCreated,
  drag,
  isDragging,
  dragHandleProps,
  useNestable,
  creatingWorkspaceIds,
  activeWorkspaceSelection,
  workspaceKeysForAutoCollapse,
  workspaceSortMode,
  workspaceShowLastCount,
  groupMode,
  tabLayoutMode,
  onEnterStatusMode,
  onExitStatusMode,
}: {
  project: SidebarProjectEntry;
  collapsed: boolean;
  displayName: string;
  iconDataUri: string | null;
  serverId: string | null;
  canRemoveProject: boolean;
  selectionEnabled: boolean;
  badgeMode: SidebarBadgeMode;
  showShortcutBadges: boolean;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  parentGestureRef?: MutableRefObject<GestureType | undefined>;
  onToggleCollapsed: (project: SidebarProjectEntry) => void;
  onWorkspacePress?: () => void;
  onWorkspaceReorder: (projectKey: string, workspaces: SidebarWorkspaceEntry[]) => void;
  onWorktreeCreated?: (workspaceId: string) => void;
  drag: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableListDragHandleProps;
  useNestable: boolean;
  creatingWorkspaceIds: ReadonlySet<string>;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  workspaceKeysForAutoCollapse: readonly string[];
  workspaceSortMode: SidebarWorkspaceSortMode;
  workspaceShowLastCount: SidebarWorkspaceShowLastCount;
  groupMode: "project" | "status";
  tabLayoutMode: AppTabLayoutMode;
  onEnterStatusMode: () => void;
  onExitStatusMode: () => void;
}) {
  const rowModel = useMemo(
    () =>
      buildSidebarProjectRowModel({
        project,
        collapsed,
      }),
    [collapsed, project],
  );

  const active = isProjectSelectedByRoute({
    selection: activeWorkspaceSelection,
    serverId,
    project,
    enabled: selectionEnabled,
  });
  const projectStatusModeActive = groupMode === "status" && active;
  const showScopedStatusContent = projectStatusModeActive && project.workspaces.length > 0;
  const [showAllWorkspaces, setShowAllWorkspaces] = useState(false);
  useEffect(() => {
    setShowAllWorkspaces(false);
  }, [project.projectKey, workspaceShowLastCount]);
  const projectWorkspaceIds = useMemo(
    () => new Set(project.workspaces.map((workspace) => workspace.workspaceId)),
    [project.workspaces],
  );
  const projectAgentCount = useSessionStore((state) => {
    if (!serverId) {
      return 0;
    }
    const agents = state.sessions[serverId]?.agents;
    if (!agents) {
      return 0;
    }
    let count = 0;
    for (const agent of agents.values()) {
      const workspaceId = agent.workspaceId;
      if (agent.archivedAt || !workspaceId || !projectWorkspaceIds.has(workspaceId)) {
        continue;
      }
      count += 1;
    }
    return count;
  });
  const tabStatusSummaries = useSidebarTabStatusSummaries({
    workspaces: project.workspaces,
    enabled: collapsed || badgeMode === "status",
  });
  const projectStatusSummary = useMemo(() => {
    if (!collapsed && badgeMode !== "status") {
      return null;
    }
    return combineSidebarTabStatusSummaries(
      project.workspaces.map(
        (workspace) => tabStatusSummaries.get(workspace.workspaceKey) ?? EMPTY_TAB_STATUS_SUMMARY,
      ),
    );
  }, [badgeMode, collapsed, project.workspaces, tabStatusSummaries]);
  const projectLeadingStatusKind =
    badgeMode === "status" || !projectStatusSummary
      ? null
      : getPrimarySidebarEntryStatusKind(projectStatusSummary, {
          excludeKinds: WORKSPACE_PROJECT_STATUS_EXCLUDED_KINDS,
        });
  const selectedWorkspaceKey = useMemo(
    () =>
      getSelectedWorkspaceKey({
        project,
        selection: activeWorkspaceSelection,
        serverId,
        selectionEnabled,
      }),
    [activeWorkspaceSelection, project, selectionEnabled, serverId],
  );

  const renderWorkspaceRow = useCallback(
    (
      item: SidebarWorkspaceEntry,
      input?: {
        drag?: () => void;
        isDragging?: boolean;
        dragHandleProps?: DraggableListDragHandleProps;
      },
    ) => {
      return (
        <MemoWorkspaceRowItem
          workspace={item}
          badgeMode={badgeMode}
          tabStatusSummary={tabStatusSummaries.get(item.workspaceKey) ?? EMPTY_TAB_STATUS_SUMMARY}
          shortcutNumber={shortcutIndexByWorkspaceKey.get(item.workspaceKey) ?? null}
          showShortcutBadge={showShortcutBadges}
          canCopyBranchName={project.projectKind === "git"}
          isCreating={creatingWorkspaceIds.has(item.workspaceId)}
          selectionEnabled={selectionEnabled}
          serverId={serverId}
          activeWorkspaceSelection={activeWorkspaceSelection}
          onWorkspacePress={onWorkspacePress}
          drag={input?.drag}
          isDragging={input?.isDragging}
          dragHandleProps={input?.dragHandleProps}
          workspaceKeysForAutoCollapse={workspaceKeysForAutoCollapse}
          statusSummaryToggleActive={groupMode === "status"}
          onStatusSummaryPress={
            selectedWorkspaceKey === item.workspaceKey ? onEnterStatusMode : undefined
          }
        />
      );
    },
    [
      project.projectKind,
      activeWorkspaceSelection,
      badgeMode,
      creatingWorkspaceIds,
      onWorkspacePress,
      onEnterStatusMode,
      serverId,
      selectionEnabled,
      selectedWorkspaceKey,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
      tabStatusSummaries,
      workspaceKeysForAutoCollapse,
      groupMode,
    ],
  );

  const renderWorkspace = useCallback(
    ({
      item,
      drag: workspaceDrag,
      isActive,
      dragHandleProps: workspaceDragHandleProps,
    }: DraggableRenderItemInfo<SidebarWorkspaceEntry>) => {
      return renderWorkspaceRow(item, {
        drag: workspaceDrag,
        isDragging: isActive,
        dragHandleProps: workspaceDragHandleProps,
      });
    },
    [renderWorkspaceRow],
  );

  const handleWorkspaceDragEnd = useCallback(
    (workspaces: SidebarWorkspaceEntry[]) => {
      onWorkspaceReorder(project.projectKey, workspaces);
    },
    [onWorkspaceReorder, project.projectKey],
  );
  const setWorkspacesCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setWorkspacesCollapsed,
  );
  const visibleWorkspaceResult = useMemo(
    () =>
      applySidebarShowLastCount({
        items: project.workspaces,
        showLastCount: workspaceShowLastCount,
        showAll: showAllWorkspaces,
        forceIncludeKey: selectedWorkspaceKey,
        getKey: workspaceKeyExtractor,
      }),
    [project.workspaces, selectedWorkspaceKey, showAllWorkspaces, workspaceShowLastCount],
  );
  const handleToggleShowAllWorkspaces = useCallback(() => {
    setShowAllWorkspaces((current) => !current);
  }, []);

  const toast = useToast();
  const { t } = useTranslation();
  const [isRemovingProject, setIsRemovingProject] = useState(false);

  const handleRemoveProject = useCallback(() => {
    if (isRemovingProject || !serverId) {
      return;
    }

    void (async () => {
      const confirmed = await confirmDialog({
        title: t("sidebar.project.confirmations.removeTitle"),
        message: t("sidebar.project.confirmations.removeMessage", { projectName: displayName }),
        confirmLabel: t("sidebar.project.confirmations.removeConfirm"),
        cancelLabel: t("sidebar.project.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      const client = getHostRuntimeStore().getClient(serverId);
      if (!client) {
        toast.error(t("sidebar.project.toasts.hostDisconnected"));
        return;
      }
      if (!canRemoveProject) {
        toast.error(t("sidebar.project.toasts.updateHostToRemove"));
        return;
      }

      setIsRemovingProject(true);
      void client
        .removeProject(project.projectKey)
        .catch((error) => {
          toast.error(
            error instanceof Error ? error.message : t("sidebar.project.toasts.removeFailed"),
          );
        })
        .finally(() => {
          setIsRemovingProject(false);
        });
    })();
  }, [isRemovingProject, serverId, displayName, t, toast, project.projectKey, canRemoveProject]);

  const handleToggleCollapsed = useCallback(
    (event: GestureResponderEvent) => {
      if (projectStatusModeActive) {
        onExitStatusMode();
        return;
      }
      if (isShiftPressed(event)) {
        setWorkspacesCollapsed(
          project.workspaces.map((workspace) => workspace.workspaceKey),
          !collapsed,
        );
      }
      onToggleCollapsed(project);
    },
    [
      collapsed,
      onExitStatusMode,
      onToggleCollapsed,
      project,
      projectStatusModeActive,
      setWorkspacesCollapsed,
    ],
  );

  let workspaceRows: ReactNode = null;
  if (showScopedStatusContent) {
    workspaceRows = (
      <ProjectScopedStatusContent
        project={project}
        serverId={serverId}
        tabLayoutMode={tabLayoutMode}
        badgeMode={badgeMode}
        workspaceSortMode={workspaceSortMode}
        workspaceShowLastCount={workspaceShowLastCount}
        shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
        showShortcutBadges={showShortcutBadges}
        tabStatusSummaries={tabStatusSummaries}
        selectedWorkspaceKey={selectedWorkspaceKey}
        onWorkspacePress={onWorkspacePress}
        onExitStatusMode={onExitStatusMode}
      />
    );
  } else if (groupMode === "project" && !collapsed && project.workspaces.length > 0) {
    const workspaceVisibilityToggle = visibleWorkspaceResult.shouldShowVisibilityToggle ? (
      <SidebarShowAllToggle
        expanded={showAllWorkspaces}
        totalCount={project.workspaces.length}
        testID={`sidebar-workspaces-visibility-toggle-${project.projectKey}`}
        onPress={handleToggleShowAllWorkspaces}
      />
    ) : null;
    workspaceRows =
      workspaceSortMode === "manual" ? (
        <>
          <DraggableList
            testID={`sidebar-workspace-list-${project.projectKey}`}
            data={visibleWorkspaceResult.visibleItems}
            keyExtractor={workspaceKeyExtractor}
            renderItem={renderWorkspace}
            onDragEnd={handleWorkspaceDragEnd}
            extraData={activeWorkspaceSelectionKey(activeWorkspaceSelection)}
            scrollEnabled={false}
            useDragHandle
            nestable={useNestable}
            simultaneousGestureRef={parentGestureRef}
            containerStyle={styles.workspaceListContainer}
          />
          {workspaceVisibilityToggle}
        </>
      ) : (
        <View
          style={styles.workspaceListContainer}
          testID={`sidebar-workspace-list-${project.projectKey}`}
        >
          {visibleWorkspaceResult.visibleItems.map((workspace) => (
            <View key={workspace.workspaceKey}>{renderWorkspaceRow(workspace)}</View>
          ))}
          {workspaceVisibilityToggle}
        </View>
      );
  }

  return (
    <View style={styles.projectBlock}>
      <ProjectHeaderRowWithMenu
        project={project}
        displayName={displayName}
        iconDataUri={iconDataUri}
        workspaceCount={project.workspaces.length}
        agentCount={projectAgentCount}
        workspace={null}
        statusSummary={projectStatusSummary}
        showStatusSummary={badgeMode === "status" && collapsed}
        leadingStatusKind={projectLeadingStatusKind}
        highlightState={getProjectAncestorHighlighted(active)}
        chevron={rowModel.chevron}
        onPress={handleToggleCollapsed}
        serverId={serverId}
        canCreateWorktree={rowModel.trailingAction.kind === "new_workspace"}
        isProjectActive={active}
        onWorkspacePress={onWorkspacePress}
        onWorktreeCreated={onWorktreeCreated}
        drag={drag}
        isDragging={isDragging}
        isArchiving={isRemovingProject}
        onRemoveProject={handleRemoveProject}
        removeProjectStatus={isRemovingProject ? "pending" : "idle"}
        dragHandleProps={dragHandleProps}
      />

      {workspaceRows}
    </View>
  );
}

function ProjectScopedStatusContent({
  project,
  serverId,
  tabLayoutMode,
  badgeMode,
  workspaceSortMode,
  workspaceShowLastCount,
  shortcutIndexByWorkspaceKey,
  showShortcutBadges,
  tabStatusSummaries,
  selectedWorkspaceKey,
  onWorkspacePress,
  onExitStatusMode,
}: {
  project: SidebarProjectEntry;
  serverId: string | null;
  tabLayoutMode: AppTabLayoutMode;
  badgeMode: SidebarBadgeMode;
  workspaceSortMode: SidebarWorkspaceSortMode;
  workspaceShowLastCount: SidebarWorkspaceShowLastCount;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  showShortcutBadges: boolean;
  tabStatusSummaries: Map<string, SidebarTabStatusSummary>;
  selectedWorkspaceKey: string | null;
  onWorkspacePress?: () => void;
  onExitStatusMode: () => void;
}) {
  const scopedStatusWorkspaces = useStatusModeWorkspaceEntries({
    serverId,
    projects: [project],
  });
  const scopedStatusTabGroups = useSidebarStatusTabWorkspaceGroups({
    projects: tabLayoutMode === "sidebar" ? [project] : [],
    serverId: tabLayoutMode === "sidebar" ? serverId : null,
  });
  const collapsedStatusGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedStatusGroupKeys,
  );
  const projectNamesByKey = useMemo(
    () => new Map([[project.projectKey, project.projectName]]),
    [project.projectKey, project.projectName],
  );
  const projectIconByProjectKey = useMemo(() => new Map<string, string | null>(), []);

  if (tabLayoutMode === "sidebar") {
    return (
      <View
        style={styles.workspaceListContainer}
        testID={`sidebar-status-tabs-${project.projectKey}`}
      >
        <SidebarStatusTabGroups
          groups={scopedStatusTabGroups}
          collapsedStatusGroupKeys={collapsedStatusGroupKeys}
          badgeMode={badgeMode}
          projectIconByProjectKey={projectIconByProjectKey}
          lineKind="workspace"
          onWorkspacePress={onWorkspacePress}
        />
      </View>
    );
  }

  return (
    <SidebarStatusWorkspaceList
      workspaces={scopedStatusWorkspaces}
      projectNamesByKey={projectNamesByKey}
      serverId={serverId}
      shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
      showShortcutBadges={showShortcutBadges}
      badgeMode={badgeMode}
      workspaceSortMode={workspaceSortMode}
      workspaceShowLastCount={workspaceShowLastCount}
      tabStatusSummaries={tabStatusSummaries}
      onWorkspacePress={onWorkspacePress}
      statusSummaryToggleActiveWorkspaceKey={selectedWorkspaceKey}
      onStatusSummaryTogglePress={onExitStatusMode}
      embedded
    />
  );
}

type ProjectBlockProps = Parameters<typeof ProjectBlock>[0];

function areProjectBlockPropsEqual(previous: ProjectBlockProps, next: ProjectBlockProps): boolean {
  return (
    areProjectBlockStablePropsEqual(previous, next) &&
    areProjectBlockSelectionsEqual(previous, next)
  );
}

function areProjectBlockStablePropsEqual(
  previous: ProjectBlockProps,
  next: ProjectBlockProps,
): boolean {
  return (
    areProjectBlockDataPropsEqual(previous, next) &&
    areProjectBlockActionPropsEqual(previous, next) &&
    areProjectBlockDragPropsEqual(previous, next)
  );
}

function areProjectBlockDataPropsEqual(
  previous: ProjectBlockProps,
  next: ProjectBlockProps,
): boolean {
  return (
    previous.project === next.project &&
    previous.collapsed === next.collapsed &&
    previous.displayName === next.displayName &&
    previous.iconDataUri === next.iconDataUri &&
    previous.serverId === next.serverId &&
    previous.canRemoveProject === next.canRemoveProject &&
    previous.selectionEnabled === next.selectionEnabled &&
    previous.badgeMode === next.badgeMode &&
    previous.groupMode === next.groupMode &&
    previous.tabLayoutMode === next.tabLayoutMode &&
    previous.workspaceSortMode === next.workspaceSortMode &&
    previous.workspaceShowLastCount === next.workspaceShowLastCount &&
    previous.showShortcutBadges === next.showShortcutBadges &&
    previous.shortcutIndexByWorkspaceKey === next.shortcutIndexByWorkspaceKey &&
    previous.creatingWorkspaceIds === next.creatingWorkspaceIds &&
    previous.workspaceKeysForAutoCollapse === next.workspaceKeysForAutoCollapse
  );
}

function areProjectBlockActionPropsEqual(
  previous: ProjectBlockProps,
  next: ProjectBlockProps,
): boolean {
  return (
    previous.parentGestureRef === next.parentGestureRef &&
    previous.onToggleCollapsed === next.onToggleCollapsed &&
    previous.onWorkspacePress === next.onWorkspacePress &&
    previous.onWorkspaceReorder === next.onWorkspaceReorder &&
    previous.onWorktreeCreated === next.onWorktreeCreated &&
    previous.onEnterStatusMode === next.onEnterStatusMode &&
    previous.onExitStatusMode === next.onExitStatusMode
  );
}

function areProjectBlockDragPropsEqual(
  previous: ProjectBlockProps,
  next: ProjectBlockProps,
): boolean {
  return (
    previous.drag === next.drag &&
    previous.isDragging === next.isDragging &&
    previous.dragHandleProps === next.dragHandleProps &&
    previous.useNestable === next.useNestable
  );
}

function areProjectBlockSelectionsEqual(
  previous: ProjectBlockProps,
  next: ProjectBlockProps,
): boolean {
  const previousActive = isProjectSelectedByRoute({
    selection: previous.activeWorkspaceSelection,
    project: previous.project,
    serverId: previous.serverId,
    enabled: previous.selectionEnabled,
  });
  const nextActive = isProjectSelectedByRoute({
    selection: next.activeWorkspaceSelection,
    project: next.project,
    serverId: next.serverId,
    enabled: next.selectionEnabled,
  });
  if (previousActive !== nextActive) {
    return false;
  }
  if (!previousActive) {
    return true;
  }
  return (
    activeWorkspaceSelectionKey(previous.activeWorkspaceSelection) ===
    activeWorkspaceSelectionKey(next.activeWorkspaceSelection)
  );
}

const MemoProjectBlock = memo(ProjectBlock, areProjectBlockPropsEqual);

function SingleProjectWorkspaceBody({
  project,
  badgeMode,
  showShortcutBadges,
  shortcutIndexByWorkspaceKey,
  parentGestureRef,
  onWorkspacePress,
  onWorkspaceReorder,
  creatingWorkspaceIds,
  activeWorkspaceSelection,
  workspaceKeysForAutoCollapse,
  workspaceSortMode,
  serverId,
  selectionEnabled,
  useNestable,
}: {
  project: SidebarProjectEntry;
  badgeMode: SidebarBadgeMode;
  showShortcutBadges: boolean;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  parentGestureRef?: MutableRefObject<GestureType | undefined>;
  onWorkspacePress?: () => void;
  onWorkspaceReorder: (projectKey: string, workspaces: SidebarWorkspaceEntry[]) => void;
  creatingWorkspaceIds: ReadonlySet<string>;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  workspaceKeysForAutoCollapse: readonly string[];
  workspaceSortMode: SidebarWorkspaceSortMode;
  serverId: string | null;
  selectionEnabled: boolean;
  useNestable: boolean;
}) {
  const tabStatusSummaries = useSidebarTabStatusSummaries({
    workspaces: project.workspaces,
    enabled: badgeMode === "status",
  });

  const renderWorkspaceRow = useCallback(
    (
      item: SidebarWorkspaceEntry,
      input?: {
        drag?: () => void;
        isDragging?: boolean;
        dragHandleProps?: DraggableListDragHandleProps;
      },
    ) => (
      <MemoWorkspaceRowItem
        workspace={item}
        badgeMode={badgeMode}
        tabStatusSummary={tabStatusSummaries.get(item.workspaceKey) ?? EMPTY_TAB_STATUS_SUMMARY}
        shortcutNumber={shortcutIndexByWorkspaceKey.get(item.workspaceKey) ?? null}
        showShortcutBadge={showShortcutBadges}
        canCopyBranchName={project.projectKind === "git"}
        isCreating={creatingWorkspaceIds.has(item.workspaceId)}
        selectionEnabled={selectionEnabled}
        serverId={serverId}
        activeWorkspaceSelection={activeWorkspaceSelection}
        onWorkspacePress={onWorkspacePress}
        drag={input?.drag}
        isDragging={input?.isDragging}
        dragHandleProps={input?.dragHandleProps}
        workspaceKeysForAutoCollapse={workspaceKeysForAutoCollapse}
      />
    ),
    [
      activeWorkspaceSelection,
      badgeMode,
      creatingWorkspaceIds,
      onWorkspacePress,
      project.projectKind,
      selectionEnabled,
      serverId,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
      tabStatusSummaries,
      workspaceKeysForAutoCollapse,
    ],
  );

  const renderWorkspace = useCallback(
    ({
      item,
      drag: workspaceDrag,
      isActive,
      dragHandleProps: workspaceDragHandleProps,
    }: DraggableRenderItemInfo<SidebarWorkspaceEntry>) =>
      renderWorkspaceRow(item, {
        drag: workspaceDrag,
        isDragging: isActive,
        dragHandleProps: workspaceDragHandleProps,
      }),
    [renderWorkspaceRow],
  );

  const handleWorkspaceDragEnd = useCallback(
    (workspaces: SidebarWorkspaceEntry[]) => {
      onWorkspaceReorder(project.projectKey, workspaces);
    },
    [onWorkspaceReorder, project.projectKey],
  );

  if (project.workspaces.length === 0) {
    return <View style={styles.singleProjectEmpty} />;
  }

  if (workspaceSortMode === "manual") {
    return (
      <DraggableList
        testID={`sidebar-single-project-workspace-list-${project.projectKey}`}
        data={project.workspaces}
        keyExtractor={workspaceKeyExtractor}
        renderItem={renderWorkspace}
        onDragEnd={handleWorkspaceDragEnd}
        extraData={activeWorkspaceSelectionKey(activeWorkspaceSelection)}
        scrollEnabled={false}
        useDragHandle
        nestable={useNestable}
        simultaneousGestureRef={parentGestureRef}
        containerStyle={styles.workspaceListContainer}
      />
    );
  }

  return (
    <View
      style={styles.workspaceListContainer}
      testID={`sidebar-single-project-workspace-list-${project.projectKey}`}
    >
      {project.workspaces.map((workspace) => (
        <View key={workspace.workspaceKey}>{renderWorkspaceRow(workspace)}</View>
      ))}
    </View>
  );
}

function SidebarProjectSelectorBar({
  projects,
  selectedProjectKey,
  iconPresentationByProjectKey,
  statusByWorkspaceKey,
  reduceMotionEnabled,
  manualSortEnabled,
  onProjectReorder,
  onSelectProject,
}: {
  projects: SidebarProjectEntry[];
  selectedProjectKey: string | null;
  iconPresentationByProjectKey: Map<string, ProjectIconPresentation>;
  statusByWorkspaceKey: ReadonlyMap<string, SidebarWorkspaceEntry["statusBucket"]>;
  reduceMotionEnabled: boolean;
  manualSortEnabled: boolean;
  onProjectReorder: (projects: SidebarProjectEntry[]) => void;
  onSelectProject?: (projectKey: string) => void;
}) {
  const renderProject = useCallback(
    ({ item, isActive }: DraggableRenderItemInfo<SidebarProjectEntry>) => {
      const statusCounts = getProjectStatusCountsFromStatuses({
        workspaceKeys: item.workspaces.map((workspace) => workspace.workspaceKey),
        statusByWorkspaceKey,
      });
      return (
        <ProjectSelectorCapsule
          project={item}
          selected={item.projectKey === selectedProjectKey}
          iconPresentation={
            iconPresentationByProjectKey.get(item.projectKey) ?? EMPTY_PROJECT_ICON_PRESENTATION
          }
          statusCounts={statusCounts}
          reduceMotionEnabled={reduceMotionEnabled}
          isDragging={isActive}
          onSelectProject={onSelectProject}
        />
      );
    },
    [
      iconPresentationByProjectKey,
      onSelectProject,
      reduceMotionEnabled,
      selectedProjectKey,
      statusByWorkspaceKey,
    ],
  );

  return (
    <View style={styles.projectSelectorBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.projectSelectorContent}
        testID="sidebar-project-selector"
      >
        <SortableInlineList
          data={projects}
          keyExtractor={projectKeyExtractor}
          renderItem={renderProject}
          onDragEnd={manualSortEnabled ? onProjectReorder : undefined}
          disabled={!manualSortEnabled}
          activationDistance={6}
        />
      </ScrollView>
    </View>
  );
}

function ProjectSelectorCapsule({
  project,
  selected,
  iconPresentation,
  statusCounts,
  reduceMotionEnabled,
  isDragging,
  onSelectProject,
}: {
  project: SidebarProjectEntry;
  selected: boolean;
  iconPresentation: ProjectIconPresentation;
  statusCounts: SidebarProjectStatusCounts;
  reduceMotionEnabled: boolean;
  isDragging: boolean;
  onSelectProject?: (projectKey: string) => void;
}) {
  const selectedProgress = useReanimatedSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selectedProgress.value = withReanimatedTiming(selected ? 1 : 0, {
      duration: reduceMotionEnabled ? 0 : PROJECT_SELECTOR_TRANSITION_MS,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
  }, [reduceMotionEnabled, selected, selectedProgress]);

  const capsuleAnimatedStyle = useReanimatedAnimatedStyle(() => {
    const progress = selectedProgress.value;
    return {
      width:
        PROJECT_SELECTOR_IDLE_SIZE +
        (PROJECT_SELECTOR_SELECTED_SIZE - PROJECT_SELECTOR_IDLE_SIZE) * progress,
      height:
        PROJECT_SELECTOR_IDLE_SIZE +
        (PROJECT_SELECTOR_SELECTED_SIZE - PROJECT_SELECTOR_IDLE_SIZE) * progress,
      paddingHorizontal:
        PROJECT_SELECTOR_IDLE_PADDING_HORIZONTAL +
        (PROJECT_SELECTOR_SELECTED_PADDING_HORIZONTAL - PROJECT_SELECTOR_IDLE_PADDING_HORIZONTAL) *
          progress,
      marginBottom:
        PROJECT_SELECTOR_IDLE_MARGIN_BOTTOM +
        (PROJECT_SELECTOR_SELECTED_MARGIN_BOTTOM - PROJECT_SELECTOR_IDLE_MARGIN_BOTTOM) * progress,
    };
  });

  const handlePress = useCallback(() => {
    onSelectProject?.(project.projectKey);
  }, [onSelectProject, project.projectKey]);

  const layoutTransition = reduceMotionEnabled ? undefined : PROJECT_SELECTOR_LAYOUT_TRANSITION;
  const backgroundStyle = useMemo(
    () =>
      iconPresentation.backgroundColor
        ? { backgroundColor: iconPresentation.backgroundColor }
        : styles.projectSelectorCapsuleFallback,
    [iconPresentation.backgroundColor],
  );
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const capsuleStyle = useMemo(
    () => [
      styles.projectSelectorCapsule,
      backgroundStyle,
      selected && styles.projectSelectorCapsuleSelected,
      isDragging && styles.projectSelectorCapsuleDragging,
      capsuleAnimatedStyle,
    ],
    [backgroundStyle, capsuleAnimatedStyle, isDragging, selected],
  );
  const pressedCapsuleStyle = useMemo(
    () => [...capsuleStyle, styles.projectSelectorCapsulePressed],
    [capsuleStyle],
  );
  const hoverCardContent = useMemo(
    () => createElement(ProjectSelectorHoverCardContent, { project }),
    [project],
  );

  return (
    <InfoHoverCard
      content={hoverCardContent}
      accessibilityLabel={project.projectName}
      testID={`sidebar-project-selector-hover-card-${project.projectKey}`}
      isDragging={isDragging}
      placement="bottom"
    >
      <ReanimatedAnimated.View
        layout={layoutTransition}
        style={styles.projectSelectorCapsuleLayoutItem}
      >
        <Pressable
          accessibilityRole={platformIsWeb ? undefined : "button"}
          accessibilityLabel={project.projectName}
          accessibilityState={accessibilityState}
          onPress={handlePress}
          testID={`sidebar-project-selector-${project.projectKey}`}
        >
          {({ pressed }) => (
            <ReanimatedAnimated.View style={pressed ? pressedCapsuleStyle : capsuleStyle}>
              <ProjectIconView
                iconDataUri={iconPresentation.dataUri}
                initial={projectIconPlaceholderLabelFromDisplayName(project.projectName)}
                projectKey={project.projectKey}
                imageStyle={styles.projectSelectorIcon}
                fallbackStyle={styles.projectSelectorIconFallback}
                textStyle={styles.projectSelectorIconFallbackText}
              />
              <ProjectSelectorStatusBadges counts={statusCounts} />
            </ReanimatedAnimated.View>
          )}
        </Pressable>
      </ReanimatedAnimated.View>
    </InfoHoverCard>
  );
}

function ProjectSelectorHoverCardContent({ project }: { project: SidebarProjectEntry }) {
  const pathDisplay = shortenPath(project.iconWorkingDir);
  return (
    <>
      <View style={styles.embeddedTabHoverHeader}>
        <Text style={styles.embeddedTabHoverTitle} numberOfLines={2}>
          {project.projectName}
        </Text>
      </View>
      {pathDisplay ? (
        <SidebarHoverInfoRow
          icon={ThemedFolder}
          label={pathDisplay}
          testID={`sidebar-project-selector-path-${project.projectKey}`}
        />
      ) : null}
    </>
  );
}

function ProjectSelectorStatusBadges({ counts }: { counts: SidebarProjectStatusCounts }) {
  if (counts.failed === 0 && counts.needsInput === 0 && counts.attention === 0) {
    return null;
  }

  return (
    <View style={styles.projectSelectorStatusBadges}>
      {counts.failed > 0 ? (
        <ProjectSelectorStatusBadge count={counts.failed} style={styles.projectSelectorStatusRed} />
      ) : null}
      {counts.needsInput > 0 ? (
        <ProjectSelectorStatusBadge
          count={counts.needsInput}
          style={styles.projectSelectorStatusAmber}
        />
      ) : null}
      {counts.attention > 0 ? (
        <ProjectSelectorStatusBadge
          count={counts.attention}
          style={styles.projectSelectorStatusGreen}
        />
      ) : null}
    </View>
  );
}

function ProjectSelectorStatusBadge({
  count,
  style,
}: {
  count: number;
  style: StyleProp<ViewStyle>;
}) {
  const badgeStyle = useMemo(() => [styles.projectSelectorStatusBadge, style], [style]);
  return (
    <View style={badgeStyle}>
      <Text style={styles.projectSelectorStatusBadgeText}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

function useReduceMotionEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) {
        setEnabled(value);
      }
      return undefined;
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

export function SidebarWorkspaceList({
  projects,
  serverId,
  collapsedProjectKeys,
  onToggleProjectCollapsed,
  shortcutIndexByWorkspaceKey,
  groupMode,
  isRefreshing: _isRefreshing = false,
  onRefresh: _onRefresh,
  onWorkspacePress,
  onAddProject,
  listFooterComponent,
  singleProjectViewEnabled = false,
  singleProjectViewProject = null,
  onSingleProjectSelected,
  parentGestureRef,
}: SidebarWorkspaceListProps) {
  const pathname = usePathname();

  return (
    <ProjectModeList
      projects={projects}
      serverId={serverId}
      collapsedProjectKeys={collapsedProjectKeys}
      onToggleProjectCollapsed={onToggleProjectCollapsed}
      shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
      onWorkspacePress={onWorkspacePress}
      onAddProject={onAddProject}
      listFooterComponent={listFooterComponent}
      singleProjectViewEnabled={singleProjectViewEnabled}
      singleProjectViewProject={singleProjectViewProject}
      onSingleProjectSelected={onSingleProjectSelected}
      parentGestureRef={parentGestureRef}
      pathname={pathname}
      groupMode={groupMode}
    />
  );
}

export function SidebarStatusModeWrapper({
  serverId,
  projects,
  shortcutIndexByWorkspaceKey: _projectShortcutIndex,
  onWorkspacePress,
}: {
  serverId: string | null;
  projects: SidebarProjectEntry[];
  shortcutIndexByWorkspaceKey: Map<string, number>;
  onWorkspacePress?: () => void;
}) {
  const { settings: appSettings } = useAppSettings();
  const hydratedWorkspaces = useStatusModeWorkspaceEntries({
    serverId,
    projects,
  });
  const projectNamesByKey = useProjectNamesMap(serverId);
  const showShortcutBadges = useShowShortcutBadges();
  const badgeMode = useSidebarViewStore((state) =>
    serverId ? state.getBadgeMode(serverId) : "status",
  );
  const workspaceSortMode = useSidebarViewStore((state) =>
    serverId ? state.getWorkspaceSortMode(serverId) : "manual",
  );
  const workspaceShowLastCount = useSidebarViewStore((state) =>
    serverId ? state.getWorkspaceShowLastCount(serverId) : "all",
  );
  const tabStatusSummaries = useSidebarTabStatusSummaries({
    workspaces: hydratedWorkspaces,
    enabled: badgeMode === "status",
  });
  const projectIconTargets = useMemo(
    () => createProjectIconTargets(serverId, projects),
    [projects, serverId],
  );
  const projectIconByProjectKey = useProjectIconDataByProjectKey({
    projects: projectIconTargets,
  });

  if (appSettings.tabLayoutMode === "sidebar") {
    return (
      <SidebarStatusTabList
        projects={projects}
        serverId={serverId}
        badgeMode={badgeMode}
        projectIconByProjectKey={projectIconByProjectKey}
        onWorkspacePress={onWorkspacePress}
      />
    );
  }

  return (
    <SidebarStatusWorkspaceList
      workspaces={hydratedWorkspaces}
      projectNamesByKey={projectNamesByKey}
      serverId={serverId}
      shortcutIndexByWorkspaceKey={_projectShortcutIndex}
      showShortcutBadges={showShortcutBadges}
      badgeMode={badgeMode}
      workspaceSortMode={workspaceSortMode}
      workspaceShowLastCount={workspaceShowLastCount}
      tabStatusSummaries={tabStatusSummaries}
      onWorkspacePress={onWorkspacePress}
    />
  );
}

function SidebarStatusTabList({
  projects,
  serverId,
  badgeMode,
  projectIconByProjectKey,
  onWorkspacePress,
}: {
  projects: SidebarProjectEntry[];
  serverId: string | null;
  badgeMode: SidebarBadgeMode;
  projectIconByProjectKey: Map<string, string | null>;
  onWorkspacePress?: () => void;
}) {
  const groups = useSidebarStatusTabWorkspaceGroups({ projects, serverId });
  const collapsedStatusGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedStatusGroupKeys,
  );

  return (
    <View style={styles.container}>
      {platformIsNative ? (
        <NestableScrollContainer
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-status-tabs-scroll"
        >
          <SidebarStatusTabGroups
            groups={groups}
            collapsedStatusGroupKeys={collapsedStatusGroupKeys}
            badgeMode={badgeMode}
            projectIconByProjectKey={projectIconByProjectKey}
            onWorkspacePress={onWorkspacePress}
          />
        </NestableScrollContainer>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-status-tabs-scroll"
        >
          <SidebarStatusTabGroups
            groups={groups}
            collapsedStatusGroupKeys={collapsedStatusGroupKeys}
            badgeMode={badgeMode}
            projectIconByProjectKey={projectIconByProjectKey}
            onWorkspacePress={onWorkspacePress}
          />
        </ScrollView>
      )}
    </View>
  );
}

function SidebarStatusTabGroups({
  groups,
  collapsedStatusGroupKeys,
  badgeMode,
  projectIconByProjectKey,
  lineKind = "project",
  onWorkspacePress,
}: {
  groups: readonly StatusTabWorkspaceGroup[];
  collapsedStatusGroupKeys: ReadonlySet<string>;
  badgeMode: SidebarBadgeMode;
  projectIconByProjectKey: Map<string, string | null>;
  lineKind?: "project" | "workspace";
  onWorkspacePress?: () => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <View key={group.bucket} style={styles.statusGroupBlock}>
          <StatusTabGroupHeader
            bucket={group.bucket}
            collapsed={collapsedStatusGroupKeys.has(group.bucket)}
          />
          {!collapsedStatusGroupKeys.has(group.bucket) ? (
            <View
              style={styles.statusWorkspaceListContainer}
              testID={`sidebar-status-group-tabs-${group.bucket}`}
            >
              {group.rows.map(({ project, workspace }) => (
                <SidebarStatusProjectWorkspaceTabs
                  key={`${group.bucket}:${workspace.workspaceKey}`}
                  bucket={group.bucket}
                  project={project}
                  workspace={workspace}
                  badgeMode={badgeMode}
                  iconDataUri={projectIconByProjectKey.get(project.projectKey) ?? null}
                  lineKind={lineKind}
                  onWorkspacePress={onWorkspacePress}
                />
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

function SidebarStatusProjectWorkspaceTabs({
  bucket,
  project,
  workspace,
  badgeMode,
  iconDataUri,
  lineKind,
  onWorkspacePress,
}: {
  bucket: StatusBucket;
  project: SidebarProjectEntry;
  workspace: SidebarWorkspaceEntry;
  badgeMode: SidebarBadgeMode;
  iconDataUri: string | null;
  lineKind: "project" | "workspace";
  onWorkspacePress?: () => void;
}) {
  const { settings: appSettings } = useAppSettings();
  const projectLine = useMemo(
    () =>
      buildStatusTabLine({
        lineKind,
        project,
        workspace,
        iconDataUri,
        workspaceTitleSource: appSettings.workspaceTitleSource,
      }),
    [appSettings.workspaceTitleSource, iconDataUri, lineKind, project, workspace],
  );
  return (
    <SidebarVerticalWorkspaceTabs
      workspace={workspace}
      badgeMode={badgeMode}
      statusBucketFilter={bucket}
      projectLine={projectLine}
      limitRecentTabs={false}
      onWorkspacePress={onWorkspacePress}
    />
  );
}

function StatusTabGroupHeader({ bucket, collapsed }: { bucket: StatusBucket; collapsed: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const toggleStatusGroupCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleStatusGroupCollapsed,
  );
  const handlePress = useCallback(() => {
    toggleStatusGroupCollapsed(bucket);
  }, [bucket, toggleStatusGroupCollapsed]);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const rowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.statusGroupRow,
      isHovered && styles.statusGroupRowHovered,
      pressed && styles.statusGroupRowPressed,
    ],
    [isHovered],
  );
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);

  return (
    <View onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
      <Pressable
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel={`${STATUS_BUCKET_LABELS[bucket]} status group`}
        accessibilityState={accessibilityState}
        style={rowStyle}
        onPress={handlePress}
        testID={`sidebar-status-group-${bucket}`}
      >
        <View style={styles.statusGroupRowLeft}>
          <View style={styles.statusGroupLeadingVisualSlot}>
            <StatusTabGroupLeadingVisual
              bucket={bucket}
              collapsed={collapsed}
              showChevron={isHovered}
            />
          </View>
          <View style={styles.statusGroupTitleGroup}>
            <Text style={styles.statusGroupTitle} numberOfLines={1}>
              {STATUS_BUCKET_LABELS[bucket]}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function StatusTabGroupLeadingVisual({
  bucket,
  collapsed,
  showChevron,
}: {
  bucket: StatusBucket;
  collapsed: boolean;
  showChevron: boolean;
}) {
  if (showChevron) {
    return collapsed ? (
      <ThemedChevronRight size={14} uniProps={foregroundMutedColorMapping} />
    ) : (
      <ThemedChevronDown size={14} uniProps={foregroundMutedColorMapping} />
    );
  }
  switch (bucket) {
    case "needs_input":
      return <ThemedCircleAlert size={14} uniProps={amberColorMapping} />;
    case "failed":
      return <ThemedCircleX size={14} uniProps={redColorMapping} />;
    case "attention":
      return <ThemedCircleCheck size={14} uniProps={greenColorMapping} />;
    case "running":
      return <ThemedCircleDot size={14} uniProps={blueColorMapping} />;
    case "done":
      return <ThemedCircleCheck size={14} uniProps={foregroundMutedColorMapping} />;
  }
}

function ProjectModeList({
  projects,
  serverId,
  collapsedProjectKeys,
  onToggleProjectCollapsed,
  shortcutIndexByWorkspaceKey,
  onWorkspacePress,
  onAddProject,
  listFooterComponent,
  singleProjectViewEnabled = false,
  singleProjectViewProject = null,
  onSingleProjectSelected,
  parentGestureRef,
  pathname,
  groupMode,
}: Omit<SidebarWorkspaceListProps, "isRefreshing" | "onRefresh"> & {
  pathname: string;
}) {
  const { t } = useTranslation();
  const { settings: appSettings } = useAppSettings();
  const [creatingWorkspaceIds, setCreatingWorkspaceIds] = useState<Set<string>>(() => new Set());
  const creatingWorkspaceTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const showShortcutBadges = useShowShortcutBadges();

  const getProjectOrder = useSidebarOrderStore((state) => state.getProjectOrder);
  const setProjectOrder = useSidebarOrderStore((state) => state.setProjectOrder);
  const getWorkspaceOrder = useSidebarOrderStore((state) => state.getWorkspaceOrder);
  const setWorkspaceOrder = useSidebarOrderStore((state) => state.setWorkspaceOrder);
  const badgeMode = useSidebarViewStore((state) =>
    serverId ? state.getBadgeMode(serverId) : "status",
  );
  const workspaceSortMode = useSidebarViewStore((state) =>
    serverId ? state.getWorkspaceSortMode(serverId) : "manual",
  );
  const projectSortMode = useSidebarViewStore((state) =>
    serverId ? state.getProjectSortMode(serverId) : "manual",
  );
  const projectShowLastCount = useSidebarViewStore((state) =>
    serverId ? state.getProjectShowLastCount(serverId) : "all",
  );
  const workspaceShowLastCount = useSidebarViewStore((state) =>
    serverId ? state.getWorkspaceShowLastCount(serverId) : "all",
  );
  const autoCollapseProjects = useSidebarViewStore((state) => state.autoCollapseProjects);
  const autoCollapseWorkspaces = useSidebarViewStore((state) => state.autoCollapseWorkspaces);
  const setGroupMode = useSidebarViewStore((state) => state.setGroupMode);
  const collapsedWorkspaceKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedWorkspaceKeys,
  );
  const setOnlyWorkspaceExpanded = useSidebarCollapsedSectionsStore(
    (state) => state.setOnlyWorkspaceExpanded,
  );
  const setOnlyProjectExpanded = useSidebarCollapsedSectionsStore(
    (state) => state.setOnlyProjectExpanded,
  );
  const setWorkspaceCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setWorkspaceCollapsed,
  );
  const setProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.setProjectCollapsed,
  );
  const lastSelectedWorkspaceIdByProjectKey = useSidebarCollapsedSectionsStore(
    (state) => state.lastSelectedWorkspaceIdByProjectKey,
  );
  const rememberProjectWorkspaceSelection = useSidebarCollapsedSectionsStore(
    (state) => state.rememberProjectWorkspaceSelection,
  );
  const canRemoveProject = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.serverInfo?.features?.projectRemove === true : false,
  );

  const isWorkspaceRoute = useMemo(
    () => Boolean(pathname && parseHostWorkspaceRouteFromPathname(pathname)),
    [pathname],
  );
  const selectionEnabled = isWorkspaceRoute;
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const [showAllProjects, setShowAllProjects] = useState(false);
  const lastRevealedWorkspaceKeyRef = useRef<string | null>(null);
  const collapsedProjectKeysRef = useRef(collapsedProjectKeys);
  const collapsedWorkspaceKeysRef = useRef(collapsedWorkspaceKeys);
  collapsedProjectKeysRef.current = collapsedProjectKeys;
  collapsedWorkspaceKeysRef.current = collapsedWorkspaceKeys;
  const workspaceKeysForAutoCollapse = useMemo(
    () =>
      projects.flatMap((project) => project.workspaces.map((workspace) => workspace.workspaceKey)),
    [projects],
  );
  const projectKeysForAutoCollapse = useMemo(
    () => projects.map((project) => project.projectKey),
    [projects],
  );
  const nativeScrollGestureProps = useMemo(
    () =>
      parentGestureRef
        ? ({
            // NestableScrollContainer forwards props to RNGH ScrollView. Keep
            // vertical scroll and sidebar close pan simultaneous: vertical
            // intent scrolls immediately, clear horizontal intent can still
            // activate close from inside the list.
            simultaneousHandlers: parentGestureRef,
          } as object)
        : undefined,
    [parentGestureRef],
  );

  const projectIconTargets = useMemo(
    () => createProjectIconTargets(serverId, projects),
    [projects, serverId],
  );
  const projectIconByProjectKey = useProjectIconDataByProjectKey({
    projects: projectIconTargets,
  });
  const projectIconPresentationByProjectKey = useProjectIconPresentationByProjectKey({
    projects: projectIconTargets,
  });
  const hydratedWorkspacesForProjectSelector = useStatusModeWorkspaceEntries({
    serverId,
    projects,
  });
  const statusByWorkspaceKey = useMemo(() => {
    const map = new Map<
      SidebarWorkspaceEntry["workspaceKey"],
      SidebarWorkspaceEntry["statusBucket"]
    >();
    for (const workspace of hydratedWorkspacesForProjectSelector) {
      map.set(workspace.workspaceKey, workspace.statusBucket);
    }
    return map;
  }, [hydratedWorkspacesForProjectSelector]);
  const reduceMotionEnabled = useReduceMotionEnabled();
  const selectedSingleProject =
    singleProjectViewEnabled && singleProjectViewProject ? singleProjectViewProject : null;
  const manualProjectSortEnabled = projectSortMode === "manual";

  useEffect(() => {
    setShowAllProjects(false);
  }, [projectShowLastCount, serverId]);

  useEffect(() => {
    const timeouts = creatingWorkspaceTimeoutsRef.current;
    return () => {
      for (const timeout of timeouts.values()) {
        clearTimeout(timeout);
      }
      timeouts.clear();
    };
  }, []);

  useEffect(() => {
    if (creatingWorkspaceIds.size === 0) {
      return;
    }

    const visibleWorkspaceIds = new Set<string>();
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        visibleWorkspaceIds.add(workspace.workspaceId);
      }
    }

    const removedWorkspaceIds = Array.from(creatingWorkspaceIds).filter(
      (workspaceId) => !visibleWorkspaceIds.has(workspaceId),
    );
    if (removedWorkspaceIds.length === 0) {
      return;
    }

    for (const workspaceId of removedWorkspaceIds) {
      const timeout = creatingWorkspaceTimeoutsRef.current.get(workspaceId);
      if (timeout) {
        clearTimeout(timeout);
        creatingWorkspaceTimeoutsRef.current.delete(workspaceId);
      }
    }

    setCreatingWorkspaceIds((current) => {
      const next = new Set(current);
      for (const workspaceId of removedWorkspaceIds) {
        next.delete(workspaceId);
      }
      return next;
    });
  }, [creatingWorkspaceIds, projects]);

  useEffect(() => {
    const revealTarget = findActiveSidebarWorkspaceRevealTarget({
      projects,
      selection: activeWorkspaceSelection,
      serverId,
      selectionEnabled,
    });
    if (!revealTarget) {
      lastRevealedWorkspaceKeyRef.current = null;
      return;
    }
    if (!activeWorkspaceSelection) {
      lastRevealedWorkspaceKeyRef.current = null;
      return;
    }
    if (lastRevealedWorkspaceKeyRef.current === revealTarget.workspaceKey) {
      return;
    }
    lastRevealedWorkspaceKeyRef.current = revealTarget.workspaceKey;
    rememberProjectWorkspaceSelection(
      revealTarget.projectKey,
      activeWorkspaceSelection.workspaceId,
    );

    const currentCollapsedProjectKeys = collapsedProjectKeysRef.current;
    const currentCollapsedWorkspaceKeys = collapsedWorkspaceKeysRef.current;

    if (currentCollapsedProjectKeys.has(revealTarget.projectKey) && autoCollapseProjects) {
      setOnlyProjectExpanded(revealTarget.projectKey, projectKeysForAutoCollapse);
    } else if (currentCollapsedProjectKeys.has(revealTarget.projectKey)) {
      setProjectCollapsed(revealTarget.projectKey, false);
    }

    if (!autoCollapseWorkspaces) {
      if (currentCollapsedWorkspaceKeys.has(revealTarget.workspaceKey)) {
        setWorkspaceCollapsed(revealTarget.workspaceKey, false);
      }
      return;
    }

    const expandedWorkspaceKeys = workspaceKeysForAutoCollapse.filter(
      (workspaceKey) => !currentCollapsedWorkspaceKeys.has(workspaceKey),
    );
    const needsActiveWorkspaceExpanded = currentCollapsedWorkspaceKeys.has(
      revealTarget.workspaceKey,
    );
    const needsInactiveWorkspacesCollapsed =
      expandedWorkspaceKeys.some((workspaceKey) => workspaceKey !== revealTarget.workspaceKey) ||
      expandedWorkspaceKeys.length === 0;
    if (!needsActiveWorkspaceExpanded && !needsInactiveWorkspacesCollapsed) {
      return;
    }
    setOnlyWorkspaceExpanded(revealTarget.workspaceKey, workspaceKeysForAutoCollapse);
  }, [
    activeWorkspaceSelection,
    autoCollapseProjects,
    autoCollapseWorkspaces,
    projectKeysForAutoCollapse,
    projects,
    rememberProjectWorkspaceSelection,
    selectionEnabled,
    serverId,
    setOnlyProjectExpanded,
    setProjectCollapsed,
    setOnlyWorkspaceExpanded,
    setWorkspaceCollapsed,
    workspaceKeysForAutoCollapse,
  ]);

  const handleToggleProjectCollapsed = useCallback(
    (project: SidebarProjectEntry) => {
      const projectKey = project.projectKey;
      if (autoCollapseProjects && collapsedProjectKeys.has(projectKey)) {
        setOnlyProjectExpanded(projectKey, projectKeysForAutoCollapse);
        const rememberedWorkspaceId = lastSelectedWorkspaceIdByProjectKey[projectKey];
        const rememberedWorkspace = rememberedWorkspaceId
          ? (project.workspaces.find(
              (workspace) => workspace.workspaceId === rememberedWorkspaceId,
            ) ?? null)
          : null;
        if (rememberedWorkspace) {
          onWorkspacePress?.();
          navigateToWorkspace(rememberedWorkspace.serverId, rememberedWorkspace.workspaceId);
        }
        return;
      }
      onToggleProjectCollapsed(projectKey);
    },
    [
      autoCollapseProjects,
      collapsedProjectKeys,
      lastSelectedWorkspaceIdByProjectKey,
      onToggleProjectCollapsed,
      onWorkspacePress,
      projectKeysForAutoCollapse,
      setOnlyProjectExpanded,
    ],
  );

  const handleProjectDragEnd = useCallback(
    (reorderedProjects: SidebarProjectEntry[]) => {
      if (!serverId) {
        return;
      }

      const reorderedProjectKeys = reorderedProjects.map((project) => project.projectKey);
      const currentProjectOrder = getProjectOrder(serverId);
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        })
      ) {
        return;
      }

      setProjectOrder(
        serverId,
        mergeWithRemainder({
          currentOrder: currentProjectOrder,
          reorderedVisibleKeys: reorderedProjectKeys,
        }),
      );
    },
    [getProjectOrder, serverId, setProjectOrder],
  );

  const handleWorkspaceReorder = useCallback(
    (projectKey: string, reorderedWorkspaces: SidebarWorkspaceEntry[]) => {
      if (!serverId) {
        return;
      }

      const reorderedWorkspaceKeys = reorderedWorkspaces.map((workspace) => workspace.workspaceKey);
      const currentWorkspaceOrder = getWorkspaceOrder(serverId, projectKey);
      if (
        !hasVisibleOrderChanged({
          currentOrder: currentWorkspaceOrder,
          reorderedVisibleKeys: reorderedWorkspaceKeys,
        })
      ) {
        return;
      }

      setWorkspaceOrder(
        serverId,
        projectKey,
        mergeWithRemainder({
          currentOrder: currentWorkspaceOrder,
          reorderedVisibleKeys: reorderedWorkspaceKeys,
        }),
      );
    },
    [getWorkspaceOrder, serverId, setWorkspaceOrder],
  );

  const handleWorktreeCreated = useCallback((workspaceId: string) => {
    setCreatingWorkspaceIds((current) => {
      const next = new Set(current);
      next.add(workspaceId);
      return next;
    });
    const existingTimeout = creatingWorkspaceTimeoutsRef.current.get(workspaceId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    creatingWorkspaceTimeoutsRef.current.set(
      workspaceId,
      setTimeout(() => {
        creatingWorkspaceTimeoutsRef.current.delete(workspaceId);
        setCreatingWorkspaceIds((current) => {
          if (!current.has(workspaceId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(workspaceId);
          return next;
        });
      }, 3000),
    );
  }, []);

  const selectedProjectKey = useMemo(
    () =>
      getSelectedProjectKey({
        projects,
        selection: activeWorkspaceSelection,
        serverId,
        selectionEnabled,
      }),
    [activeWorkspaceSelection, projects, selectionEnabled, serverId],
  );
  const visibleProjectResult = useMemo(
    () =>
      applySidebarShowLastCount({
        items: projects,
        showLastCount: projectShowLastCount,
        showAll: showAllProjects,
        forceIncludeKey: selectedProjectKey,
        getKey: projectKeyExtractor,
      }),
    [projectShowLastCount, projects, selectedProjectKey, showAllProjects],
  );
  const handleToggleShowAllProjects = useCallback(() => {
    setShowAllProjects((current) => !current);
  }, []);
  const handleEnterStatusMode = useCallback(() => {
    if (!serverId) return;
    setGroupMode(serverId, "status");
  }, [serverId, setGroupMode]);
  const handleExitStatusMode = useCallback(() => {
    if (!serverId) return;
    setGroupMode(serverId, "project");
  }, [serverId, setGroupMode]);

  const renderProject = useCallback(
    ({ item, drag, isActive, dragHandleProps }: DraggableRenderItemInfo<SidebarProjectEntry>) => {
      return (
        <MemoProjectBlock
          project={item}
          collapsed={collapsedProjectKeys.has(item.projectKey)}
          displayName={item.projectName}
          iconDataUri={projectIconByProjectKey.get(item.projectKey) ?? null}
          serverId={serverId}
          canRemoveProject={canRemoveProject}
          selectionEnabled={selectionEnabled}
          badgeMode={badgeMode}
          showShortcutBadges={showShortcutBadges}
          shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
          parentGestureRef={parentGestureRef}
          onToggleCollapsed={handleToggleProjectCollapsed}
          onWorkspacePress={onWorkspacePress}
          onWorkspaceReorder={handleWorkspaceReorder}
          onWorktreeCreated={handleWorktreeCreated}
          drag={drag}
          isDragging={isActive}
          dragHandleProps={dragHandleProps}
          useNestable={platformIsNative}
          creatingWorkspaceIds={creatingWorkspaceIds}
          activeWorkspaceSelection={activeWorkspaceSelection}
          workspaceKeysForAutoCollapse={workspaceKeysForAutoCollapse}
          workspaceSortMode={workspaceSortMode}
          workspaceShowLastCount={workspaceShowLastCount}
          groupMode={groupMode}
          tabLayoutMode={appSettings.tabLayoutMode}
          onEnterStatusMode={handleEnterStatusMode}
          onExitStatusMode={handleExitStatusMode}
        />
      );
    },
    [
      collapsedProjectKeys,
      activeWorkspaceSelection,
      appSettings.tabLayoutMode,
      workspaceShowLastCount,
      workspaceSortMode,
      groupMode,
      handleEnterStatusMode,
      handleExitStatusMode,
      handleWorktreeCreated,
      handleWorkspaceReorder,
      handleToggleProjectCollapsed,
      onWorkspacePress,
      parentGestureRef,
      projectIconByProjectKey,
      badgeMode,
      canRemoveProject,
      selectionEnabled,
      serverId,
      shortcutIndexByWorkspaceKey,
      showShortcutBadges,
      creatingWorkspaceIds,
      workspaceKeysForAutoCollapse,
    ],
  );

  const projectVisibilityToggle = visibleProjectResult.shouldShowVisibilityToggle ? (
    <SidebarShowAllToggle
      expanded={showAllProjects}
      totalCount={projects.length}
      indent="none"
      testID="sidebar-projects-visibility-toggle"
      onPress={handleToggleShowAllProjects}
    />
  ) : null;

  let projectListContent: ReactNode;
  if (projects.length === 0) {
    projectListContent = (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>{t("sidebar.project.empty.title")}</Text>
        <Text style={styles.emptyText}>{t("sidebar.project.empty.description")}</Text>
        <Button variant="ghost" size="sm" leftIcon={Plus} onPress={onAddProject}>
          {t("sidebar.actions.addProject")}
        </Button>
      </View>
    );
  } else if (selectedSingleProject) {
    projectListContent = (
      <SingleProjectWorkspaceBody
        project={selectedSingleProject}
        badgeMode={badgeMode}
        showShortcutBadges={showShortcutBadges}
        shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
        parentGestureRef={parentGestureRef}
        onWorkspacePress={onWorkspacePress}
        onWorkspaceReorder={handleWorkspaceReorder}
        creatingWorkspaceIds={creatingWorkspaceIds}
        activeWorkspaceSelection={activeWorkspaceSelection}
        workspaceKeysForAutoCollapse={workspaceKeysForAutoCollapse}
        workspaceSortMode={workspaceSortMode}
        serverId={serverId}
        selectionEnabled={selectionEnabled}
        useNestable={platformIsNative}
      />
    );
  } else if (projectSortMode === "manual") {
    projectListContent = (
      <>
        <DraggableList
          testID="sidebar-project-list"
          data={visibleProjectResult.visibleItems}
          keyExtractor={projectKeyExtractor}
          renderItem={renderProject}
          onDragEnd={handleProjectDragEnd}
          extraData={activeWorkspaceSelectionKey(activeWorkspaceSelection)}
          scrollEnabled={false}
          useDragHandle
          nestable={platformIsNative}
          simultaneousGestureRef={parentGestureRef}
          containerStyle={styles.projectListContainer}
        />
        {projectVisibilityToggle}
      </>
    );
  } else {
    projectListContent = (
      <View style={styles.projectListContainer} testID="sidebar-project-list">
        {visibleProjectResult.visibleItems.map((project) => (
          <View key={project.projectKey}>
            {renderProject({
              item: project,
              index: 0,
              drag: noop,
              isActive: false,
            })}
          </View>
        ))}
        {projectVisibilityToggle}
      </View>
    );
  }

  const content = (
    <>
      {singleProjectViewEnabled && projects.length > 0 ? (
        <SidebarProjectSelectorBar
          projects={projects}
          selectedProjectKey={selectedSingleProject?.projectKey ?? null}
          iconPresentationByProjectKey={projectIconPresentationByProjectKey}
          statusByWorkspaceKey={statusByWorkspaceKey}
          reduceMotionEnabled={reduceMotionEnabled}
          manualSortEnabled={manualProjectSortEnabled}
          onProjectReorder={handleProjectDragEnd}
          onSelectProject={onSingleProjectSelected}
        />
      ) : null}
      {projectListContent}
      {listFooterComponent}
    </>
  );

  return (
    <View style={styles.container}>
      {platformIsNative ? (
        <NestableScrollContainer
          {...nativeScrollGestureProps}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-project-workspace-list-scroll"
        >
          {content}
        </NestableScrollContainer>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          testID="sidebar-project-workspace-list-scroll"
        >
          {content}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  projectListContainer: {
    width: "100%",
  },
  singleProjectEmpty: {
    minHeight: theme.spacing[6],
  },
  projectSelectorBar: {
    minHeight: 48,
    marginBottom: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
    justifyContent: "center",
  },
  projectSelectorContent: {
    minHeight: 44,
    alignItems: "flex-end",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  projectSelectorCapsuleLayoutItem: {
    justifyContent: "flex-end",
  },
  projectSelectorCapsule: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "visible",
  },
  projectSelectorCapsuleFallback: {
    backgroundColor: theme.colors.surface1,
  },
  projectSelectorCapsuleSelected: {
    borderColor: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface2,
  },
  projectSelectorCapsulePressed: {
    transform: [{ scale: 0.96 }],
  },
  projectSelectorCapsuleDragging: {
    zIndex: 4,
    ...theme.shadow.md,
  },
  projectSelectorIcon: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  projectSelectorIconFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  projectSelectorIconFallbackText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: theme.fontWeight.medium,
  },
  projectSelectorStatusBadges: {
    position: "absolute",
    top: -4,
    right: -5,
    flexDirection: "row",
    gap: 1,
  },
  projectSelectorStatusBadge: {
    minWidth: 12,
    height: 12,
    paddingHorizontal: 3,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.surfaceSidebar,
  },
  projectSelectorStatusBadgeText: {
    color: theme.colors.surfaceSidebar,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: theme.fontWeight.bold,
  },
  projectSelectorStatusRed: {
    backgroundColor: theme.colors.palette.red[500],
  },
  projectSelectorStatusAmber: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  projectSelectorStatusGreen: {
    backgroundColor: theme.colors.palette.green[500],
  },
  projectBlock: {
    marginBottom: theme.spacing[1],
  },
  statusGroupBlock: {
    marginBottom: theme.spacing[1],
  },
  statusWorkspaceListContainer: {
    gap: theme.spacing[1],
  },
  statusGroupRow: {
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[2],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  statusGroupRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  statusGroupRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  statusGroupRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  statusGroupLeadingVisualSlot: {
    position: "relative",
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statusGroupTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  statusGroupTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    minWidth: 0,
    flexShrink: 1,
  },
  workspaceListContainer: {},
  emptyContainer: {
    marginHorizontal: theme.spacing[2],
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[6],
    paddingBottom: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    gap: theme.spacing[3],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  projectRow: {
    position: "relative",
    height: 36,
    minHeight: 36,
    maxHeight: 36,
    paddingVertical: 0,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing[1],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  projectRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  projectRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    ...theme.shadow.md,
  },
  projectRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  projectTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  projectIcon: {
    width: "100%",
    height: "100%",
    borderRadius: theme.borderRadius.sm,
  },
  projectLineIcon: {
    width: "100%",
    height: "100%",
    borderRadius: 2,
  },
  projectLineIconFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  projectLineIconFallbackText: {
    fontSize: 6,
    lineHeight: 8,
    fontWeight: theme.fontWeight.medium,
  },
  workspaceLineIcon: {
    width: "100%",
    height: "100%",
    borderRadius: 2,
    backgroundColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
  },
  projectLeadingVisualSlot: {
    position: "relative",
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  projectLeadingVisualContent: {
    position: "relative",
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  projectLeadingVisualHidden: {
    opacity: 0,
  },
  projectChevronOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  projectChevronOverlayHidden: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
  },
  projectIconFallback: {
    width: "100%",
    height: "100%",
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  projectIconFallbackText: {
    fontSize: 9,
  },
  projectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    minWidth: 0,
    flexShrink: 1,
  },
  projectActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  projectActionButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  projectActionButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  projectIconActionButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectIconActionButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceIconButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  workspaceIconButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceTrailingActionSlotDouble: {
    width: 50,
  },
  workspaceTrailingActionSlotTriple: {
    width: 76,
  },
  workspaceTrailingActionOverlayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  workspaceDiffMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  workspaceStatusSummaryToggle: {
    minHeight: 24,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceStatusSummaryToggleActive: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceStatusSummaryToggleHovered: {
    backgroundColor: theme.colors.surface2,
  },
  workspacePrMetaGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  projectTrailingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  projectKebabButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectKebabButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  projectTrailingControlSlot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectActionTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  projectActionTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  projectActionTooltipShortcut: {},
  projectShortcutBadgeOverlay: {
    position: "absolute",
    top: theme.spacing[2] + 1,
    right: theme.spacing[2],
  },
  workspaceRow: {
    height: 36,
    minHeight: 36,
    maxHeight: 36,
    marginBottom: theme.spacing[1],
    paddingVertical: 0,
    paddingLeft: theme.spacing[3] + theme.spacing[3],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  workspaceRowEmbeddedTabs: {
    marginBottom: theme.spacing[0],
    paddingLeft: theme.spacing[3],
  },
  workspaceRowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    width: "100%",
  },
  workspaceRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  workspaceRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  workspaceRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceRowDragging: {
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ scale: 1.02 }],
    zIndex: 3,
    ...theme.shadow.md,
  },
  sidebarRowActive: {
    backgroundColor: theme.colors.surface1,
  },
  sidebarRowSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceRowContainer: {
    position: "relative",
  },
  embeddedTabsContainer: {
    width: "100%",
    marginBottom: theme.spacing[1],
    gap: theme.spacing[0],
  },
  embeddedTabsContainerWithProjectLine: {
    gap: theme.spacing[1],
  },
  embeddedTabWrapper: {
    width: "100%",
  },
  embeddedTabWrapperWithProjectLine: {
    height: EMBEDDED_TAB_PROJECT_LINE_ROW_HEIGHT,
    minHeight: EMBEDDED_TAB_PROJECT_LINE_ROW_HEIGHT,
    maxHeight: EMBEDDED_TAB_PROJECT_LINE_ROW_HEIGHT,
  },
  embeddedTabHoverHeader: {
    gap: 2,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  embeddedTabHoverCardSurface: {
    width: 520,
  },
  embeddedTabHoverTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 20,
  },
  embeddedTabHoverSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  embeddedTabHoverInitialMessage: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 17,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  embeddedTabHoverInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  embeddedTabHoverInfoText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  embeddedTabMenuItemHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  rotatedMenuIcon: {
    transform: [{ rotate: "90deg" }],
  },
  embeddedTabRow: {
    position: "relative",
    height: EMBEDDED_TAB_ROW_HEIGHT,
    minHeight: EMBEDDED_TAB_ROW_HEIGHT,
    maxHeight: EMBEDDED_TAB_ROW_HEIGHT,
    paddingVertical: 0,
    paddingLeft: theme.spacing[3] + theme.spacing[3],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    width: "100%",
    userSelect: "none",
  },
  embeddedTabRowWithProjectLine: {
    height: EMBEDDED_TAB_PROJECT_LINE_ROW_HEIGHT,
    minHeight: EMBEDDED_TAB_PROJECT_LINE_ROW_HEIGHT,
    maxHeight: EMBEDDED_TAB_PROJECT_LINE_ROW_HEIGHT,
  },
  embeddedTabRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  embeddedTabRowDragging: {
    transform: [{ scale: 1.01 }],
    zIndex: 2,
    ...theme.shadow.sm,
  },
  embeddedTabActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  embeddedTabBranchCountBadge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface3,
  },
  embeddedTabBranchCountBadgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 12,
  },
  embeddedTabLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flex: 1,
    minWidth: 0,
  },
  embeddedTabLabelActive: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    flex: 1,
    minWidth: 0,
  },
  embeddedTabLabelWithTrailingSlot: {
    marginRight: 22 + theme.spacing[2],
  },
  embeddedTabLabelWithWideTrailingSlot: {
    marginRight: 38 + theme.spacing[2],
  },
  embeddedTabStatusSlot: {
    width: 16,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  embeddedTabStatusAttentionDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.palette.green[500],
  },
  embeddedTabCloseSlot: {
    position: "absolute",
    top: 0,
    right: theme.spacing[3],
    bottom: 0,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  embeddedTabCloseSlotWide: {
    position: "absolute",
    top: 0,
    right: theme.spacing[3],
    bottom: 0,
    width: 38,
    flexDirection: "row",
    gap: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  embeddedTabCloseButton: {
    width: 22,
    height: 22,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  embeddedTabCloseButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  workspaceStatusDot: {
    position: "relative",
    width: WORKSPACE_STATUS_DOT_WIDTH,
    height: 16,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotOverlay: {
    position: "absolute",
    right: DEFAULT_STATUS_DOT_OFFSET,
    bottom: DEFAULT_STATUS_DOT_OFFSET,
    width: DEFAULT_STATUS_DOT_SIZE,
    height: DEFAULT_STATUS_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  workspaceArchivingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: `${theme.colors.surface0}cc`,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    zIndex: 1,
  },
  workspaceArchivingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
  },
  workspaceBranchText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "400",
    lineHeight: 20,
    opacity: 0.76,
    flex: 1,
    minWidth: 0,
  },
  workspaceBranchTextCreating: {
    opacity: 0.92,
  },
  workspaceBranchTextHovered: {
    opacity: 1,
  },
  workspaceCreatingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    flexShrink: 0,
  },
  kebabButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kebabButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  statusDotNeedsInput: {
    backgroundColor: theme.colors.palette.amber[500],
    borderColor: theme.colors.surface0,
  },
  statusDotFailed: {
    backgroundColor: theme.colors.palette.red[500],
    borderColor: theme.colors.surface0,
  },
  statusDotRunning: {
    backgroundColor: theme.colors.palette.blue[500],
    borderColor: theme.colors.surface0,
  },
  statusDotAttention: {
    backgroundColor: theme.colors.palette.green[500],
    borderColor: theme.colors.surface0,
  },
  statusDotDone: {
    backgroundColor: theme.colors.statusSuccess,
    borderColor: theme.colors.surface0,
  },
  statusSummaryBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  statusSummaryCountBadge: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  statusSummaryCountText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 14,
    color: "#000000",
  },
  statusSummaryCountIcon: {
    color: "#000000",
  },
  statusSummaryCountDraftIcon: {
    color: theme.colors.foregroundMuted,
  },
  statusSummaryCountNeedsInput: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  statusSummaryCountFailed: {
    backgroundColor: theme.colors.palette.red[500],
  },
  statusSummaryCountRunning: {
    backgroundColor: theme.colors.palette.blue[500],
  },
  statusSummaryCountAttention: {
    backgroundColor: theme.colors.palette.green[500],
  },
  statusSummaryCountDone: {
    backgroundColor: theme.colors.statusSuccess,
  },
  statusSummaryCountDraft: {
    backgroundColor: "transparent",
  },
}));

function getStatusDotColorStyle(bucket: SidebarStateBucket): ViewStyle | null {
  switch (bucket) {
    case "needs_input":
      return styles.statusDotNeedsInput;
    case "failed":
      return styles.statusDotFailed;
    case "running":
      return styles.statusDotRunning;
    case "attention":
      return styles.statusDotAttention;
    case "done":
      return null;
  }
}
