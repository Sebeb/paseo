import {
  createElement,
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  Check,
  CalendarPlus,
  CircleCheck,
  CircleDot,
  CircleX,
  Copy,
  Clock3,
  ExternalLink,
  Folder,
  GitBranch,
} from "lucide-react-native";
import { GitHubIcon } from "@/components/icons/github-icon";
import type { Theme } from "@/styles/theme";
import { DiffStat } from "@/components/diff-stat";
import { Pressable } from "react-native";
import type { GestureResponderEvent } from "react-native";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import type { PrHint } from "@/git/use-pr-status-query";
import { openExternalUrl } from "@/utils/open-external-url";
import { shortenPath } from "@/utils/shorten-path";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import { PrBadge } from "@/components/sidebar-workspace-list";
import { formatAbsoluteDateTime, formatRecentOrAbsoluteDateTime } from "@/utils/time";
import { InfoHoverCard } from "@/components/info-hover-card";
import { SidebarEntryStatusExplainerRows } from "@/components/sidebar/sidebar-entry-status-explainer-rows";
import type {
  SidebarEntryStatusKind,
  SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";

interface WorkspaceHoverCardProps {
  workspace: SidebarWorkspaceEntry;
  prHint: PrHint | null;
  isDragging: boolean;
  statusSummary?: SidebarTabStatusSummary | null;
  statusExcludeKinds?: readonly SidebarEntryStatusKind[];
}

export function WorkspaceHoverCard({
  workspace,
  prHint,
  isDragging,
  statusSummary = null,
  statusExcludeKinds,
  children,
}: PropsWithChildren<WorkspaceHoverCardProps>): ReactNode {
  const { t } = useTranslation();
  const content = useMemo(
    () =>
      createElement(WorkspaceHoverCardContent, {
        workspace,
        prHint,
        statusSummary,
        statusExcludeKinds,
      }),
    [prHint, statusExcludeKinds, statusSummary, workspace],
  );
  return (
    <InfoHoverCard
      content={content}
      accessibilityLabel={t("workspace.hoverCard.scriptsAccessibility")}
      testID="workspace-hover-card"
      isDragging={isDragging}
    >
      {children}
    </InfoHoverCard>
  );
}

function WorkspaceHoverCardContent({
  workspace,
  prHint,
  statusSummary,
  statusExcludeKinds,
}: {
  workspace: SidebarWorkspaceEntry;
  prHint: PrHint | null;
  statusSummary: SidebarTabStatusSummary | null;
  statusExcludeKinds?: readonly SidebarEntryStatusKind[];
}): ReactElement {
  const { t } = useTranslation();
  const cwdDisplay = shortenPath(workspace.workspaceDirectory);

  return (
    <>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} testID="hover-card-workspace-name">
          {workspace.name}
        </Text>
      </View>
      {workspace.currentBranch ? (
        <CopyableInfoRow
          icon={ThemedGitBranch}
          value={workspace.currentBranch}
          copyValue={workspace.currentBranch}
          copyLabel={t("workspace.hoverCard.copyBranchName")}
          testID="hover-card-workspace-branch"
        />
      ) : null}
      {cwdDisplay ? (
        <CopyableInfoRow
          icon={ThemedFolder}
          value={cwdDisplay}
          copyValue={workspace.workspaceDirectory ?? ""}
          copyLabel={t("workspace.hoverCard.copyPath")}
          testID="hover-card-workspace-cwd"
        />
      ) : null}
      {workspace.createdAt ? (
        <InfoRow
          icon={ThemedCalendarPlus}
          value={t("workspace.hoverCard.created", {
            value: formatAbsoluteDateTime(workspace.createdAt),
          })}
          testID="hover-card-workspace-created"
        />
      ) : null}
      {workspace.activityAt ? (
        <InfoRow
          icon={ThemedClock3}
          value={t("workspace.hoverCard.updated", {
            value: formatRecentOrAbsoluteDateTime(workspace.activityAt),
          })}
          testID="hover-card-workspace-updated"
        />
      ) : null}
      {prHint || workspace.diffStat ? (
        <View style={styles.cardMetaRow}>
          {workspace.diffStat ? (
            <DiffStat
              additions={workspace.diffStat.additions}
              deletions={workspace.diffStat.deletions}
            />
          ) : null}
          {prHint ? <PrBadge hint={prHint} /> : null}
        </View>
      ) : null}
      {prHint?.checks && prHint.checks.length > 0 ? (
        <>
          <View style={styles.separator} />
          <ChecksSummaryPressable checks={prHint.checks} url={prHint.url} />
        </>
      ) : null}
      <SidebarEntryStatusExplainerRows
        summary={statusSummary}
        excludeKinds={statusExcludeKinds}
        testIDPrefix={`workspace-hover-card-status-${workspace.workspaceKey}`}
      />
    </>
  );
}

const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedFolder = withUnistyles(Folder);
const ThemedCalendarPlus = withUnistyles(CalendarPlus);
const ThemedClock3 = withUnistyles(Clock3);
const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedGitHubIcon = withUnistyles(GitHubIcon);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedCircleDot = withUnistyles(CircleDot);
const ThemedCircleX = withUnistyles(CircleX);
const ThemedCopy = withUnistyles(Copy);
const ThemedCheck = withUnistyles(Check);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const successColorMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });
const warningColorMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });
const dangerColorMapping = (theme: Theme) => ({ color: theme.colors.statusDanger });

