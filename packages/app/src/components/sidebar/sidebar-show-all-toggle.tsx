import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function SidebarShowAllToggle({
  expanded,
  totalCount,
  indent = "nested",
  testID,
  onPress,
}: {
  expanded: boolean;
  totalCount: number;
  indent?: "none" | "nested";
  testID?: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const toggleStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.toggle,
      indent === "nested" ? styles.toggleNested : null,
      (hovered || pressed) && styles.toggleHovered,
    ],
    [indent],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        expanded
          ? t("sidebar.workspace.embeddedTabs.showLessLabel")
          : t("sidebar.workspace.embeddedTabs.showAllLabel")
      }
      onPress={onPress}
      style={toggleStyle}
      testID={testID}
    >
      <Text style={styles.toggleText}>
        {expanded
          ? t("sidebar.workspace.embeddedTabs.showLess")
          : t("sidebar.workspace.embeddedTabs.showAll", { count: totalCount })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  toggle: {
    minHeight: 30,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    alignItems: "flex-start",
    justifyContent: "center",
    width: "100%",
    userSelect: "none",
  },
  toggleNested: {
    paddingLeft: theme.spacing[3] + theme.spacing[3],
  },
  toggleHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  toggleText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
}));
