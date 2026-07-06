import { createElement, memo, useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  CircleAlert,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderGit2,
  Globe,
  Monitor,
  SquareTerminal,
} from "lucide-react-native";
import { WorkspaceHoverCard } from "@/components/workspace-hover-card";
import { SidebarEntryRowContent } from "@/components/sidebar/sidebar-entry-row";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SyncedLoader } from "@/components/synced-loader";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import type { Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { isEmphasizedStatusDotBucket } from "@/utils/status-dot-color";
import { shouldRenderSyncedStatusLoader } from "@/utils/status-loader";
import { isNative as platformIsNative } from "@/constants/platform";
import { useTranslation } from "react-i18next";
import type {
  SidebarEntryStatusKind,
  SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";
import { resolveSidebarWorkspacePrimaryLabel } from "@/components/sidebar/sidebar-workspace-title";
import type { WorkspaceTitleSource } from "@/hooks/use-settings";

const WORKSPACE_STATUS_DOT_WIDTH = 14;
const DEFAULT_STATUS_DOT_SIZE = 7;
const EMPHASIZED_STATUS_DOT_SIZE = 9;
const DEFAULT_STATUS_DOT_OFFSET = 0;
const EMPHASIZED_STATUS_DOT_OFFSET = -1;

const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const amberColorMapping = (theme: Theme) => ({ color: theme.colors.palette.amber[500] });
const syncedLoaderColorMapping = (theme: Theme) => ({
  color: theme.colors.palette.blue[500],
});
const blueColorMapping = (theme: Theme) => ({ color: theme.colors.palette.blue[500] });

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedSyncedLoader = withUnistyles(SyncedLoader);
const ThemedMonitor = withUnistyles(Monitor);
const ThemedFolder = withUnistyles(Folder);
const ThemedFolderGit2 = withUnistyles(FolderGit2);
const ThemedGlobe = withUnistyles(Globe);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);

type SidebarWorkspaceScriptIconKind = "service" | "command";

export function SidebarWorkspaceRowFrame({
  workspace,
  isDragging = false,
  statusSummary = null,
  statusExcludeKinds,
  children,
}: {
  workspace: SidebarWorkspaceEntry;
  isDragging?: boolean;
  statusSummary?: SidebarTabStatusSummary | null;
  statusExcludeKinds?: readonly SidebarEntryStatusKind[];
  children: (input: {
    isHovered: boolean;
    hoverHandlers: { onPointerEnter: () => void; onPointerLeave: () => void };
  }) => ReactNode;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const hoverHandlers = useMemo(
    () => ({ onPointerEnter: handlePointerEnter, onPointerLeave: handlePointerLeave }),
    [handlePointerEnter, handlePointerLeave],
  );

  return (
    <WorkspaceHoverCard
      workspace={workspace}
      prHint={workspace.prHint}
      isDragging={isDragging}
      statusSummary={statusSummary}
      statusExcludeKinds={statusExcludeKinds}
    >
      {children({ isHovered, hoverHandlers })}
    </WorkspaceHoverCard>
  );
}

export const SidebarWorkspaceRowContent = memo(function SidebarWorkspaceRowContent({
  workspace,
  subtitle,
  scriptIconKind = null,
  isHovered,
  isLoading,
  suppressStatusLoader = false,
  suppressStatusVisual = false,
  workspaceTitleSource = "title",
  shortcutNumber = null,
  showShortcutBadge = false,
  hasTrailingContent,
  leadingStatusKind = null,
  expandable = false,
  expanded = false,
  onToggleExpanded,
  children,
}: {
  workspace: SidebarWorkspaceEntry;
  subtitle?: string | null;
  scriptIconKind?: SidebarWorkspaceScriptIconKind | null;
  isHovered: boolean;
  isLoading: boolean;
  isCreating?: boolean;
  suppressStatusLoader?: boolean;
  suppressStatusVisual?: boolean;
  workspaceTitleSource?: WorkspaceTitleSource;
  shortcutNumber?: number | null;
  showShortcutBadge?: boolean;
  hasTrailingContent?: boolean;
  leadingStatusKind?: SidebarEntryStatusKind | null;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpanded?: (event: GestureResponderEvent) => void;
  children?: ReactNode;
}) {
  const primaryLabel = resolveSidebarWorkspacePrimaryLabel({
    workspace,
    workspaceTitleSource,
  });
  const shouldRenderTrailingContent = hasTrailingContent ?? children != null;
  const trailingContent = shouldRenderTrailingContent ? children : null;
  const shouldRenderScriptIcon = scriptIconKind != null;
  const shouldRenderRightContext = trailingContent != null || shouldRenderScriptIcon;

  return (
    <SidebarEntryRowContent
      leading={createElement(WorkspaceLeadingVisual, {
        workspace,
        isLoading,
        suppressStatusLoader,
        suppressStatusVisual,
        isHovered,
        expandable,
        expanded,
        onToggleExpanded,
      })}
      label={primaryLabel}
      subtitle={subtitle}
      leadingStatus={leadingStatusKind}
      rightContext={
        shouldRenderRightContext
          ? createElement(
              View,
              { style: styles.workspaceRowRight, testID: "workspace-row-right" },
              trailingContent,
              shouldRenderScriptIcon
                ? createElement(WorkspaceScriptIcon, { kind: scriptIconKind })
                : null,
            )
          : null
      }
      shortcutBadge={
        showShortcutBadge && shortcutNumber !== null
          ? createElement(SidebarWorkspaceShortcutBadge, { number: shortcutNumber })
          : null
      }
    />
  );
});

function WorkspaceLeadingVisual({
  workspace,
  isLoading,
  suppressStatusLoader,
  suppressStatusVisual,
  isHovered,
  expandable,
  expanded,
  onToggleExpanded,
}: {
  workspace: SidebarWorkspaceEntry;
  isLoading: boolean;
  suppressStatusLoader: boolean;
  suppressStatusVisual: boolean;
  isHovered: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggleExpanded?: (event: GestureResponderEvent) => void;
}) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const showExpandToggle = expandable && (isHovered || platformIsNative || isCompact);

  return (
    <View
      testID="workspace-leading-visual"
      style={expandable ? styles.workspaceLeadingExpandableSlot : styles.workspaceLeadingIconSlot}
    >
      <View style={showExpandToggle ? styles.workspaceLeadingIconHidden : undefined}>
        <WorkspaceStatusIndicator
          bucket={workspace.statusBucket}
          workspaceKind={workspace.workspaceKind}
          loading={isLoading}
          suppressLoader={suppressStatusLoader}
          suppressStatusVisual={suppressStatusVisual}
          showStatus={!expandable || !expanded}
        />
      </View>
      {expandable ? (
        <View
          style={
            showExpandToggle
              ? styles.workspaceExpandControlSlot
              : styles.workspaceExpandControlSlotHidden
          }
          pointerEvents={showExpandToggle ? "auto" : "none"}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              expanded
                ? t("sidebar.workspace.embeddedTabs.collapse")
                : t("sidebar.workspace.embeddedTabs.expand")
            }
            onPress={onToggleExpanded}
            style={styles.workspaceExpandButton}
            hitSlop={6}
          >
            {expanded ? (
              <ThemedChevronDown size={14} uniProps={foregroundMutedColorMapping} />
            ) : (
              <ThemedChevronRight size={14} uniProps={foregroundMutedColorMapping} />
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function WorkspaceScriptIcon({ kind }: { kind: SidebarWorkspaceScriptIconKind }) {
  return (
    <View
      style={styles.workspaceTitleAccessory}
      accessibilityLabel="Scripts available"
      testID={kind === "service" ? "workspace-globe-icon" : "workspace-terminal-icon"}
    >
      {kind === "service" ? (
        <ThemedGlobe size={12} uniProps={blueColorMapping} />
      ) : (
        <ThemedSquareTerminal size={12} uniProps={blueColorMapping} />
      )}
    </View>
  );
}

function WorkspaceStatusIndicator({
  bucket,
  workspaceKind,
  loading = false,
  suppressLoader = false,
  suppressStatusVisual = false,
  showStatus = true,
}: {
  bucket: SidebarWorkspaceEntry["statusBucket"];
  workspaceKind: SidebarWorkspaceEntry["workspaceKind"];
  loading?: boolean;
  suppressLoader?: boolean;
  suppressStatusVisual?: boolean;
  showStatus?: boolean;
}) {
  if (!showStatus) {
    return <WorkspaceKindIcon workspaceKind={workspaceKind} />;
  }

  if (suppressStatusVisual) {
    return <WorkspaceKindIcon workspaceKind={workspaceKind} />;
  }

  const shouldShowSyncedLoader = shouldRenderSyncedStatusLoader({ bucket });

  if (loading) {
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-loading">
        <LoadingSpinner size={8} />
      </View>
    );
  }

  if (shouldShowSyncedLoader) {
    if (suppressLoader) {
      return <WorkspaceKindIcon workspaceKind={workspaceKind} />;
    }
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-running">
        <ThemedSyncedLoader size={11} uniProps={syncedLoaderColorMapping} />
      </View>
    );
  }

  if (bucket === "needs_input") {
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-needs_input">
        <ThemedCircleAlert size={14} uniProps={amberColorMapping} />
      </View>
    );
  }

  if (bucket === "attention") {
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-attention">
        <View style={styles.standaloneStatusDot} />
      </View>
    );
  }

  if (bucket === "done") {
    return <WorkspaceKindIcon workspaceKind={workspaceKind} />;
  }

  const dotColorStyle = getStatusDotColorStyle(bucket);
  const statusDotSize = isEmphasizedStatusDotBucket(bucket)
    ? EMPHASIZED_STATUS_DOT_SIZE
    : DEFAULT_STATUS_DOT_SIZE;
  const statusDotOffset =
    statusDotSize === EMPHASIZED_STATUS_DOT_SIZE
      ? EMPHASIZED_STATUS_DOT_OFFSET
      : DEFAULT_STATUS_DOT_OFFSET;
  return (
    <View style={styles.workspaceStatusDot} testID={`workspace-status-indicator-${bucket}`}>
      <WorkspaceKindIconGlyph workspaceKind={workspaceKind} />
      {dotColorStyle ? (
        <StatusDotOverlay
          dotColorStyle={dotColorStyle}
          size={statusDotSize}
          offset={statusDotOffset}
        />
      ) : null}
    </View>
  );
}

function WorkspaceKindIcon({
  workspaceKind,
}: {
  workspaceKind: SidebarWorkspaceEntry["workspaceKind"];
}) {
  return (
    <View style={styles.workspaceStatusDot} testID={`workspace-kind-icon-${workspaceKind}`}>
      <WorkspaceKindIconGlyph workspaceKind={workspaceKind} />
    </View>
  );
}

function WorkspaceKindIconGlyph({
  workspaceKind,
}: {
  workspaceKind: SidebarWorkspaceEntry["workspaceKind"];
}) {
  let KindIcon: typeof ThemedMonitor;
  if (workspaceKind === "local_checkout") KindIcon = ThemedMonitor;
  else if (workspaceKind === "worktree") KindIcon = ThemedFolderGit2;
  else KindIcon = ThemedFolder;

  return <KindIcon size={14} uniProps={foregroundMutedColorMapping} />;
}

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
    [dotColorStyle, offset, size],
  );
  return <View style={overlayStyle} />;
}

