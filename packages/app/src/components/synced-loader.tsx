import { useEffect, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  makeMutable,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const SYNCED_LOADER_DURATION_MS = 900;
const SYNCED_LOADER_EPOCH_MS = 0;
const FULL_ROTATION_DEGREES = 360;
const sharedRotation = makeMutable(0);
let sharedLoopStarted = false;

function ensureSharedRotationLoopStarted(): void {
  if (sharedLoopStarted) {
    return;
  }

  sharedLoopStarted = true;
  const elapsedMs = (Date.now() - SYNCED_LOADER_EPOCH_MS) % SYNCED_LOADER_DURATION_MS;
  sharedRotation.value = (elapsedMs / SYNCED_LOADER_DURATION_MS) * FULL_ROTATION_DEGREES;
  sharedRotation.value = withTiming(
    FULL_ROTATION_DEGREES,
    {
      duration: Math.max(1, Math.round(SYNCED_LOADER_DURATION_MS - elapsedMs)),
      easing: Easing.linear,
    },
    (finished) => {
      if (!finished) {
        sharedLoopStarted = false;
        return;
      }
      sharedRotation.value = 0;
      sharedRotation.value = withRepeat(
        withTiming(FULL_ROTATION_DEGREES, {
          duration: SYNCED_LOADER_DURATION_MS,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    },
  );
}

export function SyncedLoader({
  size = 10,
  color,
  children,
}: {
  size?: number;
  color: string;
  children?: ReactNode;
}) {
  useEffect(() => {
    ensureSharedRotationLoopStarted();
  }, []);

  const containerStyle = useMemo(
    () =>
      ({
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }) as const,
    [size],
  );

  const strokeWidth = Math.max(1, Math.round(size * 0.12));
  const spinnerStyle = useMemo(
    () =>
      ({
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor: "transparent",
        borderTopColor: color,
        borderRightColor: color,
      }) as const,
    [color, size, strokeWidth],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sharedRotation.value}deg` }],
  }));

  const spinnerAnimatedStyle = useMemo(
    () => [animatedStyle, spinnerStyle],
    [animatedStyle, spinnerStyle],
  );

  return (
    <View style={containerStyle}>
      <Animated.View style={spinnerAnimatedStyle} />
      {children}
    </View>
  );
}
