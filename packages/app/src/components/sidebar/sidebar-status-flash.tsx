import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo } from "react-native";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { EdgeGlow, EdgeGlowFill, type EdgeGlowVariant } from "@/components/ui/edge-glow";
import type { SidebarEntryStatusKind } from "@/utils/sidebar-tab-status-summary";

export interface SidebarStatusFlashSignal {
  flashKey: string;
  kind: SidebarEntryStatusKind;
}

interface SidebarStatusFlashProps {
  signal?: SidebarStatusFlashSignal | null;
  variant?: EdgeGlowVariant;
  showFill?: boolean;
}

const STATUS_FLASH_PULSE_MS = 760;

export function SidebarStatusFlash({
  signal,
  variant = "row",
  showFill = true,
}: SidebarStatusFlashProps) {
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
        duration: STATUS_FLASH_PULSE_MS * 0.55,
        easing: Easing.out(Easing.cubic),
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

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value * (variant === "badge" ? 0.78 : 0.74),
  }));
  const fillAnimatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value * (variant === "badge" ? 0.16 : 0.92),
  }));
  const statusStyle = useMemo(() => (signal ? getStatusFlashStyle(signal.kind) : null), [signal]);
  const fillStyle = useMemo(() => (signal ? getStatusFlashFillStyle(signal.kind) : null), [signal]);

  if (!signal || !statusStyle) {
    return null;
  }

  return (
    <>
      <EdgeGlow colorStyle={statusStyle} variant={variant} style={glowAnimatedStyle} />
      {showFill && fillStyle ? (
        <EdgeGlowFill colorStyle={fillStyle} variant={variant} style={fillAnimatedStyle} />
      ) : null}
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

function getStatusFlashFillStyle(kind: SidebarEntryStatusKind) {
  switch (kind) {
    case "input_required":
      return styles.amberFill;
    case "unread":
      return styles.greenFill;
    case "failed":
      return styles.redFill;
    case "queued_messages":
    case "draft":
    case "in_progress":
      return null;
  }
}

function blendHexColors(base: string | undefined, overlay: string, amount: number): string {
  const baseRgb = parseHexColor(base);
  const overlayRgb = parseHexColor(overlay);
  if (!baseRgb || !overlayRgb) {
    return overlay;
  }
  const mix = (baseChannel: number, overlayChannel: number) =>
    Math.round(baseChannel + (overlayChannel - baseChannel) * amount);
  return `rgb(${mix(baseRgb.r, overlayRgb.r)}, ${mix(baseRgb.g, overlayRgb.g)}, ${mix(
    baseRgb.b,
    overlayRgb.b,
  )})`;
}

function parseHexColor(value: string | undefined): { r: number; g: number; b: number } | null {
  if (!value) {
    return null;
  }
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) {
    return null;
  }
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

const styles = StyleSheet.create((theme) => ({
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
  amberFill: {
    backgroundColor: blendHexColors(
      theme.colors.surfaceSidebar,
      theme.colors.palette.amber[500],
      0.12,
    ),
  },
  greenFill: {
    backgroundColor: blendHexColors(
      theme.colors.surfaceSidebar,
      theme.colors.palette.green[500],
      0.12,
    ),
  },
  redFill: {
    backgroundColor: blendHexColors(
      theme.colors.surfaceSidebar,
      theme.colors.palette.red[500],
      0.13,
    ),
  },
}));
