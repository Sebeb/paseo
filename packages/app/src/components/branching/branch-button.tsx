import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { GitBranch } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface BranchButtonProps {
  isPending?: boolean;
  rewoundText: string;
  onBranch: (input: { rewoundText: string }) => Promise<void> | void;
}

export const BranchButton = memo(function BranchButton({
  isPending = false,
  rewoundText,
  onBranch,
}: BranchButtonProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const label = t("branch.tooltip", { defaultValue: "Branch from here" });
  const handlePress = useCallback(async () => {
    if (isPending) {
      return;
    }
    await onBranch({ rewoundText });
  }, [isPending, onBranch, rewoundText]);
  const triggerStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType) => [
      styles.trigger,
      (hovered || pressed) && styles.triggerHovered,
      isPending && styles.triggerDisabled,
    ],
    [isPending],
  );
  const tooltipContent = useMemo(
    () => (
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    ),
    [label],
  );

  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <View style={styles.triggerSlot} collapsable={false}>
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            disabled={isPending}
            onPress={handlePress}
            style={triggerStyle}
            testID="branch-button"
          >
            {({ hovered, pressed }) => (
              <GitBranch
                size={16}
                color={hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
              />
            )}
          </Pressable>
        </View>
      </TooltipTrigger>
      {tooltipContent}
    </Tooltip>
  );
});

const styles = StyleSheet.create((theme) => ({
  trigger: {
    padding: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface1,
  },
  triggerDisabled: {
    opacity: theme.opacity[50],
  },
  triggerSlot: {
    alignSelf: "center",
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
}));
