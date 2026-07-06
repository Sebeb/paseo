import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SidebarEntryStatusIconBadge } from "@/components/sidebar/sidebar-entry-row";
import type {
  SidebarEntryStatusKind,
  SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";
import {
  getSidebarEntryStatusCount,
  getVisibleSidebarEntryStatusKinds,
} from "@/utils/sidebar-tab-status-summary";

interface SidebarEntryStatusExplainerRowsProps {
  summary: SidebarTabStatusSummary | null | undefined;
  excludeKinds?: readonly SidebarEntryStatusKind[];
  testIDPrefix?: string;
}

export function SidebarEntryStatusExplainerRows({
  summary,
  excludeKinds,
  testIDPrefix = "sidebar-entry-status-explainer",
}: SidebarEntryStatusExplainerRowsProps) {
  const { t } = useTranslation();
  if (!summary) {
    return null;
  }
  const kinds = getVisibleSidebarEntryStatusKinds(summary, { excludeKinds });
  if (kinds.length === 0) {
    return null;
  }

  return (
    <>
      {kinds.map((kind) => {
        const count = getSidebarEntryStatusCount(summary, kind);
        return (
          <View key={kind} style={styles.row} testID={`${testIDPrefix}-${kind}`}>
            <View style={styles.iconSlot}>
              <SidebarEntryStatusIconBadge kind={kind} testID={`${testIDPrefix}-icon-${kind}`} />
            </View>
            <Text style={styles.text} numberOfLines={1}>
              {getStatusExplainerLabel(t, kind, count)}
            </Text>
          </View>
        );
      })}
    </>
  );
}

function getStatusExplainerLabel(
  t: TFunction,
  kind: SidebarEntryStatusKind,
  count: number,
): string {
  switch (kind) {
    case "queued_messages":
      return t("sidebar.statusBadges.explainers.queuedMessages", { count });
    case "draft":
      return t("sidebar.statusBadges.explainers.draft", { count });
    case "input_required":
      return t("sidebar.statusBadges.explainers.inputRequired", { count });
    case "unread":
      return t("sidebar.statusBadges.explainers.unread", { count });
    case "in_progress":
      return t("sidebar.statusBadges.explainers.inProgress", { count });
    case "failed":
      return t("sidebar.statusBadges.explainers.failed", { count });
  }
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[2],
  },
  iconSlot: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 14,
  },
}));