function getStatusDotColorStyle(bucket: SidebarStateBucket) {
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

export const sidebarWorkspaceRowStyles = StyleSheet.create((theme) => ({
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  shortcutBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.surface2,
    backgroundColor: theme.colors.surface0,
    flexShrink: 0,
  },
  shortcutBadgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 14,
  },
  hidden: { opacity: 0 },
  trailingActionSlot: {
    position: "relative",
    minWidth: 18,
    height: 24,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  trailingActionOverlay: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
}));

export function SidebarWorkspaceShortcutBadge({ number }: { number: number }) {
  return (
    <View style={sidebarWorkspaceRowStyles.shortcutBadge}>
      <Text style={sidebarWorkspaceRowStyles.shortcutBadgeText}>{number}</Text>
    </View>
  );
}

export function SidebarWorkspaceTrailingActionSlot({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const resolvedStyle = useMemo(
    () =>
      style
        ? [sidebarWorkspaceRowStyles.trailingActionSlot, style]
        : sidebarWorkspaceRowStyles.trailingActionSlot,
    [style],
  );
  return <View style={resolvedStyle}>{children}</View>;
}

export function SidebarWorkspaceTrailingActionBase({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  if (!children) return null;
  return <View style={visible ? undefined : sidebarWorkspaceRowStyles.hidden}>{children}</View>;
}

export function SidebarWorkspaceTrailingActionOverlay({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  if (!visible || !children) return null;
  return <View style={sidebarWorkspaceRowStyles.trailingActionOverlay}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
  workspaceRowContent: {
    position: "relative",
  },
  workspaceRowMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    width: "100%",
  },
  workspaceLeadingIconSlot: {
    width: WORKSPACE_STATUS_DOT_WIDTH,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceLeadingExpandableSlot: {
    position: "relative",
    width: WORKSPACE_STATUS_DOT_WIDTH,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceLeadingIconHidden: {
    opacity: 0,
  },
  workspaceExpandControlSlot: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 14,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  workspaceExpandControlSlotHidden: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 14,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    opacity: 0,
  },
  workspaceExpandButton: {
    width: 14,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  workspaceContentColumn: {
    flex: 1,
    minWidth: 0,
  },
  workspaceTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  workspaceTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    minWidth: 0,
  },
  workspaceRowRight: sidebarWorkspaceRowStyles.rowRight,
  shortcutBadgeOverlay: {
    position: "absolute",
    top: 1,
    right: 0,
  },
  workspaceStatusDot: {
    position: "relative",
    width: WORKSPACE_STATUS_DOT_WIDTH,
    height: 20,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotOverlay: {
    position: "absolute",
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  standaloneStatusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.palette.green[500],
  },
  workspaceBranchText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "400",
    lineHeight: 20,
    opacity: 0.76,
    minWidth: 0,
  },
  workspaceBranchTextFlexible: {
    flex: 1,
  },
  workspaceBranchTextWithAccessory: {
    flexShrink: 1,
  },
  workspaceTitleAccessory: {
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  workspaceBranchTextCreating: {
    opacity: 0.92,
  },
  workspaceBranchTextHovered: {
    opacity: 1,
  },
  workspaceSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 14,
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
}));
