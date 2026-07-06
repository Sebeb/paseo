import { memo, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CircleAlert, CircleX, MessageSquareText, SquarePen } from "lucide-react-native";
import { SyncedLoader } from "@/components/synced-loader";
import type {
  SidebarEntryStatusKind,
  SidebarEntryStatusSingleIcon,
  SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";
import {
  SIDEBAR_ENTRY_STATUS_DEFINITIONS,
  getPrimarySidebarEntryStatusKind,
  getSidebarEntryStatusCount,
  getVisibleSidebarEntryStatusKinds,
} from "@/utils/sidebar-tab-status-summary";
import type { Theme } from "@/styles/theme";

const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedCircleX = withUnistyles(CircleX);
const ThemedMessageSquareText = withUnistyles(MessageSquareText);
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedSyncedLoader = withUnistyles(SyncedLoader);

const blackColorMapping = () => ({ color: "#000000" });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const amberColorMapping = (theme: Theme) => ({ color: theme.colors.palette.amber[500] });
const blueColorMapping = (theme: Theme) => ({ color: theme.colors.palette.blue[500] });
const redColorMapping = (theme: Theme) => ({ color: theme.colors.palette.red[500] });

export const SIDEBAR_ENTRY_ROW_HEIGHT = 36;
const STATUS_BADGE_IN_PROGRESS_LOADER_SIZE = 14;

export const SidebarEntryRowContent = memo(function SidebarEntryRowContent({
  leading,
  hoverLeading = null,
  showHoverLeading = false,
  leadingBadge = null,
  leadingStatus,
  label,
  labelPrefix = null,
  subtitle = null,
  subtitleLeading = null,
  rightContext = null,
  hoverRightContext = null,
  showHoverRightContext = false,
  shortcutBadge = null,
}: {
  leading: ReactNode;
  hoverLeading?: ReactNode;
  showHoverLeading?: boolean;
  leadingBadge?: ReactNode;
  leadingStatus?: SidebarEntryStatusKind | null;
  label: string;
  labelPrefix?: ReactNode;
  subtitle?: string | null;
  subtitleLeading?: ReactNode;
  rightContext?: ReactNode;
  hoverRightContext?: ReactNode;
  showHoverRightContext?: boolean;
  shortcutBadge?: ReactNode;
}) {
  const resolvedRightContext = showHoverRightContext ? hoverRightContext : rightContext;
  const rootStyle = subtitle ? styles.rootWithSubtitle : styles.root;
  return (
    <View style={rootStyle}>
      <SidebarEntryLeadingSlot
        leading={leading}
        hoverLeading={hoverLeading}
        showHoverLeading={showHoverLeading}
        leadingStatus={leadingStatus}
        leadingBadge={leadingBadge}
      />
      <View style={styles.textColumn}>
        <SidebarEntryLabel label={label} labelPrefix={labelPrefix} />
        <SidebarEntrySubtitle subtitle={subtitle} subtitleLeading={subtitleLeading} />
      </View>
      {resolvedRightContext ? (
        <View style={styles.rightContext}>{resolvedRightContext}</View>
      ) : null}
      {shortcutBadge ? (
        <View style={styles.shortcutOverlay} pointerEvents="none">
          {shortcutBadge}
        </View>
      ) : null}
    </View>
  );
});

function SidebarEntryLeadingSlot({
  leading,
  hoverLeading,
  showHoverLeading,
  leadingStatus,
  leadingBadge,
}: {
  leading: ReactNode;
  hoverLeading: ReactNode;
  showHoverLeading: boolean;
  leadingStatus?: SidebarEntryStatusKind | null;
  leadingBadge: ReactNode;
}) {
  const showOverlay = showHoverLeading && hoverLeading;
  return (
    <View style={styles.leadingSlot}>
      <View style={showOverlay ? styles.hidden : undefined}>{leading}</View>
      {showOverlay ? <View style={styles.leadingOverlay}>{hoverLeading}</View> : null}
      {leadingStatus ? <SidebarEntryLeadingStatusBadge kind={leadingStatus} /> : null}
      {leadingBadge ? <View style={styles.leadingBadge}>{leadingBadge}</View> : null}
    </View>
  );
}

function SidebarEntryLabel({ label, labelPrefix }: { label: string; labelPrefix: ReactNode }) {
  return (
    <View style={styles.labelRow}>
      {labelPrefix ? <View style={styles.labelPrefix}>{labelPrefix}</View> : null}
      <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>
    </View>
  );
}

function SidebarEntrySubtitle({
  subtitle,
  subtitleLeading,
}: {
  subtitle: string | null;
  subtitleLeading: ReactNode;
}) {
  if (!subtitle) {
    return null;
  }
  return (
    <View style={styles.subtitleRow}>
      {subtitleLeading ? <View style={styles.subtitleLeading}>{subtitleLeading}</View> : null}
      <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
        {subtitle}
      </Text>
    </View>
  );
}

export function SidebarEntryStatusBadges({
  summary,
  excludeKinds,
}: {
  summary: SidebarTabStatusSummary;
  excludeKinds?: readonly SidebarEntryStatusKind[];
}) {
  const kinds = getVisibleSidebarEntryStatusKinds(summary, { excludeKinds });
  if (kinds.length === 0) {
    return null;
  }
  return (
    <View style={styles.statusBadgeRow}>
      {kinds.map((kind) => (
        <SidebarEntryStatusBadge
          key={kind}
          kind={kind}
          count={getSidebarEntryStatusCount(summary, kind)}
        />
      ))}
    </View>
  );
}

export function SidebarEntryPrimaryStatusBadge({ summary }: { summary: SidebarTabStatusSummary }) {
  const kind = getPrimarySidebarEntryStatusKind(summary);
  if (!kind) {
    return null;
  }
  return <SidebarEntryLeadingStatusBadge kind={kind} />;
}

function SidebarEntryStatusBadge({ kind, count }: { kind: SidebarEntryStatusKind; count: number }) {
  const definition = SIDEBAR_ENTRY_STATUS_DEFINITIONS[kind];
  const badgeStyle = useMemo(() => [styles.statusBadge, getStatusBadgeColorStyle(kind)], [kind]);
  const countLabel = formatStatusBadgeCount(count);
  if (count <= 0) {
    return null;
  }
  if (count === 1 && definition.singleIcon) {
    return (
      <View style={styles.statusBadgeCustomIcon} testID={`sidebar-entry-status-badge-${kind}`}>
        <SingleStatusIcon icon={definition.singleIcon} />
      </View>
    );
  }
  if (kind === "draft") {
    return (
      <View style={styles.statusBadgePlain} testID={`sidebar-entry-status-badge-${kind}`}>
        <ThemedSquarePen size={12} uniProps={mutedColorMapping} />
      </View>
    );
  }
  if (kind === "in_progress") {
    return (
      <View style={styles.statusBadgePlain} testID={`sidebar-entry-status-badge-${kind}`}>
        <ThemedSyncedLoader
          size={STATUS_BADGE_IN_PROGRESS_LOADER_SIZE}
          uniProps={blueColorMapping}
        />
        {shouldShowStatusCount(kind, count) ? (
          <View style={styles.statusBadgeInProgressCountOverlay} pointerEvents="none">
            <Text style={styles.statusBadgeInProgressCountText}>{countLabel}</Text>
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={badgeStyle} testID={`sidebar-entry-status-badge-${kind}`}>
      {shouldShowStatusCount(kind, count) ? (
        <Text style={styles.statusBadgeCount}>{countLabel}</Text>
      ) : (
        <StatusBadgeIcon kind={kind} />
      )}
    </View>
  );
}

function SingleStatusIcon({ icon }: { icon: SidebarEntryStatusSingleIcon }) {
  switch (icon) {
    case "input_required":
      return <ThemedCircleAlert size={14} uniProps={amberColorMapping} />;
    case "failed":
      return <ThemedCircleX size={14} uniProps={redColorMapping} />;
  }
}

function SidebarEntryLeadingStatusBadge({ kind }: { kind: SidebarEntryStatusKind }) {
  const badgeStyle = useMemo(
    () => [styles.leadingStatusBadge, getStatusBadgeColorStyle(kind)],
    [kind],
  );
  return (
    <View style={badgeStyle}>
      <SidebarEntryLeadingStatusBadgeContent kind={kind} />
    </View>
  );
}

function SidebarEntryLeadingStatusBadgeContent({ kind }: { kind: SidebarEntryStatusKind }) {
  if (kind === "draft") {
    return <ThemedSquarePen size={7} uniProps={mutedColorMapping} />;
  }
  if (kind === "in_progress") {
    return <ThemedSyncedLoader size={7} uniProps={blueColorMapping} />;
  }
  return null;
}

function StatusBadgeIcon({ kind }: { kind: SidebarEntryStatusKind }) {
  switch (kind) {
    case "queued_messages":
      return <ThemedMessageSquareText size={10} uniProps={mutedColorMapping} />;
    case "input_required":
      return <ThemedCircleAlert size={10} uniProps={blackColorMapping} />;
    case "failed":
      return <ThemedCircleX size={10} uniProps={blackColorMapping} />;
    case "unread":
    case "draft":
    case "in_progress":
      return null;
  }
}

function shouldShowStatusCount(kind: SidebarEntryStatusKind, count: number): boolean {
  const mode = SIDEBAR_ENTRY_STATUS_DEFINITIONS[kind].countMode;
  if (mode === "always") {
    return true;
  }
  if (mode === "off") {
    return false;
  }
  return count > 1;
}

function formatStatusBadgeCount(count: number): string {
  return count >= 10 ? "+" : String(count);
}

function getStatusBadgeColorStyle(kind: SidebarEntryStatusKind) {
  switch (kind) {
    case "queued_messages":
      return styles.statusBadgeQueued;
    case "input_required":
      return styles.statusBadgeInputRequired;
    case "unread":
      return styles.statusBadgeUnread;
    case "in_progress":
      return styles.statusBadgeInProgress;
    case "failed":
      return styles.statusBadgeFailed;
    case "draft":
      return styles.statusBadgeDraft;
  }
}

const styles = StyleSheet.create((theme) => ({
  root: {
    position: "relative",
    height: SIDEBAR_ENTRY_ROW_HEIGHT,
    minHeight: SIDEBAR_ENTRY_ROW_HEIGHT,
    maxHeight: SIDEBAR_ENTRY_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    width: "100%",
    overflow: "hidden",
  },
  rootWithSubtitle: {
    position: "relative",
    height: 46,
    minHeight: 46,
    maxHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    width: "100%",
    overflow: "hidden",
  },
  leadingSlot: {
    position: "relative",
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  leadingOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  hidden: {
    opacity: 0,
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  labelRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  labelPrefix: {
    flexShrink: 0,
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 20,
    minWidth: 0,
    flexShrink: 1,
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 14,
    minWidth: 0,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minWidth: 0,
  },
  subtitleLeading: {
    width: 10,
    height: 10,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  rightContext: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    flexShrink: 0,
    maxWidth: "70%",
    overflow: "hidden",
  },
  shortcutOverlay: {
    position: "absolute",
    top: 9,
    right: 0,
  },
  statusBadgeRow: {
    height: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    flexShrink: 0,
  },
  statusBadge: {
    width: 14,
    height: 14,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusBadgePlain: {
    position: "relative",
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusBadgeCustomIcon: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statusBadgeCount: {
    color: "#000000",
    fontSize: 10,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 12,
  },
  statusBadgeInProgressCountOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeInProgressCountText: {
    color: theme.colors.palette.blue[500],
    fontSize: 10,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 12,
  },
  leadingStatusBadge: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.surface0,
    alignItems: "center",
    justifyContent: "center",
  },
  leadingBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: theme.colors.surface0,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeQueued: {
    backgroundColor: "rgba(113, 113, 122, 0.35)",
  },
  statusBadgeInputRequired: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  statusBadgeUnread: {
    backgroundColor: theme.colors.palette.green[500],
  },
  statusBadgeInProgress: {
    backgroundColor: theme.colors.palette.blue[500],
  },
  statusBadgeFailed: {
    backgroundColor: theme.colors.palette.red[500],
  },
  statusBadgeDraft: {
    backgroundColor: "transparent",
  },
}));
