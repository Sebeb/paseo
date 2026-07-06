import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from "react";
import { Dimensions, View, type StyleProp, type ViewStyle } from "react-native";
import { useBottomSheetModalInternal } from "@gorhom/bottom-sheet";
import { Portal } from "@gorhom/portal";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { useHoverSafeZone } from "@/hooks/use-hover-safe-zone";
import { FloatingSurface } from "@/components/ui/floating";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function measureElement(element: View): Promise<Rect> {
  return new Promise((resolve) => {
    element.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });
}

function computeHoverCardPosition({
  triggerRect,
  contentSize,
  displayArea,
  offset,
}: {
  triggerRect: Rect;
  contentSize: { width: number; height: number };
  displayArea: Rect;
  offset: number;
}): { x: number; y: number } {
  let x = triggerRect.x + triggerRect.width + offset;
  let y = triggerRect.y;

  if (x + contentSize.width > displayArea.width - 8) {
    x = triggerRect.x - contentSize.width - offset;
  }

  const padding = 8;
  x = Math.max(padding, Math.min(displayArea.width - contentSize.width - padding, x));
  y = Math.max(
    displayArea.y + padding,
    Math.min(displayArea.y + displayArea.height - contentSize.height - padding, y),
  );

  return { x, y };
}

const HOVER_GRACE_MS = 100;

interface InfoHoverCardProps {
  content: ReactNode;
  accessibilityLabel: string;
  testID: string;
  isDragging?: boolean;
  triggerStyle?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
}

type InfoHoverCardDesktopProps = PropsWithChildren<
  Required<Pick<InfoHoverCardProps, "accessibilityLabel" | "testID">> &
    Pick<InfoHoverCardProps, "content" | "isDragging" | "triggerStyle" | "surfaceStyle">
>;

export function InfoHoverCard({
  content,
  accessibilityLabel,
  testID,
  isDragging = false,
  triggerStyle,
  surfaceStyle,
  children,
}: PropsWithChildren<InfoHoverCardProps>): ReactNode {
  const isCompact = useIsCompactFormFactor();

  if (!isWeb || isCompact) {
    return children;
  }

  return (
    <InfoHoverCardDesktop
      content={content}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      isDragging={isDragging}
      triggerStyle={triggerStyle}
      surfaceStyle={surfaceStyle}
    >
      {children}
    </InfoHoverCardDesktop>
  );
}

function InfoHoverCardDesktop({
  content,
  accessibilityLabel,
  testID,
  isDragging,
  triggerStyle,
  surfaceStyle,
  children,
}: InfoHoverCardDesktopProps): ReactElement {
  const triggerRef = useRef<View>(null);
  const contentRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    if (graceTimerRef.current) return;
    graceTimerRef.current = setTimeout(() => {
      graceTimerRef.current = null;
      setOpen(false);
    }, HOVER_GRACE_MS);
  }, []);

  const handleTriggerEnter = useCallback(() => {
    clearGraceTimer();
    if (!isDragging) {
      setOpen(true);
    }
  }, [clearGraceTimer, isDragging]);

  const handleTriggerLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  useHoverSafeZone({
    enabled: open,
    triggerRef,
    contentRef,
    onEnterSafeZone: clearGraceTimer,
    onLeaveSafeZone: scheduleClose,
  });

  useEffect(() => {
    if (isDragging) {
      clearGraceTimer();
      setOpen(false);
    }
  }, [isDragging, clearGraceTimer]);

  useEffect(() => {
    return () => {
      clearGraceTimer();
    };
  }, [clearGraceTimer]);

  return (
    <View
      ref={triggerRef}
      collapsable={false}
      style={triggerStyle}
      onPointerEnter={handleTriggerEnter}
      onPointerLeave={handleTriggerLeave}
    >
      {children}
      {open ? (
        <InfoHoverCardContent
          content={content}
          triggerRef={triggerRef}
          contentRef={contentRef}
          accessibilityLabel={accessibilityLabel}
          testID={testID}
          surfaceStyle={surfaceStyle}
        />
      ) : null}
    </View>
  );
}

function InfoHoverCardContent({
  content,
  triggerRef,
  contentRef,
  accessibilityLabel,
  testID,
  surfaceStyle,
}: {
  content: ReactNode;
  triggerRef: React.RefObject<View | null>;
  contentRef: React.RefObject<View | null>;
  accessibilityLabel: string;
  testID: string;
  surfaceStyle?: StyleProp<ViewStyle>;
}): ReactElement | null {
  const bottomSheetInternal = useBottomSheetModalInternal(true);
  const [triggerRect, setTriggerRect] = useState<Rect | null>(null);
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!triggerRef.current) return;

    let cancelled = false;
    measureElement(triggerRef.current).then((rect) => {
      if (cancelled) return;
      setTriggerRect(rect);
      return;
    });

    return () => {
      cancelled = true;
    };
  }, [triggerRef]);

  useEffect(() => {
    if (!triggerRect || !contentSize) return;
    const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
    const displayArea = { x: 0, y: 0, width: screenWidth, height: screenHeight };
    const result = computeHoverCardPosition({
      triggerRect,
      contentSize,
      displayArea,
      offset: 4,
    });
    setPosition(result);
  }, [triggerRect, contentSize]);

  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.layout;
      setContentSize({ width, height });
    },
    [],
  );

  const frameStyle = useMemo(
    () => ({
      position: "absolute" as const,
      top: position?.y ?? -9999,
      left: position?.x ?? -9999,
    }),
    [position?.x, position?.y],
  );
  const cardStyle = useMemo(() => [styles.card, surfaceStyle], [surfaceStyle]);

  return (
    <Portal hostName={bottomSheetInternal?.hostName}>
      <View pointerEvents="box-none" style={styles.portalOverlay}>
        <FloatingSurface
          ref={contentRef}
          entering={FadeIn.duration(80)}
          exiting={FadeOut.duration(80)}
          collapsable={false}
          onLayout={handleLayout}
          accessibilityRole="menu"
          accessibilityLabel={accessibilityLabel}
          testID={testID}
          style={cardStyle}
          frameStyle={frameStyle}
        >
          {content}
        </FloatingSurface>
      </View>
    </Portal>
  );
}

const HOVER_CARD_WIDTH = 260;

const styles = StyleSheet.create((theme) => ({
  portalOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
  },
  card: {
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    paddingTop: theme.spacing[2],
    width: HOVER_CARD_WIDTH,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
}));
