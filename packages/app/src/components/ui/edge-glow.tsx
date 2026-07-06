import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import type { AnimatedStyle } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";

export type EdgeGlowVariant = "row" | "badge";

interface EdgeGlowProps {
  colorStyle: StyleProp<ViewStyle>;
  variant?: EdgeGlowVariant;
  style?: StyleProp<AnimatedStyle<ViewStyle>>;
}

export function EdgeGlow({ colorStyle, variant = "row", style }: EdgeGlowProps) {
  const glowStyle = useMemo(
    () => [styles.glow, variant === "badge" ? styles.badgeGlow : styles.rowGlow, colorStyle, style],
    [colorStyle, style, variant],
  );
  return <Animated.View pointerEvents="none" style={glowStyle} />;
}

export function EdgeGlowFill({ colorStyle, variant = "row", style }: EdgeGlowProps) {
  const fillStyle = useMemo(
    () => [styles.fill, variant === "badge" ? styles.badgeFill : styles.rowFill, colorStyle, style],
    [colorStyle, style, variant],
  );
  return <Animated.View pointerEvents="none" style={fillStyle} />;
}

const styles = StyleSheet.create((theme) => ({
  glow: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    opacity: 0,
    ...(isWeb
      ? {
          filter: "blur(10px)",
        }
      : {
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 10,
          elevation: 8,
        }),
  },
  rowGlow: {
    borderRadius: theme.borderRadius.lg,
  },
  badgeGlow: {
    borderRadius: theme.borderRadius.full,
    ...(isWeb
      ? {
          filter: "blur(5px)",
        }
      : {
          shadowRadius: 5,
          elevation: 5,
        }),
  },
  fill: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    opacity: 0,
  },
  rowFill: {
    borderRadius: theme.borderRadius.lg,
  },
  badgeFill: {
    borderRadius: theme.borderRadius.full,
  },
}));
