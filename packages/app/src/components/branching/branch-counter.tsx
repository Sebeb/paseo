import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import type { AgentBranchGroupMember } from "@getpaseo/protocol/agent-types";

export interface MessageBranchInfo {
  groupId: string;
  current: AgentBranchGroupMember;
  members: AgentBranchGroupMember[];
}

interface BranchCounterProps {
  branchInfo: MessageBranchInfo;
  onNavigate: (member: AgentBranchGroupMember, viewportY: number | null) => void;
}

export const BranchCounter = memo(function BranchCounter({
  branchInfo,
  onNavigate,
}: BranchCounterProps) {
  const { theme } = useUnistyles();
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const members = branchInfo.members;
  const currentIndex = useMemo(
    () => members.findIndex((member) => member.agentId === branchInfo.current.agentId),
    [branchInfo.current.agentId, members],
  );
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < members.length - 1;
  const controlsVisible = isHovered || isNative || isCompact;
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const navigatePrevious = useCallback(() => {
    if (!canGoPrevious) {
      return;
    }
    const member = members[currentIndex - 1];
    if (member) {
      onNavigate(member, null);
    }
  }, [canGoPrevious, currentIndex, members, onNavigate]);
  const navigateNext = useCallback(() => {
    if (!canGoNext) {
      return;
    }
    const member = members[currentIndex + 1];
    if (member) {
      onNavigate(member, null);
    }
  }, [canGoNext, currentIndex, members, onNavigate]);

  if (members.length < 2 || currentIndex < 0) {
    return null;
  }
  const navButtonStyle = controlsVisible
    ? styles.navButton
    : branchCounterStylesheet.navButtonHiddenCombined;

  return (
    <View
      style={styles.container}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      testID="branch-counter"
    >
      <Pressable
        accessibilityLabel="Previous branch"
        accessibilityRole="button"
        disabled={!canGoPrevious}
        onPress={navigatePrevious}
        style={navButtonStyle}
      >
        <ChevronLeft
          size={14}
          color={canGoPrevious ? theme.colors.foregroundMuted : theme.colors.border}
        />
      </Pressable>
      <Text style={styles.counterText}>
        {branchInfo.current.ordinal}/{members.length}
      </Text>
      <Pressable
        accessibilityLabel="Next branch"
        accessibilityRole="button"
        disabled={!canGoNext}
        onPress={navigateNext}
        style={navButtonStyle}
      >
        <ChevronRight
          size={14}
          color={canGoNext ? theme.colors.foregroundMuted : theme.colors.border}
        />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    minWidth: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
  },
  counterText: {
    minWidth: 24,
    textAlign: "center",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  navButton: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  navButtonHidden: {
    opacity: 0,
  },
}));

const branchCounterStylesheet = StyleSheet.create(() => ({
  navButtonHiddenCombined: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
  },
}));
