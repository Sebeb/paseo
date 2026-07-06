import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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

type InfoHoverCardPlacement = "right" | "bottom";
type InfoHoverCardTransition = "fade" | "instant";

interface InfoHoverCardSnapshot {
  activeId: string | null;
  enterTransition: InfoHoverCardTransition;
}

const HOVER_CARD_WINDOW_PADDING = 8;
const HOVER_CARD_FADE_MS = 80;

let nextHoverCardId = 0;
let hoverCardSnapshot: InfoHoverCardSnapshot = {
  activeId: null,
  enterTransition: "fade",
};
const hoverCardListeners = new Set<() => void>();

function subscribeToHoverCardStore(listener: () => void): () => void {
  hoverCardListeners.add(listener);
  return () => {
    hoverCardListeners.delete(listener);
  };
}

function getHoverCardSnapshot(): InfoHoverCardSnapshot {
  return hoverCardSnapshot;
}

function setActiveHoverCard(activeId: string | null) {
  if (hoverCardSnapshot.activeId === activeId) {
    return;
  }
  const replacingVisibleCard = activeId !== null && hoverCardSnapshot.activeId !== null;
  hoverCardSnapshot = {
    activeId,
    enterTransition: replacingVisibleCard ? "instant" : "fade",
  };
  for (const listener of hoverCardListeners) {
    listener();
  }
}

function measureElement(element: View): Promise<Rect> {
  return new Promise((resolve) => {
    element.measureInWindow((x, y, width, height) => {
      resolve({ x, y, width, height });
    });
  });
}

function clampToDisplayAreaX({
  x,
  contentWidth,
  displayArea,
}: {
  x: number;
  contentWidth: number;
  displayArea: Rect;
}): number {
  const minX = displayArea.x + HOVER_CARD_WINDOW_PADDING;
  const maxX = displayArea.x + displayArea.width - contentWidth - HOVER_CARD_WINDOW_PADDING;
  if (maxX < minX) {
    return minX;
  }
  return Math.max(minX, Math.min(maxX, x));
}

function computeHoverCardPosition({
  triggerRect,
  contentSize,
  displayArea,
  offset,
  placement,
}: {
  triggerRect: Rect;
  contentSize: { width: number; height: number };
  displayArea: Rect;
  offset: number;
  placement: InfoHoverCardPlacement;
}): { x: number; y: number } {
  let x: number;
  let y: number;

  if (placement === "bottom") {
    x = triggerRect.x + triggerRect.width / 2 - contentSize.width / 2;
    y = triggerRect.y + triggerRect.height + offset;
  } else {
    x = triggerRect.x + triggerRect.width + offset;
    y = triggerRect.y;

    if (x + contentSize.width > displayArea.x + displayArea.width - HOVER_CARD_WINDOW_PADDING) {
      x = triggerRect.x - contentSize.width - offset;
    }
  }

  x = clampToDisplayAreaX({ x, contentWidth: contentSize.width, displayArea });
  y = Math.max(
    displayArea.y + HOVER_CARD_WINDOW_PADDING,
    Math.min(
      displayArea.y + displayArea.height - contentSize.height - HOVER_CARD_WINDOW_PADDING,
      y,
    ),
  );

  return { x, y };
}

const HOVER_GRACE_MS = 100;

interface InfoHoverCardProps {
  content: ReactNode;
  accessibilityLabel: string;
  testID: string;
  isDragging?: boolean;
  placement?: InfoHoverCardPlacement;
  triggerStyle?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
}

type InfoHoverCardDesktopProps = PropsWithChildren<
  Required<Pick<InfoHoverCardProps, "accessibilityLabel" | "testID" | "placement">> &
    Pick<InfoHoverCardProps, "content" | "isDragging" | "triggerStyle" | "surfaceStyle">
>;

export function InfoHoverCard({
  content,
  accessibilityLabel,
  testID,
  isDragging = false,
  placement = "right",
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
      placement={placement}
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
  placement,
  triggerStyle,
  surfaceStyle,
  children,
}: InfoHoverCardDesktopProps): ReactElement {
  const triggerRef = useRef<View>(null);
  const contentRef = useRef<View>(null);
  const cardIdRef = useRef<string | null>(null);
  if (cardIdRef.current === null) {
    nextHoverCardId += 1;
    cardIdRef.current = `info-hover-card-${nextHoverCardId}`;
  }
  const cardId = cardIdRef.current;
  const activeSnapshot = useSyncExternalStore(
    subscribeToHoverCardStore,
    getHoverCardSnapshot,
    getHoverCardSnapshot,
  );
  const open = activeSnapshot.activeId === cardId;
  const [exitTransition, setExitTransition] = useState<InfoHoverCardTransition>("instant");
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
      if (getHoverCardSnapshot().activeId === cardId) {
        setExitTransition("fade");
        setActiveHoverCard(null);
      }
    }, HOVER_GRACE_MS);
  }, [cardId]);

  const handleTriggerEnter = useCallback(() => {
    clearGraceTimer();
    if (!isDragging) {
      setExitTransition("instant");
      setActiveHoverCard(cardId);
    }
  }, [cardId, clearGraceTimer, isDragging]);

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
      if (getHoverCardSnapshot().activeId === cardId) {
        setExitTransition("instant");
        setActiveHoverCard(null);
      }
    }
  }, [cardId, isDragging, clearGraceTimer]);

  useEffect(() => {
    return () => {
      clearGraceTimer();
      if (getHoverCardSnapshot().activeId === cardId) {
        setActiveHoverCard(null);
      }
    };
  }, [cardId, clearGraceTimer]);

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
          placement={placement}
          enterTransition={activeSnapshot.enterTransition}
          exitTransition={exitTransition}
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
  placement,
  enterTransition,
  exitTransition,
  surfaceStyle,
}: {
  content: ReactNode;
  triggerRef: React.RefObject<View | null>;
  contentRef: React.RefObject<View | null>;
  accessibilityLabel: string;
  testID: string;
  placement: InfoHoverCardPlacement;
  enterTransition: InfoHoverCardTransition;
  exitTransition: InfoHoverCardTransition;
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
      placement,
    });
    setPosition(result);
  }, [triggerRect, contentSize, placement]);

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
      maxWidth: Math.max(0, Dimensions.get("window").width - HOVER_CARD_WINDOW_PADDING * 2),
    }),
    [position?.x, position?.y],
  );
  const cardStyle = useMemo(() => [styles.card, surfaceStyle], [surfaceStyle]);
  const entering = enterTransition === "fade" ? FadeIn.duration(HOVER_CARD_FADE_MS) : undefined;
  const exiting = exitTransition === "fade" ? FadeOut.duration(HOVER_CARD_FADE_MS) : undefined;

  return (
    <Portal hostName={bottomSheetInternal?.hostName}>
      <View pointerEvents="box-none" style={styles.portalOverlay}>
        <FloatingSurface
          ref={contentRef}
          entering={entering}
          exiting={exiting}
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
