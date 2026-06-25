import type { ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { WorkspaceTabPresentation } from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";

export function WorkspaceTabTooltipPreview({
  tab,
  presentation,
  tooltipLabel,
  orientation,
}: {
  tab: WorkspaceTabDescriptor;
  presentation: WorkspaceTabPresentation;
  tooltipLabel: string;
  orientation: "horizontal" | "vertical";
}): ReactElement {
  const subtitle = presentation.subtitle.trim();
  const showSubtitle = subtitle.length > 0 && subtitle !== tooltipLabel;
  const subtitleLineCount = orientation === "vertical" ? 4 : 1;

  return (
    <View style={styles.tooltipColumn}>
      {tab.target.kind === "agent" ? (
        <View style={styles.tooltipAgentRow}>
          <Text style={styles.tooltipText}>{tooltipLabel}</Text>
          <Text style={styles.tooltipAgentId}>{tab.target.agentId.slice(0, 7)}</Text>
        </View>
      ) : (
        <Text style={styles.tooltipText}>{tooltipLabel}</Text>
      )}
      {showSubtitle ? (
        <Text style={styles.tooltipSubtitle} numberOfLines={subtitleLineCount} ellipsizeMode="tail">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  tooltipAgentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipColumn: {
    maxWidth: 260,
    gap: theme.spacing[1],
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  tooltipSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
  },
  tooltipAgentId: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
