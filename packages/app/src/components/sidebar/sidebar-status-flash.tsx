import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import type { SidebarEntryStatusKind } from "@/utils/sidebar-tab-status-summary";

export interface SidebarStatusFlashSignal {
  flashKey: string;
  kind: SidebarEntryStatusKind;
}

interface SidebarStatusFlashProps {
  signal?: SidebarStatusFlashSignal | null;
}

const STATUS_FLASH_SPREAD = 20;
const STATUS_FLASH_PULSE_MS = 920;

export function SidebarStatusFlash({ signal }: SidebarStatusFlashProps) {
  const reduceMotionEnabled = useReduceMotionEnabled();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!signal || reduceMotionEnabled) {
      progress.value = 0;
      return;
    }
    progress.value = 0;
    progress.value = withSequence(
      withTiming(1, {
        duration: STATUS_FLASH_PULSE_MS,
        easing: Easing.inOut(Easing.cubic),
      }),
      withTiming(0.42, {
        duration: STATUS_FLASH_PULSE_MS,
        easing: Easing.inOut(Easing.cubic),
      }),
      withTiming(0.88, {
        duration: STATUS_FLASH_PULSE_MS,
        easing: Easing.inOut(Easing.cubic),
      }),
      withTiming(0, {
        duration: STATUS_FLASH_PULSE_MS * 1.35,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [progress, reduceMotionEnabled, signal]);

  const outerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.68,
    transform: [{ scale: 0.92 + progress.value * 0.18 }],
  }));
  const coreAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.46,
    transform: [{ scale: 0.84 + progress.value * 0.12 }],
  }));
  const statusStyle = useMemo(() => (signal ? getStatusFlashStyle(signal.kind) : null), [signal]);
  const outerStyle = useMemo(
    () => [styles.glow, statusStyle, outerAnimatedStyle],
    [outerAnimatedStyle, statusStyle],
  );
  const coreStyle = useMemo(
    () => [styles.glow, styles.glowCore, statusStyle, coreAnimatedStyle],
    [coreAnimatedStyle, statusStyle],
  );

  if (!signal || !statusStyle) {
    return null;
  }

  return (
    <>
      <Animated.View pointerEvents="none" style={outerStyle} />
      <Animated.View pointerEvents="none" style={coreStyle} />
    </>
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
      return null;
    });
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setEnabled);
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  return enabled;
}

function getStatusFlashStyle(kind: SidebarEntryStatusKind) {
  switch (kind) {
    case "input_required":
      return styles.amber;
    case "unread":
      return styles.green;
    case "failed":
      return styles.red;
    case "queued_messages":
    case "draft":
    case "in_progress":
      return null;
  }
}

const styles = StyleSheet.create((theme) => ({
  glow: {
    position: "absolute",
    left: -STATUS_FLASH_SPREAD,
    right: -STATUS_FLASH_SPREAD,
    top: -STATUS_FLASH_SPREAD,
    bottom: -STATUS_FLASH_SPREAD,
    borderRadius: 999,
    zIndex: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: STATUS_FLASH_SPREAD,
    elevation: 8,
  },
  glowCore: {
    left: -10,
    right: -10,
    top: -10,
    bottom: -10,
    shadowRadius: 12,
  },
  amber: {
    backgroundColor: theme.colors.palette.amber[500],
    shadowColor: theme.colors.palette.amber[500],
  },
  green: {
    backgroundColor: theme.colors.palette.green[500],
    shadowColor: theme.colors.palette.green[500],
  },
  red: {
    backgroundColor: theme.colors.palette.red[500],
    shadowColor: theme.colors.palette.red[500],
  },
}));
