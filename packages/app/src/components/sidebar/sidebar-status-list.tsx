import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import { useSidebarScroll } from "@/components/sidebar/sidebar-scroll-context";
import { NestableScrollContainer } from "react-native-draggable-flatlist";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import { applySidebarShowLastCount } from "@/hooks/sidebar-workspaces-view-model";
import {
  buildStatusGroups,
  buildStatusShortcutIndex,
  type StatusGroup,
} from "@/hooks/sidebar-status-view-model";
import { isWeb as platformIsWeb, isNative as platformIsNative } from "@/constants/platform";
import { StyleSheet } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { withUnistyles } from "react-native-unistyles";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CircleX,
  MoreVertical,
  Copy,
  Archive,
  Pencil,
} from "lucide-react-native";
import { DiffStat } from "@/components/diff-stat";
import { useSidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/contexts/toast-context";
import { useMutation } from "@tanstack/react-query";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { requireWorkspaceDirectory, resolveWorkspaceDirectory } from "@/utils/workspace-directory";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";
import { type CheckoutGitAsyncActionId, useCheckoutGitActionsStore } from "@/git/actions-store";
import { toWorktreeArchiveRisk } from "@/git/worktree-archive-warning";
import * as Clipboard from "expo-clipboard";
import { Shortcut } from "@/components/ui/shortcut";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import { useClearWorkspaceAttention } from "@/hooks/use-clear-workspace-attention";
import { useAppSettings, type WorkspaceTitleSource } from "@/hooks/use-settings";
import {
  SidebarWorkspaceRowFrame,
  SidebarWorkspaceRowContent,
  SidebarWorkspaceMessageStatusBadge,
  SidebarWorkspaceTrailingActionBase,
  SidebarWorkspaceTrailingActionOverlay,
  SidebarWorkspaceTrailingActionSlot,
} from "@/components/sidebar/sidebar-workspace-row-content";
import { SidebarEntryStatusBadges } from "@/components/sidebar/sidebar-entry-row";
import {
  SidebarVcOperationBadges,
  usePendingCheckoutBranchActionIds,
} from "@/components/sidebar/sidebar-vc-operation-badge";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import type { SidebarBadgeMode } from "@/stores/sidebar-view-store";
import type {
  SidebarWorkspaceShowLastCount,
  SidebarWorkspaceSortMode,
} from "@/stores/sidebar-view-store";
import {
  createEmptySidebarTabStatusSummary,
  getVisibleSidebarEntryStatusKinds,
  type SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";
import { SidebarShowAllToggle } from "@/components/sidebar/sidebar-show-all-toggle";

// Themed icon wrappers
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const blueColorMapping = (theme: Theme) => ({ color: theme.colors.palette.blue[500] });
const amberColorMapping = (theme: Theme) => ({ color: theme.colors.palette.amber[500] });
const redColorMapping = (theme: Theme) => ({ color: theme.colors.palette.red[500] });
const greenColorMapping = (theme: Theme) => ({ color: theme.colors.palette.green[500] });

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedCircleX = withUnistyles(CircleX);
const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedCopy = withUnistyles(Copy);
const ThemedArchive = withUnistyles(Archive);
const ThemedPencil = withUnistyles(Pencil);

const EMPTY_TAB_STATUS_SUMMARY = createEmptySidebarTabStatusSummary();
const copyLeadingIcon = <ThemedCopy size={14} uniProps={foregroundMutedColorMapping} />;
const markAsReadLeadingIcon = (
  <ThemedCircleCheck size={14} uniProps={foregroundMutedColorMapping} />
);
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;
const renameLeadingIcon = <ThemedPencil size={14} uniProps={foregroundMutedColorMapping} />;

interface StatusWorkspaceListProps {
  workspaces: SidebarWorkspaceEntry[];
  projectNamesByKey: Map<string, string>;
  serverId: string | null;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  showShortcutBadges: boolean;
  badgeMode: SidebarBadgeMode;
  workspaceSortMode: SidebarWorkspaceSortMode;
  workspaceShowLastCount: SidebarWorkspaceShowLastCount;
  tabStatusSummaries: Map<string, SidebarTabStatusSummary>;
  messageStatusCountsByWorkspaceKey: ReadonlyMap<string, number>;
  onWorkspacePress?: () => void;
  statusSummaryToggleActiveWorkspaceKey?: string | null;
  onStatusSummaryTogglePress?: () => void;
  embedded?: boolean;
}

export function SidebarStatusWorkspaceList({
  workspaces,
  projectNamesByKey,
  serverId,
  shortcutIndexByWorkspaceKey: _projectShortcutIndex,
  showShortcutBadges,
  badgeMode,
  workspaceSortMode,
  workspaceShowLastCount,
  tabStatusSummaries,
  messageStatusCountsByWorkspaceKey,
  onWorkspacePress,
  statusSummaryToggleActiveWorkspaceKey = null,
  onStatusSummaryTogglePress,
  embedded = false,
}: StatusWorkspaceListProps) {
  const groups = useMemo(
    () => buildStatusGroups(workspaces, workspaceSortMode),
    [workspaceSortMode, workspaces],
  );
  const collapsedStatusGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedStatusGroupKeys,
  );
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const [expandedStatusBuckets, setExpandedStatusBuckets] = useState<Set<StatusGroup["bucket"]>>(
    () => new Set(),
  );

  useEffect(() => {
    setExpandedStatusBuckets(new Set());
  }, [serverId, workspaceShowLastCount]);

  const forceIncludeWorkspaceKey =
    serverId && activeWorkspaceSelection?.serverId === serverId
      ? `${serverId}:${activeWorkspaceSelection.workspaceId}`
      : null;
  const visibleGroups = useMemo(
    () =>
      groups.map((group) => {
        const showAll = expandedStatusBuckets.has(group.bucket);
        const visibleResult = applySidebarShowLastCount({
          items: group.rows,
          showLastCount: workspaceShowLastCount,
          showAll,
          forceIncludeKey: forceIncludeWorkspaceKey,
          getKey: (workspace) => workspace.workspaceKey,
        });
        return {
          ...group,
          rows: visibleResult.visibleItems,
          totalRowCount: group.rows.length,
          showAll,
          shouldShowVisibilityToggle: visibleResult.shouldShowVisibilityToggle,
        };
      }),
    [expandedStatusBuckets, forceIncludeWorkspaceKey, groups, workspaceShowLastCount],
  );
  const handleToggleStatusGroupVisibility = useCallback((bucket: StatusGroup["bucket"]) => {
    setExpandedStatusBuckets((current) => {
      const next = new Set(current);
      if (next.has(bucket)) {
        next.delete(bucket);
      } else {
        next.add(bucket);
      }
      return next;
    });
  }, []);

  const statusShortcutIndex = useMemo(
    () =>
      showShortcutBadges
        ? buildStatusShortcutIndex(
            visibleGroups.filter((group) => !collapsedStatusGroupKeys.has(group.bucket)),
          )
        : new Map<string, number>(),
    [collapsedStatusGroupKeys, showShortcutBadges, visibleGroups],
  );
  const groupList = (
    <StatusGroupList
      groups={visibleGroups}
      collapsedStatusGroupKeys={collapsedStatusGroupKeys}
      projectNamesByKey={projectNamesByKey}
      serverId={serverId}
      shortcutIndex={statusShortcutIndex}
      showShortcutBadges={showShortcutBadges}
      badgeMode={badgeMode}
      tabStatusSummaries={tabStatusSummaries}
      messageStatusCountsByWorkspaceKey={messageStatusCountsByWorkspaceKey}
      onToggleGroupVisibility={handleToggleStatusGroupVisibility}
      onWorkspacePress={onWorkspacePress}
      statusSummaryToggleActiveWorkspaceKey={statusSummaryToggleActiveWorkspaceKey}
      onStatusSummaryTogglePress={onStatusSummaryTogglePress}
    />
  );
  const { onScroll: onSidebarScroll } = useSidebarScroll();

  if (embedded) {
    return <View style={styles.embeddedContainer}>{groupList}</View>;
  }

  return (
    <View style={styles.container}>
      {platformIsNative ? (
        <NestableScrollContainer
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={onSidebarScroll}
          scrollEventThrottle={16}
          testID="sidebar-status-list-scroll"
        >
          {groupList}
        </NestableScrollContainer>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onScroll={onSidebarScroll}
          scrollEventThrottle={16}
          testID="sidebar-status-list-scroll"
        >
          {groupList}
        </ScrollView>
      )}
    </View>
  );
}

interface VisibleStatusGroup extends StatusGroup {
  totalRowCount: number;
  showAll: boolean;
  shouldShowVisibilityToggle: boolean;
}

function StatusGroupList({
  groups,
  collapsedStatusGroupKeys,
  projectNamesByKey,
  serverId,
  shortcutIndex,
  showShortcutBadges,
  badgeMode,
  tabStatusSummaries,
  messageStatusCountsByWorkspaceKey,
  onToggleGroupVisibility,
  onWorkspacePress,
  statusSummaryToggleActiveWorkspaceKey,
  onStatusSummaryTogglePress,
}: {
  groups: VisibleStatusGroup[];
  collapsedStatusGroupKeys: ReadonlySet<string>;
  projectNamesByKey: Map<string, string>;
  serverId: string | null;
  shortcutIndex: Map<string, number>;
  showShortcutBadges: boolean;
  badgeMode: SidebarBadgeMode;
  tabStatusSummaries: Map<string, SidebarTabStatusSummary>;
  messageStatusCountsByWorkspaceKey: ReadonlyMap<string, number>;
  onToggleGroupVisibility: (bucket: StatusGroup["bucket"]) => void;
  onWorkspacePress?: () => void;
  statusSummaryToggleActiveWorkspaceKey: string | null;
  onStatusSummaryTogglePress?: () => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <View key={group.bucket} style={styles.statusGroupBlock}>
          <StatusGroupHeader group={group} collapsed={collapsedStatusGroupKeys.has(group.bucket)} />
          {!collapsedStatusGroupKeys.has(group.bucket) ? (
            <View
              style={styles.statusWorkspaceListContainer}
              testID={`sidebar-status-group-rows-${group.bucket}`}
            >
              {group.rows.map((workspace) => (
                <StatusWorkspaceRow
                  key={workspace.workspaceKey}
                  workspace={workspace}
                  projectName={projectNamesByKey.get(workspace.projectKey) ?? ""}
                  serverId={serverId}
                  shortcutNumber={shortcutIndex.get(workspace.workspaceKey) ?? null}
                  showShortcutBadge={showShortcutBadges}
                  badgeMode={badgeMode}
                  tabStatusSummary={
                    tabStatusSummaries.get(workspace.workspaceKey) ?? EMPTY_TAB_STATUS_SUMMARY
                  }
                  messageStatusCount={
                    messageStatusCountsByWorkspaceKey.get(workspace.workspaceKey) ?? 0
                  }
                  onWorkspacePress={onWorkspacePress}
                  statusSummaryToggleActive={
                    workspace.workspaceKey === statusSummaryToggleActiveWorkspaceKey
                  }
                  onStatusSummaryPress={
                    workspace.workspaceKey === statusSummaryToggleActiveWorkspaceKey
                      ? onStatusSummaryTogglePress
                      : undefined
                  }
                />
              ))}
              {group.shouldShowVisibilityToggle ? (
                <StatusGroupVisibilityToggle
                  bucket={group.bucket}
                  expanded={group.showAll}
                  totalCount={group.totalRowCount}
                  onToggle={onToggleGroupVisibility}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

function StatusGroupVisibilityToggle({
  bucket,
  expanded,
  totalCount,
  onToggle,
}: {
  bucket: StatusGroup["bucket"];
  expanded: boolean;
  totalCount: number;
  onToggle: (bucket: StatusGroup["bucket"]) => void;
}) {
  const handlePress = useCallback(() => onToggle(bucket), [bucket, onToggle]);
  return (
    <SidebarShowAllToggle
      expanded={expanded}
      totalCount={totalCount}
      testID={`sidebar-status-group-visibility-toggle-${bucket}`}
      onPress={handlePress}
    />
  );
}

function StatusGroupHeader({ group, collapsed }: { group: StatusGroup; collapsed: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const toggleStatusGroupCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleStatusGroupCollapsed,
  );
  const handlePress = useCallback(() => {
    toggleStatusGroupCollapsed(group.bucket);
  }, [group.bucket, toggleStatusGroupCollapsed]);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
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
    <View onPointerEnter={handleHoverIn} onPointerLeave={handleHoverOut}>
      <Pressable
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel={`${group.label} status group`}
        accessibilityState={accessibilityState}
        style={rowStyle}
        onPress={handlePress}
        testID={`sidebar-status-group-${group.bucket}`}
      >
        <View style={styles.statusGroupRowLeft}>
          <View style={styles.statusGroupLeadingVisualSlot}>
            <StatusGroupLeadingVisual
              bucket={group.bucket}
              collapsed={collapsed}
              showChevron={isHovered}
            />
          </View>
          <View style={styles.statusGroupTitleGroup}>
            <Text style={styles.statusGroupTitle} numberOfLines={1}>
              {group.label}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function StatusGroupLeadingVisual({
  bucket,
  collapsed,
  showChevron,
}: {
  bucket: StatusGroup["bucket"];
  collapsed: boolean;
  showChevron: boolean;
}) {
  if (!showChevron) {
    return <StatusGroupIcon bucket={bucket} />;
  }
  if (collapsed) {
    return <ThemedChevronRight size={14} uniProps={foregroundMutedColorMapping} />;
  }
  return <ThemedChevronDown size={14} uniProps={foregroundMutedColorMapping} />;
}

function StatusGroupIcon({ bucket }: { bucket: StatusGroup["bucket"] }) {
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

const StatusWorkspaceRow = memo(function StatusWorkspaceRow({
  workspace,
  projectName,
  serverId,
  shortcutNumber,
  showShortcutBadge,
  badgeMode,
  tabStatusSummary,
  messageStatusCount,
  onWorkspacePress,
  statusSummaryToggleActive,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  projectName: string;
  serverId: string | null;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  badgeMode: SidebarBadgeMode;
  tabStatusSummary: SidebarTabStatusSummary;
  messageStatusCount: number;
  onWorkspacePress?: () => void;
  statusSummaryToggleActive?: boolean;
  onStatusSummaryPress?: () => void;
}) {
  const hydratedWorkspace = useSidebarWorkspaceEntry(serverId, workspace.workspaceId);
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const selected =
    activeWorkspaceSelection?.serverId === workspace.serverId &&
    activeWorkspaceSelection?.workspaceId === workspace.workspaceId;

  const handlePress = useCallback(() => {
    if (!serverId) return;
    onWorkspacePress?.();
    navigateToWorkspace(serverId, workspace.workspaceId);
  }, [serverId, onWorkspacePress, workspace.workspaceId]);

  if (!hydratedWorkspace) return null;

  return (
    <StatusWorkspaceRowWithMenu
      workspace={hydratedWorkspace}
      projectName={projectName}
      selected={selected}
      shortcutNumber={shortcutNumber}
      showShortcutBadge={showShortcutBadge}
      badgeMode={badgeMode}
      tabStatusSummary={tabStatusSummary}
      messageStatusCount={messageStatusCount}
      onPress={handlePress}
      statusSummaryToggleActive={statusSummaryToggleActive}
      onStatusSummaryPress={onStatusSummaryPress}
    />
  );
});

function StatusWorkspaceRowWithMenu({
  workspace,
  projectName,
  selected,
  shortcutNumber,
  showShortcutBadge,
  badgeMode,
  tabStatusSummary,
  messageStatusCount,
  onPress,
  statusSummaryToggleActive = false,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  projectName: string;
  selected: boolean;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  badgeMode: SidebarBadgeMode;
  tabStatusSummary: SidebarTabStatusSummary;
  messageStatusCount: number;
  onPress: () => void;
  statusSummaryToggleActive?: boolean;
  onStatusSummaryPress?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { settings: appSettings } = useAppSettings();
  const [isHidingWorkspace, setIsHidingWorkspace] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const workspaceDirectory = resolveWorkspaceDirectory({
    workspaceDirectory: workspace.workspaceDirectory,
  });
  const pendingBranchActionIds = usePendingCheckoutBranchActionIds({
    serverId: workspace.serverId,
    cwd: workspace.projectKind === "git" ? workspaceDirectory : null,
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
      activeWorkspaceSelection: selected
        ? { serverId: workspace.serverId, workspaceId: workspace.workspaceId }
        : null,
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
    if (isArchiving) return;
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
      toast.error(error instanceof Error ? error.message : "Workspace path not available");
      return;
    }
    void Clipboard.setStringAsync(copyTargetDirectory);
    toast.copied("Path copied");
  }, [toast, workspace.workspaceDirectory, workspace.workspaceId]);

  const handleCopyBranchName = useCallback(() => {
    void Clipboard.setStringAsync(workspace.name);
    toast.copied("Branch name copied");
  }, [toast, workspace.name]);

  const renameMutation = useMutation({
    mutationFn: async (title: string) => {
      const client = getHostRuntimeStore().getClient(workspace.serverId);
      if (!client) throw new Error(t("workspace.terminal.hostDisconnected"));
      await client.setWorkspaceTitle(workspace.workspaceId, title.length === 0 ? null : title);
    },
  });

  const handleOpenRename = useCallback(() => setIsRenameOpen(true), []);
  const handleCloseRename = useCallback(() => setIsRenameOpen(false), []);
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

  let computedArchiveStatus: "idle" | "pending" | "success" = "idle";
  if (isWorktree) {
    computedArchiveStatus = worktreeArchiveStatus;
  } else if (isHidingWorkspace) {
    computedArchiveStatus = "pending";
  }

  return (
    <ContextMenu>
      <StatusWorkspaceRowInner
        workspace={workspace}
        workspaceTitleSource={appSettings.workspaceTitleSource}
        projectName={projectName}
        selected={selected}
        shortcutNumber={shortcutNumber}
        showShortcutBadge={showShortcutBadge}
        badgeMode={badgeMode}
        tabStatusSummary={tabStatusSummary}
        messageStatusCount={messageStatusCount}
        onPress={onPress}
        isArchiving={isArchiving}
        archiveLabel={t("sidebar.workspace.actions.archive")}
        archiveStatus={computedArchiveStatus}
        archivePendingLabel={t("sidebar.workspace.actions.archiving")}
        onArchive={handleArchive}
        onCopyBranchName={workspace.projectKind === "git" ? handleCopyBranchName : undefined}
        onCopyPath={handleCopyPath}
        onRename={handleOpenRename}
        onMarkAsRead={hasClearableAttention ? handleMarkAsRead : undefined}
        archiveShortcutKeys={selected ? archiveShortcutKeys : null}
        pendingBranchActionIds={pendingBranchActionIds}
        statusSummaryToggleActive={statusSummaryToggleActive}
        onStatusSummaryPress={selected ? onStatusSummaryPress : undefined}
      />
      <StatusWorkspaceContextMenuContent
        workspaceKey={workspace.workspaceKey}
        onCopyPath={handleCopyPath}
        onCopyBranchName={workspace.projectKind === "git" ? handleCopyBranchName : undefined}
        onRename={handleOpenRename}
        onMarkAsRead={hasClearableAttention ? handleMarkAsRead : undefined}
        onArchive={handleArchive}
        archiveLabel={t("sidebar.workspace.actions.archive")}
        archiveStatus={computedArchiveStatus}
        archivePendingLabel={t("sidebar.workspace.actions.archiving")}
        archiveShortcutKeys={selected ? archiveShortcutKeys : null}
      />
      <AdaptiveRenameModal
        visible={isRenameOpen}
        title="Rename workspace"
        initialValue={workspace.title ?? workspace.name}
        placeholder={workspace.name}
        submitLabel="Rename"
        onClose={handleCloseRename}
        onSubmit={handleSubmitRename}
        testID={`sidebar-workspace-rename-modal-${workspace.workspaceKey}`}
      />
    </ContextMenu>
  );
}

function StatusWorkspaceRowInner({
  workspace,
  workspaceTitleSource,
  projectName,
  selected,
  shortcutNumber,
  showShortcutBadge,
  badgeMode,
  tabStatusSummary,
  messageStatusCount,
  onPress,
  isArchiving,
  archiveLabel,
  archiveStatus = "idle",
  archivePendingLabel,
  onArchive,
  onCopyBranchName,
  onCopyPath,
  onRename,
  onMarkAsRead,
  archiveShortcutKeys,
  pendingBranchActionIds,
  statusSummaryToggleActive,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  workspaceTitleSource: WorkspaceTitleSource;
  projectName: string;
  selected: boolean;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  badgeMode: SidebarBadgeMode;
  tabStatusSummary: SidebarTabStatusSummary;
  messageStatusCount: number;
  onPress: () => void;
  isArchiving: boolean;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  onArchive?: () => void;
  onCopyBranchName?: () => void;
  onCopyPath?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  pendingBranchActionIds: readonly CheckoutGitAsyncActionId[];
  statusSummaryToggleActive: boolean;
  onStatusSummaryPress?: () => void;
}) {
  const isTouchPlatform = platformIsNative;

  const isDesktop = !isTouchPlatform;
  const showScriptsIcon = isDesktop && workspace.hasRunningScripts;
  const hasRunningService = workspace.scripts.some(
    (s) => s.lifecycle === "running" && (s.type ?? "service") === "service",
  );
  let scriptIconKind: "service" | "command" | null = null;
  if (showScriptsIcon) {
    scriptIconKind = hasRunningService ? "service" : "command";
  }

  const accessibilityState = useMemo(() => ({ selected }), [selected]);

  return (
    <SidebarWorkspaceRowFrame workspace={workspace} statusSummary={tabStatusSummary}>
      {({ isHovered, hoverHandlers }) => {
        const rightState = getStatusWorkspaceRightState({
          badgeMode,
          hasArchiveAction: Boolean(onArchive),
          hasDiffStat: Boolean(workspace.diffStat),
          hasVcOperationBadges: pendingBranchActionIds.length > 0,
          isHovered,
          isTouchPlatform,
          messageStatusCount,
          shortcutNumber,
          showShortcutBadge,
          tabStatusSummary,
        });
        const workspaceRowStyle = getStatusWorkspaceRowStyle({ selected, isHovered });
        return (
          <View style={styles.workspaceRowContainer} {...hoverHandlers}>
            <ContextMenuTrigger
              disabled={isArchiving}
              accessibilityRole="button"
              accessibilityState={accessibilityState}
              style={workspaceRowStyle}
              onPress={onPress}
              testID={`sidebar-workspace-row-${workspace.workspaceKey}`}
            >
              <SidebarWorkspaceRowContent
                workspace={workspace}
                workspaceTitleSource={workspaceTitleSource}
                subtitle={projectName}
                scriptIconKind={scriptIconKind}
                isHovered={isHovered}
                isLoading={isArchiving}
                suppressStatusLoader={badgeMode === "status"}
                suppressStatusVisual={badgeMode === "status" || rightState.showStatusSummary}
                shortcutNumber={shortcutNumber}
                showShortcutBadge={showShortcutBadge}
                hasTrailingContent={rightState.shouldRenderActionSlot}
              >
                {rightState.shouldRenderActionSlot ? (
                  <StatusWorkspaceActionSlot
                    workspace={workspace}
                    statusSummary={tabStatusSummary}
                    messageStatusCount={messageStatusCount}
                    showStatusSummary={rightState.showStatusSummary}
                    showDiffStat={rightState.showDiffStat}
                    showBase={rightState.showActionBase}
                    showOverlay={rightState.showActionOverlay}
                    onCopyPath={onCopyPath}
                    onCopyBranchName={onCopyBranchName}
                    onRename={onRename}
                    onMarkAsRead={onMarkAsRead}
                    onArchive={onArchive}
                    archiveLabel={archiveLabel}
                    archiveStatus={archiveStatus}
                    archivePendingLabel={archivePendingLabel}
                    archiveShortcutKeys={archiveShortcutKeys}
                    pendingBranchActionIds={pendingBranchActionIds}
                    statusSummaryToggleActive={statusSummaryToggleActive}
                    onStatusSummaryPress={
                      rightState.showStatusSummary ? onStatusSummaryPress : undefined
                    }
                  />
                ) : null}
              </SidebarWorkspaceRowContent>
            </ContextMenuTrigger>
          </View>
        );
      }}
    </SidebarWorkspaceRowFrame>
  );
}

function getStatusWorkspaceRightState(input: {
  badgeMode: SidebarBadgeMode;
  hasArchiveAction: boolean;
  hasDiffStat: boolean;
  hasVcOperationBadges: boolean;
  isHovered: boolean;
  isTouchPlatform: boolean;
  messageStatusCount: number;
  shortcutNumber: number | null;
  showShortcutBadge: boolean;
  tabStatusSummary: SidebarTabStatusSummary;
}) {
  const showShortcut = input.showShortcutBadge && input.shortcutNumber !== null;
  const showStatusSummary =
    input.badgeMode === "status" &&
    !showShortcut &&
    getVisibleSidebarEntryStatusKinds(input.tabStatusSummary).length > 0;
  const showKebab = Boolean(
    input.hasArchiveAction && (input.isHovered || input.isTouchPlatform) && !showStatusSummary,
  );
  const showKebabInSlot = showKebab && !showShortcut;
  const showVcOperationBadges =
    input.hasVcOperationBadges && !showKebabInSlot && !showShortcut && !showStatusSummary;
  const showDiffStat =
    input.badgeMode === "diff" &&
    input.hasDiffStat &&
    !showKebabInSlot &&
    !showShortcut &&
    !showStatusSummary;
  const showActionBase = showVcOperationBadges || showStatusSummary || showDiffStat;
  const showActionOverlay = showKebabInSlot;

  return {
    showStatusSummary,
    showDiffStat,
    showActionBase,
    showActionOverlay,
    shouldRenderActionSlot: showActionBase || showActionOverlay || input.messageStatusCount > 0,
  };
}

function StatusWorkspaceActionSlot({
  workspace,
  statusSummary,
  messageStatusCount,
  showStatusSummary,
  showDiffStat,
  showBase,
  showOverlay,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  pendingBranchActionIds,
  statusSummaryToggleActive,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  statusSummary: SidebarTabStatusSummary;
  messageStatusCount: number;
  showStatusSummary: boolean;
  showDiffStat: boolean;
  showBase: boolean;
  showOverlay: boolean;
  onCopyPath?: () => void;
  onCopyBranchName?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onArchive?: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  pendingBranchActionIds: readonly CheckoutGitAsyncActionId[];
  statusSummaryToggleActive: boolean;
  onStatusSummaryPress?: () => void;
}) {
  return (
    <>
      <SidebarWorkspaceMessageStatusBadge count={messageStatusCount} />
      {showBase || showOverlay ? (
        <SidebarWorkspaceTrailingActionSlot>
          <SidebarWorkspaceTrailingActionBase visible={showBase}>
            <StatusWorkspaceBaseMeta
              workspace={workspace}
              statusSummary={statusSummary}
              showStatusSummary={showStatusSummary}
              showDiffStat={showDiffStat}
              pendingBranchActionIds={pendingBranchActionIds}
              statusSummaryToggleActive={statusSummaryToggleActive}
              onStatusSummaryPress={onStatusSummaryPress}
            />
          </SidebarWorkspaceTrailingActionBase>
          <SidebarWorkspaceTrailingActionOverlay visible={showOverlay}>
            {onArchive ? (
              <StatusKebabMenu
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
          </SidebarWorkspaceTrailingActionOverlay>
        </SidebarWorkspaceTrailingActionSlot>
      ) : null}
    </>
  );
}

function StatusWorkspaceBaseMeta({
  workspace,
  statusSummary,
  showStatusSummary,
  showDiffStat,
  pendingBranchActionIds,
  statusSummaryToggleActive,
  onStatusSummaryPress,
}: {
  workspace: SidebarWorkspaceEntry;
  statusSummary: SidebarTabStatusSummary;
  showStatusSummary: boolean;
  showDiffStat: boolean;
  pendingBranchActionIds: readonly CheckoutGitAsyncActionId[];
  statusSummaryToggleActive: boolean;
  onStatusSummaryPress?: () => void;
}) {
  if (pendingBranchActionIds.length > 0) {
    return <SidebarVcOperationBadges actionIds={pendingBranchActionIds} />;
  }
  if (showStatusSummary) {
    if (onStatusSummaryPress) {
      return (
        <StatusSummaryToggleButton
          active={statusSummaryToggleActive}
          testID={`sidebar-workspace-status-toggle-${workspace.workspaceKey}`}
          onPress={onStatusSummaryPress}
        >
          <SidebarEntryStatusBadges summary={statusSummary} />
        </StatusSummaryToggleButton>
      );
    }
    return <SidebarEntryStatusBadges summary={statusSummary} />;
  }
  if (!showDiffStat || !workspace.diffStat) {
    return null;
  }
  return (
    <DiffStat additions={workspace.diffStat.additions} deletions={workspace.diffStat.deletions} />
  );
}

function StatusKebabMenu({
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
  const archiveTrailing = useMemo(
    () => (archiveShortcutKeys ? <Shortcut chord={archiveShortcutKeys} /> : null),
    [archiveShortcutKeys],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={kebabStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel="Workspace actions"
        testID={`sidebar-workspace-kebab-${workspaceKey}`}
      >
        {({ hovered }: { hovered?: boolean }) => (
          <ThemedMoreVertical
            size={14}
            uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={260}>
        {onCopyPath ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-copy-path-${workspaceKey}`}
            leading={copyLeadingIcon}
            onSelect={onCopyPath}
          >
            Copy path
          </DropdownMenuItem>
        ) : null}
        {onCopyBranchName ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-copy-branch-name-${workspaceKey}`}
            leading={copyLeadingIcon}
            onSelect={onCopyBranchName}
          >
            Copy branch name
          </DropdownMenuItem>
        ) : null}
        {onRename ? (
          <DropdownMenuItem
            testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
            leading={renameLeadingIcon}
            onSelect={onRename}
          >
            Rename workspace
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
          {archiveLabel ?? "Archive"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusWorkspaceContextMenuContent({
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
          Copy path
        </ContextMenuItem>
      ) : null}
      {onCopyBranchName ? (
        <ContextMenuItem
          testID={`sidebar-workspace-menu-copy-branch-name-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyBranchName}
        >
          Copy branch name
        </ContextMenuItem>
      ) : null}
      {onRename ? (
        <ContextMenuItem
          testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
          leading={renameLeadingIcon}
          onSelect={onRename}
        >
          Rename workspace
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
        {archiveLabel ?? "Archive"}
      </ContextMenuItem>
    </ContextMenuContent>
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
  onPress: () => void;
  children: ReactNode;
}) {
  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onPress();
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
      accessibilityLabel="Show workspaces grouped by workspace"
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

function kebabStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.kebabButton, hovered && styles.kebabButtonHovered];
}

function getStatusWorkspaceRowStyle({
  selected,
  isHovered,
}: {
  selected: boolean;
  isHovered: boolean;
}) {
  return [
    styles.workspaceRow,
    selected && styles.sidebarRowSelected,
    isHovered && styles.workspaceRowHovered,
  ];
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  embeddedContainer: {
    width: "100%",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  statusGroupBlock: {
    marginBottom: theme.spacing[1],
  },
  statusWorkspaceListContainer: {},
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
    fontWeight: "400",
    minWidth: 0,
    flexShrink: 1,
  },
  workspaceRowContainer: {
    position: "relative",
  },
  workspaceRow: {
    minHeight: 36,
    marginBottom: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  workspaceRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  workspaceRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  sidebarRowSelected: {
    backgroundColor: theme.colors.surfaceSidebarHover,
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
}));