function InfoRow({
  icon: Icon,
  value,
  testID,
}: {
  icon: React.ComponentType<React.ComponentProps<typeof ThemedGitBranch>>;
  value: string;
  testID: string;
}) {
  return (
    <View style={styles.cardInfoRow}>
      <Icon size={12} uniProps={foregroundMutedColorMapping} />
      <Text style={styles.cardInfoText} numberOfLines={1} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function CopyableInfoRow({
  icon: Icon,
  value,
  copyValue,
  copyLabel,
  testID,
}: {
  icon: React.ComponentType<React.ComponentProps<typeof ThemedGitBranch>>;
  value: string;
  copyValue: string;
  copyLabel: string;
  testID: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePressIn = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
  }, []);

  const handlePress = useCallback(() => {
    void copyToClipboard(copyValue);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }, [copyValue]);

  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);

  let iconUniProps = foregroundMutedColorMapping;
  if (copied || isHovered) {
    iconUniProps = foregroundColorMapping;
  }
  const textStyle = copied || isHovered ? cardInfoTextHoveredCombined : styles.cardInfoText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copyLabel}
      style={styles.cardInfoRow}
      hitSlop={4}
      onPressIn={handlePressIn}
      onPress={handlePress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
    >
      {(() => {
        if (copied) {
          return <ThemedCheck size={12} uniProps={iconUniProps} />;
        }
        if (isHovered) {
          return <ThemedCopy size={12} uniProps={iconUniProps} />;
        }
        return <Icon size={12} uniProps={iconUniProps} />;
      })()}
      <Text style={textStyle} numberOfLines={1} testID={testID}>
        {value}
      </Text>
    </Pressable>
  );
}

function getChecksSummaryCounts(checks: NonNullable<PrHint["checks"]>) {
  return checks.reduce(
    (counts, check) => {
      if (check.status === "success") counts.passed += 1;
      else if (check.status === "failure") counts.failed += 1;
      else if (check.status !== "skipped" && check.status !== "cancelled") counts.pending += 1;
      return counts;
    },
    { passed: 0, failed: 0, pending: 0 },
  );
}

function ChecksSummaryPill({
  count,
  kind,
}: {
  count: number;
  kind: "passed" | "failed" | "pending";
}) {
  if (count === 0) return null;

  if (kind === "passed") {
    return (
      <View style={styles.checksSummaryPill}>
        <ThemedCircleCheck size={12} uniProps={successColorMapping} />
        <Text style={styles.checksStatusTextPassed}>{count}</Text>
      </View>
    );
  }

  if (kind === "failed") {
    return (
      <View style={styles.checksSummaryPill}>
        <ThemedCircleX size={12} uniProps={dangerColorMapping} />
        <Text style={styles.checksStatusTextFailed}>{count}</Text>
      </View>
    );
  }

  return (
    <View style={styles.checksSummaryPill}>
      <ThemedCircleDot size={12} uniProps={warningColorMapping} />
      <Text style={styles.checksStatusTextPending}>{count}</Text>
    </View>
  );
}

function ChecksSummaryContent({
  checks,
  hovered,
}: {
  checks: NonNullable<PrHint["checks"]>;
  hovered: boolean;
}) {
  const { t } = useTranslation();
  const { passed, failed, pending } = getChecksSummaryCounts(checks);

  const labelStyle = hovered ? checksSummaryLabelHoveredCombined : styles.checksSummaryLabel;
  const iconUniProps = hovered ? foregroundColorMapping : foregroundMutedColorMapping;

  return (
    <>
      {hovered ? (
        <ThemedExternalLink size={12} uniProps={iconUniProps} />
      ) : (
        <ThemedGitHubIcon size={12} uniProps={iconUniProps} />
      )}
      <Text style={labelStyle}>{t("workspace.git.pr.sections.checks")}</Text>
      <View style={styles.checksSummaryCounts}>
        <ChecksSummaryPill count={passed} kind="passed" />
        <ChecksSummaryPill count={failed} kind="failed" />
        <ChecksSummaryPill count={pending} kind="pending" />
      </View>
    </>
  );
}

function ChecksSummaryPressable({
  checks,
  url,
}: {
  checks: NonNullable<PrHint["checks"]>;
  url: string;
}) {
  const handlePress = useCallback(() => {
    void openExternalUrl(`${url}/checks`);
  }, [url]);

  const renderChildren = useCallback(
    ({ hovered }: { pressed: boolean; hovered?: boolean }) => (
      <ChecksSummaryContent checks={checks} hovered={Boolean(hovered)} />
    ),
    [checks],
  );

  return (
    <Pressable style={checksSummaryPressableStyle} onPress={handlePress}>
      {renderChildren}
    </Pressable>
  );
}

function checksSummaryPressableStyle({ hovered = false }: { pressed: boolean; hovered?: boolean }) {
  return [styles.checksSummaryRow, hovered && styles.listRowHovered];
}

const styles = StyleSheet.create((theme) => ({
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  cardTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    flex: 1,
    minWidth: 0,
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  cardInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  cardInfoText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  cardInfoTextHovered: {
    color: theme.colors.foreground,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  listRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  checksSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 6,
    minHeight: 28,
  },
  checksSummaryLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  checksSummaryLabelHovered: {
    color: theme.colors.foreground,
  },
  checksSummaryCounts: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flex: 1,
    justifyContent: "flex-end",
  },
  checksSummaryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  checksStatusTextFailed: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusDanger,
  },
  checksStatusTextPending: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusWarning,
  },
  checksStatusTextPassed: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusSuccess,
  },
}));

const checksSummaryLabelHoveredCombined = [
  styles.checksSummaryLabel,
  styles.checksSummaryLabelHovered,
];

const cardInfoTextHoveredCombined = [styles.cardInfoText, styles.cardInfoTextHovered];
