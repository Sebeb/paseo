import React, {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { measureElement as measureVirtualElement, useVirtualizer } from "@tanstack/react-virtual";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useWebElementScrollbar } from "@/components/use-web-scrollbar";
import { useAppSettings } from "@/hooks/use-settings";
import { baseColors } from "@/styles/theme";
import { estimateStreamItemHeight } from "./web-virtualization";
import type {
  StreamFindMarker,
  StreamRenderInput,
  StreamStrategy,
  StreamViewportHandle,
} from "./strategy";
import { createStreamStrategy, PINNED_USER_INPUT_SCROLL_TOP_OFFSET } from "./strategy";
import {
  collectPinnedUserInputCandidatesFromGeometries,
  findEstimatedStreamItemTop,
  selectPinnedUserInput,
  type PinnedUserInputCandidate,
  type PinnedUserInputGeometry,
} from "./pinned-user-input";
import {
  PROMPT_MARKER_HIT_SIZE,
  PROMPT_MARKER_RAIL_RIGHT,
  PROMPT_MARKER_SIZE,
} from "./prompt-scroll-marker-layout";
import { buildPromptIndexGeometry } from "./prompt-index-geometry";
import type { StreamItem } from "@/types/stream";

interface CreateWebStreamStrategyInput {
  isMobileBreakpoint: boolean;
}

type ScrollBehaviorLike = "auto" | "smooth";

const WEB_BOTTOM_SETTLE_TIMEOUT_MS = 200;
const USER_SCROLL_DELTA_EPSILON = 1;
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 64;
const AUTO_SCROLL_RESUME_THRESHOLD_PX = 1;
const HISTORY_START_THRESHOLD_PX = 96;
const PROMPT_PREVIEW_WIDTH = 280;
const PROMPT_PREVIEW_MAX_HEIGHT = 120;
const PROMPT_PREVIEW_EDGE_PADDING = 16;
const PROMPT_PREVIEW_TEXT_MAX_LENGTH = 140;
const PROMPT_SCROLL_TARGET_TOP_PADDING = 15;
const PROMPT_PREVIEW_LAYER_Z_INDEX = 1000;

type PromptMarkerSegment = "unloadedHistory" | "virtualizedHistory" | "mountedHistory" | "liveHead";

type ScrollMarkerKind = "prompt" | "find";
type MarkerRailMode = "none" | "prompt" | "find";

interface PromptMarkerDescriptor {
  id: string;
  text: string;
  index: number;
  segment: PromptMarkerSegment;
}

interface ScrollMarker {
  id: string;
  itemId: string;
  kind: ScrollMarkerKind;
  targetOffset: number;
  preview?: string;
  segment?: PromptMarkerSegment;
  index?: number;
}

interface PromptRailMetrics {
  viewportSize: number;
  contentSize: number;
  scrollOffset: number;
  previewBoundsTop: number;
  previewBoundsBottom: number;
  offsetsById: Map<string, number>;
}

interface PromptPreviewBounds {
  top: number;
  bottom: number;
}

interface StreamItemElementProps {
  children: ReactNode;
  itemId: string;
  setStreamItemElement: (itemId: string, node: HTMLDivElement | null) => void;
}

function StreamItemElement({ children, itemId, setStreamItemElement }: StreamItemElementProps) {
  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      setStreamItemElement(itemId, node);
    },
    [itemId, setStreamItemElement],
  );

  return (
    <div key={itemId} data-stream-item-id={itemId} ref={handleRef} style={streamItemElementStyle}>
      {children}
    </div>
  );
}

interface VirtualStreamItemElementProps extends StreamItemElementProps {
  index: number;
  measureElement: (node: HTMLDivElement | null) => void;
  style: CSSProperties;
}

function VirtualStreamItemElement({
  children,
  index,
  itemId,
  measureElement,
  setStreamItemElement,
  style,
}: VirtualStreamItemElementProps) {
  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      measureElement(node);
      setStreamItemElement(itemId, node);
    },
    [itemId, measureElement, setStreamItemElement],
  );

  return (
    <div data-index={index} data-stream-item-id={itemId} ref={handleRef} style={style}>
      {children}
    </div>
  );
}

interface MarkerRailPresentation {
  railTestId: string;
  itemTestIdPrefix: string;
  ariaLabel: string;
}

interface MarkerRailModeInput {
  showDesktopWebScrollbar: boolean;
  promptScrollMarkers: boolean;
  findIndicator: StreamRenderInput["findIndicator"];
}

const EMPTY_FIND_MARKERS: readonly StreamFindMarker[] = [];

const historyStartSlotStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 32,
  paddingTop: 4,
  paddingBottom: 8,
};

const streamItemElementStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
};

const promptMarkerOverlayStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: PROMPT_MARKER_RAIL_RIGHT,
  bottom: 0,
  width: PROMPT_MARKER_HIT_SIZE,
  pointerEvents: "none",
  zIndex: PROMPT_PREVIEW_LAYER_Z_INDEX,
};

const promptMarkerTargetBaseStyle: CSSProperties = {
  position: "absolute",
  right: 0,
  width: PROMPT_MARKER_HIT_SIZE,
  height: PROMPT_MARKER_HIT_SIZE,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
  cursor: "pointer",
  zIndex: PROMPT_PREVIEW_LAYER_Z_INDEX,
};

const promptMarkerDotBaseStyle: CSSProperties = {
  width: PROMPT_MARKER_SIZE,
  height: PROMPT_MARKER_SIZE,
  borderRadius: 999,
  backgroundColor: "var(--colors-surface3, #e4e4e7)",
  border: "1px solid rgba(0, 0, 0, 0.16)",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.28)",
  opacity: 0.42,
  transition:
    "background-color 160ms ease-out, border-color 160ms ease-out, opacity 160ms ease-out, box-shadow 160ms ease-out",
};

const promptMarkerDotActiveStyle: CSSProperties = {
  backgroundColor: "var(--colors-surface3, #e4e4e7)",
  borderColor: "var(--colors-surface3, #e4e4e7)",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.32)",
  opacity: 1,
};

const findMarkerDotBaseStyle: CSSProperties = {
  width: PROMPT_MARKER_SIZE,
  height: PROMPT_MARKER_SIZE,
  borderRadius: 999,
  backgroundColor: baseColors.blue[500],
  border: "1px solid rgba(0, 0, 0, 0.16)",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.28)",
  opacity: 0.35,
  transition: "opacity 160ms ease-out, box-shadow 160ms ease-out",
};

const findMarkerDotActiveStyle: CSSProperties = {
  opacity: 1,
  boxShadow: "0 2px 8px rgba(59, 130, 246, 0.45)",
};

const promptPreviewBaseStyle: CSSProperties = {
  position: "absolute",
  right: PROMPT_MARKER_HIT_SIZE,
  width: PROMPT_PREVIEW_WIDTH,
  maxHeight: PROMPT_PREVIEW_MAX_HEIGHT,
  overflow: "hidden",
  padding: 16,
  borderRadius: 16,
  borderTopRightRadius: 2,
  backgroundColor: "var(--colors-surface3, #e4e4e7)",
  color: "var(--colors-foreground, #1a1a1e)",
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.24)",
  fontSize: 16,
  lineHeight: "22px",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  textAlign: "left",
  transition: "opacity 120ms ease-out, transform 120ms ease-out",
  zIndex: PROMPT_PREVIEW_LAYER_Z_INDEX,
};

const promptPreviewHiddenStyle: CSSProperties = {
  opacity: 0,
  pointerEvents: "none",
  transform: "translateX(4px)",
};

const promptPreviewVisibleStyle: CSSProperties = {
  opacity: 1,
  pointerEvents: "auto",
  transform: "translateX(0)",
};

const PROMPT_PREVIEW_BOUNDS_SELECTOR = '[data-testid="agent-chat-space"]';

function getMarkerRailMode(input: MarkerRailModeInput): MarkerRailMode {
  if (!input.showDesktopWebScrollbar) {
    return "none";
  }
  if (input.findIndicator?.isActive === true && input.findIndicator.markers.length > 0) {
    return "find";
  }
  if (input.promptScrollMarkers) {
    return "prompt";
  }
  return "none";
}

function getMarkerRailPresentation(mode: MarkerRailMode): MarkerRailPresentation {
  if (mode === "find") {
    return {
      railTestId: "find-marker-rail",
      itemTestIdPrefix: "find-scroll",
      ariaLabel: "Jump to find match",
    };
  }
  return {
    railTestId: "prompt-marker-rail",
    itemTestIdPrefix: "prompt-scroll",
    ariaLabel: "Jump to prompt",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isScrollContainerNearBottom(
  scrollContainer: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">,
  thresholdPx = AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
): boolean {
  const threshold = Number.isFinite(thresholdPx)
    ? Math.max(0, thresholdPx)
    : AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
  const { scrollTop, clientHeight, scrollHeight } = scrollContainer;
  if (![scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) {
    return true;
  }
  const distanceFromBottom = scrollHeight - clientHeight - scrollTop;
  return distanceFromBottom <= threshold;
}

function isScrollContainerAtBottom(
  scrollContainer: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">,
): boolean {
  return isScrollContainerNearBottom(scrollContainer, AUTO_SCROLL_RESUME_THRESHOLD_PX);
}

function scrollElementToBottom(
  scrollContainer: HTMLElement,
  behavior: ScrollBehaviorLike = "auto",
): void {
  scrollContainer.scrollTo({
    top: scrollContainer.scrollHeight,
    behavior,
  });
}

function syncNearBottom(
  scrollContainer: HTMLElement | null,
  onNearBottomChange: (value: boolean) => void,
): boolean {
  if (!scrollContainer) {
    onNearBottomChange(true);
    return true;
  }
  const nextValue = isScrollContainerNearBottom(scrollContainer);
  onNearBottomChange(nextValue);
  return nextValue;
}

function getScrollContainerDistanceFromBottom(
  scrollContainer: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">,
): number {
  return scrollContainer.scrollHeight - scrollContainer.clientHeight - scrollContainer.scrollTop;
}

function isScrollContainerOverscrolledPastBottom(
  scrollContainer: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">,
): boolean {
  return getScrollContainerDistanceFromBottom(scrollContainer) < 0;
}

function arePromptRailMetricsEqual(left: PromptRailMetrics, right: PromptRailMetrics): boolean {
  if (
    left.viewportSize !== right.viewportSize ||
    left.contentSize !== right.contentSize ||
    left.scrollOffset !== right.scrollOffset ||
    left.previewBoundsTop !== right.previewBoundsTop ||
    left.previewBoundsBottom !== right.previewBoundsBottom ||
    left.offsetsById.size !== right.offsetsById.size
  ) {
    return false;
  }

  for (const [id, offset] of left.offsetsById) {
    if (right.offsetsById.get(id) !== offset) {
      return false;
    }
  }
  return true;
}

function getPromptPreviewBoundsElement(scrollContainer: HTMLElement): HTMLElement {
  const chatSpace = scrollContainer.closest(PROMPT_PREVIEW_BOUNDS_SELECTOR);
  return chatSpace instanceof HTMLElement ? chatSpace : scrollContainer;
}

function getPromptPreviewBounds(scrollContainer: HTMLElement): PromptPreviewBounds {
  const scrollRect = scrollContainer.getBoundingClientRect();
  const boundsElement = getPromptPreviewBoundsElement(scrollContainer);
  const boundsRect = boundsElement.getBoundingClientRect();
  const top = boundsRect.top - scrollRect.top;
  const bottom = boundsRect.bottom - scrollRect.top;

  if (![top, bottom].every(Number.isFinite) || bottom <= top) {
    return {
      top: 0,
      bottom: scrollContainer.clientHeight,
    };
  }

  return { top, bottom };
}

function collectPromptMarkerDescriptors(
  segments: StreamRenderInput["segments"],
  promptIndex: StreamRenderInput["promptIndex"],
  loadedHistoryStartSeq: StreamRenderInput["loadedHistoryStartSeq"],
): PromptMarkerDescriptor[] {
  const markers: PromptMarkerDescriptor[] = [];
  if (promptIndex && loadedHistoryStartSeq !== null) {
    promptIndex.rows.forEach((row, index) => {
      if (row.seqEnd >= loadedHistoryStartSeq || row.kind !== "user_message") {
        return;
      }
      markers.push({
        id: row.id,
        text: row.textPreview ?? "",
        index,
        segment: "unloadedHistory",
      });
    });
  }
  const visit = (items: StreamItem[], segment: PromptMarkerSegment) => {
    items.forEach((item, index) => {
      if (item.kind !== "user_message") {
        return;
      }
      markers.push({
        id: item.id,
        text: item.text,
        index,
        segment,
      });
    });
  };

  visit(segments.historyVirtualized, "virtualizedHistory");
  visit(segments.historyMounted, "mountedHistory");
  visit(segments.liveHead, "liveHead");
  return markers;
}

function findStreamItemAnchor(
  contentElement: HTMLElement | null,
  itemId: string,
): HTMLElement | null {
  if (!contentElement) {
    return null;
  }
  const anchors = contentElement.querySelectorAll<HTMLElement>("[data-stream-item-id]");
  for (const anchor of anchors) {
    if (anchor.dataset.streamItemId === itemId) {
      return anchor;
    }
  }
  return null;
}

function findFindMatchAnchor(
  contentElement: HTMLElement | null,
  matchId: string,
): HTMLElement | null {
  if (!contentElement) {
    return null;
  }
  const anchors = contentElement.querySelectorAll<HTMLElement>("[data-find-match-id]");
  for (const anchor of anchors) {
    if (anchor.dataset.findMatchId === matchId) {
      return anchor;
    }
  }
  return null;
}

function getElementTopWithinContent(
  contentElement: HTMLElement,
  targetElement: HTMLElement,
): number {
  const contentRect = contentElement.getBoundingClientRect();
  const targetRect = targetElement.getBoundingClientRect();
  const rectOffset = targetRect.top - contentRect.top;
  const hasMeasuredRect =
    contentRect.top !== 0 ||
    contentRect.bottom !== 0 ||
    targetRect.top !== 0 ||
    targetRect.bottom !== 0;

  if (hasMeasuredRect && Number.isFinite(rectOffset)) {
    return rectOffset;
  }

  return targetElement.offsetTop;
}

function getPromptMarkerTop(input: {
  targetOffset: number;
  viewportSize: number;
  contentSize: number;
}): number {
  const maxMarkerTop = Math.max(0, input.viewportSize - PROMPT_MARKER_HIT_SIZE);
  if (input.contentSize <= 0) {
    return 0;
  }
  const clampedTarget = clamp(input.targetOffset, 0, input.contentSize);
  return (clampedTarget / input.contentSize) * maxMarkerTop;
}

function getPromptPreviewTop(input: {
  markerTop: number;
  previewHeight: number;
  previewBoundsTop: number;
  previewBoundsBottom: number;
}): number {
  const dotTop = input.markerTop + (PROMPT_MARKER_HIT_SIZE - PROMPT_MARKER_SIZE) / 2;
  const minTop = input.previewBoundsTop + PROMPT_PREVIEW_EDGE_PADDING;
  const maxTop = Math.max(
    minTop,
    input.previewBoundsBottom - PROMPT_PREVIEW_EDGE_PADDING - input.previewHeight,
  );
  return clamp(dotTop, minTop, maxTop);
}

function getPromptPreviewText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PROMPT_PREVIEW_TEXT_MAX_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, PROMPT_PREVIEW_TEXT_MAX_LENGTH - 3).trimEnd()}...`;
}

function getActiveScrollMarkerId(input: {
  markers: readonly ScrollMarker[];
  scrollOffset: number;
}): string | null {
  if (input.markers.length === 0) {
    return null;
  }
  const contextOffset = input.scrollOffset + PROMPT_SCROLL_TARGET_TOP_PADDING;
  let activeMarker = input.markers[0] ?? null;
  for (const marker of input.markers) {
    if (marker.targetOffset > contextOffset) {
      break;
    }
    activeMarker = marker;
  }
  return activeMarker?.id ?? null;
}

interface ScrollMarkerRailProps {
  markers: readonly ScrollMarker[];
  viewportSize: number;
  contentSize: number;
  previewBoundsTop: number;
  previewBoundsBottom: number;
  activeMarkerId: string | null;
  railTestId: string;
  itemTestIdPrefix: string;
  ariaLabel: string;
  onMarkerPress: (marker: ScrollMarker) => void;
}

interface ScrollMarkerRailItemProps {
  marker: ScrollMarker;
  markerTop: number;
  previewTop: number;
  isHovered: boolean;
  isActive: boolean;
  itemTestIdPrefix: string;
  ariaLabel: string;
  onMarkerPress: (marker: ScrollMarker) => void;
  onHoveredMarkerChange: (markerId: string | null) => void;
  onPreviewHeightChange: (markerId: string, height: number) => void;
}

function ScrollMarkerRailItem({
  marker,
  markerTop,
  previewTop,
  isHovered,
  isActive,
  itemTestIdPrefix,
  ariaLabel,
  onMarkerPress,
  onHoveredMarkerChange,
  onPreviewHeightChange,
}: ScrollMarkerRailItemProps) {
  const previewRef = useRef<HTMLSpanElement | null>(null);
  const previewText = useMemo(
    () => (marker.preview === undefined ? null : getPromptPreviewText(marker.preview)),
    [marker.preview],
  );
  const dotStyle = useMemo((): CSSProperties => {
    if (marker.kind === "find") {
      return {
        ...findMarkerDotBaseStyle,
        ...(isActive ? findMarkerDotActiveStyle : {}),
      };
    }
    return {
      ...promptMarkerDotBaseStyle,
      ...(isActive ? promptMarkerDotActiveStyle : {}),
    };
  }, [isActive, marker.kind]);
  const reportPreviewHeight = useCallback(() => {
    const previewElement = previewRef.current;
    if (!previewElement) {
      return;
    }
    const height = previewElement.offsetHeight;
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }
    onPreviewHeightChange(marker.id, height);
  }, [marker.id, onPreviewHeightChange]);
  const targetStyle = useMemo(
    (): CSSProperties => ({
      ...promptMarkerTargetBaseStyle,
      top: markerTop,
      border: 0,
      padding: 0,
      background: "transparent",
    }),
    [markerTop],
  );
  const previewStyle = useMemo(
    (): CSSProperties => ({
      ...promptPreviewBaseStyle,
      top: previewTop - markerTop,
      ...(isHovered ? promptPreviewVisibleStyle : promptPreviewHiddenStyle),
    }),
    [isHovered, markerTop, previewTop],
  );
  const handleClick = useCallback(() => {
    onMarkerPress(marker);
  }, [marker, onMarkerPress]);
  const handleMouseEnter = useCallback(() => {
    if (previewText !== null) {
      reportPreviewHeight();
      onHoveredMarkerChange(marker.id);
    }
  }, [marker.id, onHoveredMarkerChange, previewText, reportPreviewHeight]);
  const handleMouseLeave = useCallback(() => {
    if (previewText !== null) {
      onHoveredMarkerChange(null);
    }
  }, [onHoveredMarkerChange, previewText]);
  useLayoutEffect(() => {
    if (previewText === null) {
      return;
    }
    reportPreviewHeight();
    const previewElement = previewRef.current;
    if (!previewElement || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      reportPreviewHeight();
    });
    observer.observe(previewElement);
    return () => {
      observer.disconnect();
    };
  }, [previewText, reportPreviewHeight]);

  return (
    <button
      type="button"
      data-testid={`${itemTestIdPrefix}-marker-${marker.id}`}
      aria-label={ariaLabel}
      style={targetStyle}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span style={dotStyle} />
      {previewText !== null ? (
        <span
          ref={previewRef}
          data-testid={`${itemTestIdPrefix}-preview-${marker.id}`}
          style={previewStyle}
        >
          {previewText}
        </span>
      ) : null}
    </button>
  );
}

function ScrollMarkerRail({
  markers,
  viewportSize,
  contentSize,
  previewBoundsTop,
  previewBoundsBottom,
  activeMarkerId,
  railTestId,
  itemTestIdPrefix,
  ariaLabel,
  onMarkerPress,
}: ScrollMarkerRailProps) {
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [previewHeightsById, setPreviewHeightsById] = useState(() => new Map<string, number>());
  const handleHoveredMarkerChange = useCallback((markerId: string | null) => {
    setHoveredMarkerId(markerId);
  }, []);
  const handlePreviewHeightChange = useCallback((markerId: string, height: number) => {
    setPreviewHeightsById((previous) => {
      if (previous.get(markerId) === height) {
        return previous;
      }
      const next = new Map(previous);
      next.set(markerId, height);
      return next;
    });
  }, []);

  if (markers.length === 0 || contentSize <= viewportSize || viewportSize <= 0) {
    return null;
  }

  return (
    <div style={promptMarkerOverlayStyle} data-testid={railTestId}>
      {markers.map((marker) => {
        const markerTop = getPromptMarkerTop({
          targetOffset: marker.targetOffset,
          viewportSize,
          contentSize,
        });
        const previewHeight = previewHeightsById.get(marker.id) ?? PROMPT_PREVIEW_MAX_HEIGHT;
        const previewTop = getPromptPreviewTop({
          markerTop,
          previewHeight,
          previewBoundsTop,
          previewBoundsBottom,
        });
        const isHovered = hoveredMarkerId === marker.id;
        const isActive = activeMarkerId === marker.id;
        return (
          <ScrollMarkerRailItem
            key={marker.id}
            marker={marker}
            markerTop={markerTop}
            previewTop={previewTop}
            isHovered={isHovered}
            isActive={isActive}
            itemTestIdPrefix={itemTestIdPrefix}
            ariaLabel={ariaLabel}
            onMarkerPress={onMarkerPress}
            onHoveredMarkerChange={handleHoveredMarkerChange}
            onPreviewHeightChange={handlePreviewHeightChange}
          />
        );
      })}
    </div>
  );
}

function WebStreamViewport(props: StreamRenderInput & { isMobileBreakpoint: boolean }) {
  const {
    segments,
    promptIndex,
    loadedHistoryStartSeq,
    expectsFullHistoryPromptIndex,
    boundary,
    renderers,
    listEmptyComponent,
    viewportRef,
    routeBottomAnchorRequest,
    isAuthoritativeHistoryReady,
    onNearBottomChange,
    onNearHistoryStart,
    pinUserInputsEnabled,
    pinnedBottom,
    onPinnedUserInputChange,
    pinnedUserInputOverlay,
    isLoadingOlderHistory,
    hasOlderHistory,
    scrollEnabled,
    isMobileBreakpoint,
    findIndicator,
  } = props;
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const virtualRowsContainerRef = useRef<HTMLDivElement | null>(null);
  const streamItemElementByIdRef = useRef(new Map<string, HTMLElement>());
  const handleScrollContainerRef = useCallback((node: HTMLElement | null) => {
    scrollContainerRef.current = node;
  }, []);
  const handleContentRef = useCallback((node: HTMLElement | null) => {
    contentRef.current = node;
  }, []);
  const handleVirtualRowsContainerRef = useCallback((node: HTMLDivElement | null) => {
    virtualRowsContainerRef.current = node;
  }, []);
  const setStreamItemElement = useCallback((itemId: string, node: HTMLElement | null) => {
    const elements = streamItemElementByIdRef.current;
    if (node) {
      elements.set(itemId, node);
      return;
    }
    elements.delete(itemId);
  }, []);
  const [followOutput, setFollowOutputState] = useState(true);
  const followOutputRef = useRef(followOutput);
  const lastKnownScrollTopRef = useRef(0);
  const pendingUserScrollUpIntentRef = useRef(false);
  const isPointerScrollActiveRef = useRef(false);
  const lastTouchClientYRef = useRef<number | null>(null);
  const pendingAutoScrollFrameRef = useRef<number | null>(null);
  const pendingAutoScrollTimeoutRef = useRef<number | null>(null);
  const pendingVirtualRowMeasureFramesRef = useRef(new Map<Element, number>());
  const shouldSuppressNextResizeStickToBottomRef = useRef(false);
  const pendingUnloadedPromptTargetIdRef = useRef<string | null>(null);
  const historyStartReadyRef = useRef(false);
  const { settings: appSettings } = useAppSettings();
  const [promptRailMetrics, setPromptRailMetrics] = useState<PromptRailMetrics>({
    viewportSize: 0,
    contentSize: 0,
    scrollOffset: 0,
    previewBoundsTop: 0,
    previewBoundsBottom: 0,
    offsetsById: new Map(),
  });
  const showDesktopWebScrollbar = !isMobileBreakpoint;
  const isPromptIndexPending =
    expectsFullHistoryPromptIndex && hasOlderHistory && promptIndex === null;
  const markerRailMode = getMarkerRailMode({
    showDesktopWebScrollbar,
    promptScrollMarkers: appSettings.promptScrollMarkers && !isPromptIndexPending,
    findIndicator,
  });
  const markerRailPresentation = getMarkerRailPresentation(markerRailMode);
  const findMarkers = findIndicator?.markers ?? EMPTY_FIND_MARKERS;
  const findActiveMarkerId = findIndicator?.activeMarkerId ?? null;
  const showFindMarkers = markerRailMode === "find";
  const showPromptMarkers = markerRailMode === "prompt";
  const showMarkerRail = markerRailMode !== "none";
  const promptMarkerDescriptors = useMemo(
    () => collectPromptMarkerDescriptors(segments, promptIndex, loadedHistoryStartSeq),
    [loadedHistoryStartSeq, promptIndex, segments],
  );
  const promptIndexGeometry = useMemo(
    () =>
      promptIndex
        ? buildPromptIndexGeometry({
            rows: promptIndex.rows,
            loadedStartSeq: loadedHistoryStartSeq,
          })
        : buildPromptIndexGeometry({ rows: [], loadedStartSeq: null }),
    [loadedHistoryStartSeq, promptIndex],
  );
  const scrollbarOverlay = useWebElementScrollbar(scrollContainerRef, {
    enabled: showDesktopWebScrollbar,
    contentRef,
  });
  const hasUnloadedHistorySpacer = promptIndexGeometry.unloadedSpacerHeight > 0;
  const shouldUseVirtualizer = segments.historyVirtualized.length > 0 && !hasUnloadedHistorySpacer;
  const {
    renderHistoryVirtualizedRow,
    renderHistoryMountedRow,
    renderLiveHeadRow,
    renderLiveAuxiliary,
  } = renderers;

  const setFollowOutput = useCallback((value: boolean) => {
    followOutputRef.current = value;
    setFollowOutputState((previous) => (previous === value ? previous : value));
    return value;
  }, []);

  followOutputRef.current = followOutput;

  const activationKey = routeBottomAnchorRequest?.requestKey ?? props.agentId;
  const isActivationReady = routeBottomAnchorRequest === null || isAuthoritativeHistoryReady;

  const rowVirtualizer = useVirtualizer({
    count: segments.historyVirtualized.length,
    getScrollElement: () => scrollContainerRef.current,
    getItemKey: (index: number) => segments.historyVirtualized[index]?.id ?? index,
    estimateSize: (index: number) => {
      const row = segments.historyVirtualized[index];
      return row ? estimateStreamItemHeight(row) : 120;
    },
    measureElement: measureVirtualElement,
    useAnimationFrameWithResizeObserver: true,
    overscan: 8,
  });
  useEffect(() => {
    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (_item, _delta, instance) => {
      const viewportHeight = instance.scrollRect?.height ?? 0;
      const scrollOffset = instance.scrollOffset ?? 0;
      const remainingDistance = instance.getTotalSize() - (scrollOffset + viewportHeight);
      return remainingDistance > AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
    };
    return () => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [rowVirtualizer]);
  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualTotalSize = rowVirtualizer.getTotalSize();

  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;
  const getVirtualPromptOffset = useCallback((index: number): number | null => {
    const offsetInfo = rowVirtualizerRef.current.getOffsetForIndex(index, "start");
    if (!offsetInfo) {
      return null;
    }
    const virtualRowsContainerOffset = virtualRowsContainerRef.current?.offsetTop ?? 0;
    return virtualRowsContainerOffset + offsetInfo[0];
  }, []);

  const resolvePromptOffset = useCallback(
    (marker: PromptMarkerDescriptor): number | null => {
      if (marker.segment === "unloadedHistory") {
        return promptIndexGeometry.unloadedPromptOffsetsById.get(marker.id) ?? null;
      }
      if (marker.segment === "virtualizedHistory") {
        if (!shouldUseVirtualizer) {
          const anchor = findStreamItemAnchor(contentRef.current, marker.id);
          return anchor?.offsetTop ?? null;
        }
        return getVirtualPromptOffset(marker.index);
      }
      const anchor = findStreamItemAnchor(contentRef.current, marker.id);
      return anchor?.offsetTop ?? null;
    },
    [getVirtualPromptOffset, promptIndexGeometry.unloadedPromptOffsetsById, shouldUseVirtualizer],
  );

  const resolveItemOffsetById = useCallback(
    (itemId: string): number | null => {
      const virtualIndex = segments.historyVirtualized.findIndex((item) => item.id === itemId);
      if (virtualIndex >= 0) {
        return getVirtualPromptOffset(virtualIndex);
      }
      const anchor = findStreamItemAnchor(contentRef.current, itemId);
      return anchor?.offsetTop ?? null;
    },
    [getVirtualPromptOffset, segments.historyVirtualized],
  );

  const resolveFindMarkerOffset = useCallback(
    (marker: StreamFindMarker): number | null => {
      const contentElement = contentRef.current;
      const matchAnchor = findFindMatchAnchor(contentElement, marker.id);
      if (contentElement && matchAnchor) {
        return getElementTopWithinContent(contentElement, matchAnchor);
      }
      return resolveItemOffsetById(marker.itemId);
    },
    [resolveItemOffsetById],
  );

  const updatePromptRailMetrics = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || !showMarkerRail) {
      setPromptRailMetrics((previous) => {
        const next: PromptRailMetrics = {
          viewportSize: 0,
          contentSize: 0,
          scrollOffset: 0,
          previewBoundsTop: 0,
          previewBoundsBottom: 0,
          offsetsById: new Map(),
        };
        return arePromptRailMetricsEqual(previous, next) ? previous : next;
      });
      return;
    }

    const offsetsById = new Map<string, number>();
    if (showFindMarkers) {
      for (const marker of findMarkers) {
        const offset = resolveFindMarkerOffset(marker);
        if (offset !== null) {
          offsetsById.set(marker.id, offset);
        }
      }
    } else if (showPromptMarkers) {
      for (const marker of promptMarkerDescriptors) {
        const offset = resolvePromptOffset(marker);
        if (offset !== null) {
          offsetsById.set(marker.id, offset);
        }
      }
    }

    const previewBounds = getPromptPreviewBounds(scrollContainer);
    const next: PromptRailMetrics = {
      viewportSize: scrollContainer.clientHeight,
      contentSize: scrollContainer.scrollHeight,
      scrollOffset: scrollContainer.scrollTop,
      previewBoundsTop: previewBounds.top,
      previewBoundsBottom: previewBounds.bottom,
      offsetsById,
    };
    setPromptRailMetrics((previous) =>
      arePromptRailMetricsEqual(previous, next) ? previous : next,
    );
  }, [
    findMarkers,
    promptMarkerDescriptors,
    resolveFindMarkerOffset,
    resolvePromptOffset,
    showFindMarkers,
    showMarkerRail,
    showPromptMarkers,
  ]);

  const updatePromptRailScrollOffset = useCallback((scrollOffset: number) => {
    setPromptRailMetrics((previous) => {
      if (previous.scrollOffset === scrollOffset) {
        return previous;
      }
      return { ...previous, scrollOffset };
    });
  }, []);

  const measureVirtualizedRowElement = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        rowVirtualizer.measureElement(null);
        return;
      }
      const pendingFrames = pendingVirtualRowMeasureFramesRef.current;
      const existingFrame = pendingFrames.get(node);
      if (existingFrame !== undefined) {
        window.cancelAnimationFrame(existingFrame);
      }
      const frame = window.requestAnimationFrame(() => {
        pendingFrames.delete(node);
        if (node.isConnected) {
          rowVirtualizer.measureElement(node);
        }
      });
      pendingFrames.set(node, frame);
    },
    [rowVirtualizer],
  );

  useEffect(() => {
    const pendingFrames = pendingVirtualRowMeasureFramesRef.current;
    return () => {
      for (const frame of pendingFrames.values()) {
        window.cancelAnimationFrame(frame);
      }
      pendingFrames.clear();
    };
  }, []);

  const cancelPendingStickToBottom = useCallback(() => {
    const pendingFrame = pendingAutoScrollFrameRef.current;
    if (pendingFrame !== null) {
      pendingAutoScrollFrameRef.current = null;
      window.cancelAnimationFrame(pendingFrame);
    }
    const pendingTimeout = pendingAutoScrollTimeoutRef.current;
    if (pendingTimeout !== null) {
      pendingAutoScrollTimeoutRef.current = null;
      window.clearTimeout(pendingTimeout);
    }
  }, []);

  const scrollMessagesToBottom = useCallback(
    (behavior: ScrollBehaviorLike = "auto") => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        return;
      }
      if (isScrollContainerOverscrolledPastBottom(scrollContainer)) {
        return;
      }
      scrollElementToBottom(scrollContainer, behavior);
      lastKnownScrollTopRef.current = scrollContainer.scrollTop;
      syncNearBottom(scrollContainer, onNearBottomChange);
    },
    [onNearBottomChange],
  );

  const scheduleStickToBottom = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer && isScrollContainerOverscrolledPastBottom(scrollContainer)) {
      return;
    }
    if (pendingAutoScrollFrameRef.current !== null) {
      return;
    }
    pendingAutoScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingAutoScrollFrameRef.current = null;
      if (!followOutputRef.current) {
        return;
      }
      scrollMessagesToBottom("auto");
    });
  }, [scrollMessagesToBottom]);

  const forceStickToBottom = useCallback(() => {
    cancelPendingStickToBottom();
    scrollMessagesToBottom("auto");
    scheduleStickToBottom();
  }, [cancelPendingStickToBottom, scheduleStickToBottom, scrollMessagesToBottom]);

  const scrollToStreamItemTop = useCallback(
    (itemId: string) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        return;
      }
      const element = streamItemElementByIdRef.current.get(itemId);
      if (element) {
        setFollowOutput(false);
        scrollContainer.scrollTo({
          top: Math.max(0, element.offsetTop - PINNED_USER_INPUT_SCROLL_TOP_OFFSET),
          behavior: "smooth",
        });
        return;
      }
      const estimatedTop = findEstimatedStreamItemTop({
        items: segments.historyVirtualized,
        itemId,
        estimateHeight: estimateStreamItemHeight,
        initialTop: virtualRowsContainerRef.current?.offsetTop ?? 0,
      });
      if (estimatedTop === null) {
        return;
      }
      setFollowOutput(false);
      scrollContainer.scrollTo({
        top: Math.max(0, estimatedTop - PINNED_USER_INPUT_SCROLL_TOP_OFFSET),
        behavior: "smooth",
      });
    },
    [segments.historyVirtualized, setFollowOutput],
  );

  const updateScrollMetrics = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      onNearBottomChange(true);
      return;
    }
    syncNearBottom(scrollContainer, onNearBottomChange);
  }, [onNearBottomChange]);

  const collectPinnedUserInputCandidates = useCallback((): PinnedUserInputCandidate[] => {
    const geometries: PinnedUserInputGeometry[] = [];
    const virtualContainerTop = virtualRowsContainerRef.current?.offsetTop ?? 0;
    let virtualTop = virtualContainerTop;
    for (const item of segments.historyVirtualized) {
      const height = estimateStreamItemHeight(item);
      geometries.push({
        item,
        top: virtualTop,
        bottom: virtualTop + height,
      });
      virtualTop += height;
    }

    const mountedItems = [...segments.historyMounted, ...segments.liveHead];
    for (const item of mountedItems) {
      const element = streamItemElementByIdRef.current.get(item.id);
      if (!element) {
        continue;
      }
      geometries.push({
        item,
        top: element.offsetTop,
        bottom: element.offsetTop + element.offsetHeight,
      });
    }
    const orderedGeometries = geometries.toSorted((left, right) => left.top - right.top);
    return collectPinnedUserInputCandidatesFromGeometries(orderedGeometries);
  }, [segments.historyMounted, segments.historyVirtualized, segments.liveHead]);

  const updatePinnedUserInput = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      onPinnedUserInputChange(null);
      return;
    }
    onPinnedUserInputChange(
      selectPinnedUserInput({
        enabled: pinUserInputsEnabled,
        candidates: collectPinnedUserInputCandidates(),
        viewportTop: scrollContainer.scrollTop,
        viewportBottom: scrollContainer.scrollTop + scrollContainer.clientHeight,
        pinnedBottom,
      }),
    );
  }, [
    collectPinnedUserInputCandidates,
    onPinnedUserInputChange,
    pinUserInputsEnabled,
    pinnedBottom,
  ]);

  const handleDomScroll = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const currentScrollTop = scrollContainer.scrollTop;
    const isAtBottom = isScrollContainerAtBottom(scrollContainer);
    const scrolledUp = currentScrollTop < lastKnownScrollTopRef.current - USER_SCROLL_DELTA_EPSILON;

    if (!followOutputRef.current && isAtBottom) {
      setFollowOutput(true);
      pendingUserScrollUpIntentRef.current = false;
    } else if (followOutputRef.current && pendingUserScrollUpIntentRef.current) {
      if (scrolledUp) {
        cancelPendingStickToBottom();
        setFollowOutput(false);
      }
      pendingUserScrollUpIntentRef.current = false;
    } else if (followOutputRef.current && isPointerScrollActiveRef.current) {
      if (scrolledUp) {
        cancelPendingStickToBottom();
        setFollowOutput(false);
      }
    }

    lastKnownScrollTopRef.current = currentScrollTop;
    updateScrollMetrics();
    updatePinnedUserInput();
    if (showMarkerRail) {
      updatePromptRailScrollOffset(currentScrollTop);
    }
    if (
      showMarkerRail &&
      (scrollContainer.clientHeight !== promptRailMetrics.viewportSize ||
        scrollContainer.scrollHeight !== promptRailMetrics.contentSize)
    ) {
      updatePromptRailMetrics();
    }
    if (
      historyStartReadyRef.current &&
      hasOlderHistory &&
      currentScrollTop <= promptIndexGeometry.unloadedSpacerHeight + HISTORY_START_THRESHOLD_PX
    ) {
      onNearHistoryStart();
    }
  }, [
    cancelPendingStickToBottom,
    hasOlderHistory,
    onNearHistoryStart,
    promptIndexGeometry.unloadedSpacerHeight,
    promptRailMetrics.contentSize,
    promptRailMetrics.viewportSize,
    setFollowOutput,
    showMarkerRail,
    updatePromptRailMetrics,
    updatePromptRailScrollOffset,
    updatePinnedUserInput,
    updateScrollMetrics,
  ]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      historyStartReadyRef.current = true;
    });
    return () => {
      window.cancelAnimationFrame(frame);
      historyStartReadyRef.current = false;
    };
  }, [props.agentId]);

  useLayoutEffect(() => {
    if (!isActivationReady) {
      return;
    }
    setFollowOutput(true);
    forceStickToBottom();
    const timeout = window.setTimeout(() => {
      if (!followOutputRef.current) {
        return;
      }
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        return;
      }
      if (isScrollContainerNearBottom(scrollContainer)) {
        return;
      }
      scheduleStickToBottom();
    }, WEB_BOTTOM_SETTLE_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    activationKey,
    forceStickToBottom,
    isActivationReady,
    scheduleStickToBottom,
    setFollowOutput,
  ]);

  useEffect(() => {
    if (!followOutputRef.current) {
      return;
    }
    scheduleStickToBottom();
  }, [
    scheduleStickToBottom,
    segments.historyMounted,
    segments.historyVirtualized,
    segments.liveHead,
  ]);

  useEffect(() => {
    if (!followOutputRef.current || !shouldUseVirtualizer) {
      return;
    }
    scheduleStickToBottom();
  }, [scheduleStickToBottom, shouldUseVirtualizer, virtualTotalSize]);

  useEffect(() => {
    updateScrollMetrics();
    updatePinnedUserInput();
  }, [
    segments.historyMounted.length,
    segments.historyVirtualized.length,
    segments.liveHead.length,
    updateScrollMetrics,
    updatePinnedUserInput,
    virtualTotalSize,
  ]);

  useEffect(() => {
    updatePromptRailMetrics();
  }, [
    segments.historyMounted,
    segments.historyVirtualized,
    segments.liveHead,
    updatePromptRailMetrics,
    virtualTotalSize,
  ]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const contentNode = contentRef.current;
    if (!scrollContainer || typeof ResizeObserver === "undefined") {
      return;
    }
    const previewBoundsElement = getPromptPreviewBoundsElement(scrollContainer);

    updateScrollMetrics();
    updatePromptRailMetrics();
    const observer = new ResizeObserver(() => {
      updateScrollMetrics();
      updatePinnedUserInput();
      updatePromptRailMetrics();
      if (shouldSuppressNextResizeStickToBottomRef.current) {
        shouldSuppressNextResizeStickToBottomRef.current = false;
        return;
      }
      if (!followOutputRef.current) {
        return;
      }
      scheduleStickToBottom();
    });
    observer.observe(scrollContainer);
    if (contentNode) {
      observer.observe(contentNode);
    }
    if (previewBoundsElement !== scrollContainer && previewBoundsElement !== contentNode) {
      observer.observe(previewBoundsElement);
    }
    return () => {
      observer.disconnect();
    };
  }, [scheduleStickToBottom, updatePinnedUserInput, updatePromptRailMetrics, updateScrollMetrics]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        pendingUserScrollUpIntentRef.current = true;
        cancelPendingStickToBottom();
      }
    };
    const handlePointerDown = () => {
      isPointerScrollActiveRef.current = true;
    };
    const handlePointerUp = () => {
      isPointerScrollActiveRef.current = false;
    };
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      lastTouchClientYRef.current = touch.clientY;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const previousTouchY = lastTouchClientYRef.current;
      if (previousTouchY !== null && touch.clientY > previousTouchY + 1) {
        pendingUserScrollUpIntentRef.current = true;
        cancelPendingStickToBottom();
      }
      lastTouchClientYRef.current = touch.clientY;
    };
    const handleTouchEnd = () => {
      lastTouchClientYRef.current = null;
    };

    scrollContainer.addEventListener("scroll", handleDomScroll, { passive: true });
    scrollContainer.addEventListener("wheel", handleWheel, { passive: true });
    scrollContainer.addEventListener("pointerdown", handlePointerDown, { passive: true });
    scrollContainer.addEventListener("pointerup", handlePointerUp, { passive: true });
    scrollContainer.addEventListener("pointercancel", handlePointerUp, { passive: true });
    scrollContainer.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollContainer.addEventListener("touchmove", handleTouchMove, { passive: true });
    scrollContainer.addEventListener("touchend", handleTouchEnd, { passive: true });
    scrollContainer.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      scrollContainer.removeEventListener("scroll", handleDomScroll);
      scrollContainer.removeEventListener("wheel", handleWheel);
      scrollContainer.removeEventListener("pointerdown", handlePointerDown);
      scrollContainer.removeEventListener("pointerup", handlePointerUp);
      scrollContainer.removeEventListener("pointercancel", handlePointerUp);
      scrollContainer.removeEventListener("touchstart", handleTouchStart);
      scrollContainer.removeEventListener("touchmove", handleTouchMove);
      scrollContainer.removeEventListener("touchend", handleTouchEnd);
      scrollContainer.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [cancelPendingStickToBottom, handleDomScroll]);

  useEffect(() => {
    const handle: StreamViewportHandle = {
      scrollToBottom: () => {
        setFollowOutput(true);
        cancelPendingStickToBottom();
        forceStickToBottom();
      },
      scrollToStreamItemTop,
      prepareForViewportChange: () => {
        if (!followOutputRef.current) {
          return;
        }
        scheduleStickToBottom();
      },
      pauseBottomAnchoringForNextLayoutChange: () => {
        shouldSuppressNextResizeStickToBottomRef.current = true;
        cancelPendingStickToBottom();
      },
    };
    viewportRef.current = handle;
    return () => {
      if (viewportRef.current === handle) {
        viewportRef.current = null;
      }
      cancelPendingStickToBottom();
    };
  }, [
    cancelPendingStickToBottom,
    forceStickToBottom,
    scheduleStickToBottom,
    setFollowOutput,
    scrollToStreamItemTop,
    viewportRef,
  ]);

  const contentContainerStyle = useMemo((): CSSProperties => {
    return {
      display: "flex",
      flexDirection: "column",
      minHeight: "100%",
      paddingTop: 16,
      paddingBottom: 16,
      paddingLeft: isMobileBreakpoint ? 8 : 16,
      paddingRight: isMobileBreakpoint ? 8 : 16,
      boxSizing: "border-box",
    };
  }, [isMobileBreakpoint]);
  const scrollContainerStyle = useMemo((): CSSProperties => {
    return {
      flex: 1,
      minHeight: 0,
      overflowX: "hidden",
      overflowY: scrollEnabled ? "auto" : "hidden",
      overscrollBehaviorY: "contain",
    };
  }, [scrollEnabled]);
  const viewportChromeStyle = useMemo(
    (): CSSProperties => ({
      position: "relative",
      display: "flex",
      flex: 1,
      minHeight: 0,
    }),
    [],
  );
  const virtualRowsContainerStyle = useMemo((): CSSProperties => {
    return {
      position: "relative",
      width: "100%",
      height: virtualTotalSize,
    };
  }, [virtualTotalSize]);
  const unloadedHistorySpacerStyle = useMemo((): CSSProperties | null => {
    if (promptIndexGeometry.unloadedSpacerHeight <= 0) {
      return null;
    }
    return {
      height: promptIndexGeometry.unloadedSpacerHeight,
      flexShrink: 0,
    };
  }, [promptIndexGeometry.unloadedSpacerHeight]);
  const renderVirtualRowStyle = useCallback(
    (start: number): CSSProperties => ({
      position: "absolute",
      top: 0,
      left: 0,
      display: "flex",
      flexDirection: "column",
      width: "100%",
      transform: `translateY(${start}px)`,
    }),
    [],
  );
  const mountedHistoryRows = useMemo(() => {
    return segments.historyMounted.map((item, index) => (
      <StreamItemElement key={item.id} itemId={item.id} setStreamItemElement={setStreamItemElement}>
        {renderHistoryMountedRow(item, index, segments.historyMounted)}
      </StreamItemElement>
    ));
  }, [renderHistoryMountedRow, segments.historyMounted, setStreamItemElement]);
  const mountedVirtualHistoryRows = useMemo(() => {
    if (shouldUseVirtualizer) {
      return null;
    }
    return segments.historyVirtualized.map((item, index) => (
      <StreamItemElement key={item.id} itemId={item.id} setStreamItemElement={setStreamItemElement}>
        {renderHistoryVirtualizedRow(item, index, segments.historyVirtualized)}
      </StreamItemElement>
    ));
  }, [
    renderHistoryVirtualizedRow,
    segments.historyVirtualized,
    setStreamItemElement,
    shouldUseVirtualizer,
  ]);
  const liveHeadRows = useMemo(() => {
    return segments.liveHead.map((item, index) => (
      <StreamItemElement key={item.id} itemId={item.id} setStreamItemElement={setStreamItemElement}>
        {renderLiveHeadRow(item, index, segments.liveHead)}
      </StreamItemElement>
    ));
  }, [renderLiveHeadRow, segments.liveHead, setStreamItemElement]);
  const liveAuxiliary = useMemo(() => {
    return renderLiveAuxiliary();
  }, [renderLiveAuxiliary]);
  const historyStartSlot = useMemo(() => {
    if (!isLoadingOlderHistory) {
      return null;
    }
    return (
      <div style={historyStartSlotStyle} data-testid="load-older-history-spinner">
        <LoadingSpinner size="small" />
      </div>
    );
  }, [isLoadingOlderHistory]);
  const shouldRenderEmpty =
    !boundary.hasMountedHistory &&
    !boundary.hasVirtualizedHistory &&
    !boundary.hasLiveHead &&
    !liveAuxiliary;
  const scrollMarkers = useMemo((): ScrollMarker[] => {
    if (showFindMarkers) {
      return findMarkers.flatMap((marker) => {
        const targetOffset = promptRailMetrics.offsetsById.get(marker.id);
        return targetOffset === undefined
          ? []
          : [
              {
                id: marker.id,
                itemId: marker.itemId,
                kind: "find" as const,
                targetOffset,
              },
            ];
      });
    }
    if (showPromptMarkers) {
      return promptMarkerDescriptors.flatMap((descriptor) => {
        const targetOffset = promptRailMetrics.offsetsById.get(descriptor.id);
        return targetOffset === undefined
          ? []
          : [
              {
                id: descriptor.id,
                itemId: descriptor.id,
                kind: "prompt" as const,
                targetOffset,
                preview: descriptor.text,
                segment: descriptor.segment,
                index: descriptor.index,
              },
            ];
      });
    }
    return [];
  }, [
    findMarkers,
    promptMarkerDescriptors,
    promptRailMetrics.offsetsById,
    showFindMarkers,
    showPromptMarkers,
  ]);
  const activeScrollMarkerId = useMemo(() => {
    if (showFindMarkers) {
      return findActiveMarkerId;
    }
    return getActiveScrollMarkerId({
      markers: scrollMarkers,
      scrollOffset: promptRailMetrics.scrollOffset,
    });
  }, [findActiveMarkerId, promptRailMetrics.scrollOffset, scrollMarkers, showFindMarkers]);
  const handleScrollMarkerPress = useCallback(
    (marker: ScrollMarker) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        return;
      }
      if (marker.kind === "find") {
        findIndicator?.onMarkerPress(marker.id);
      } else if (marker.segment === "unloadedHistory") {
        pendingUnloadedPromptTargetIdRef.current = marker.id;
        if (hasOlderHistory && !isLoadingOlderHistory) {
          onNearHistoryStart();
        }
      }
      const resolvedOffset =
        marker.kind === "find"
          ? (resolveFindMarkerOffset(marker) ?? marker.targetOffset)
          : (resolvePromptOffset({
              id: marker.id,
              text: marker.preview ?? "",
              index: marker.index ?? 0,
              segment: marker.segment ?? "mountedHistory",
            }) ?? marker.targetOffset);
      const maxScrollOffset = Math.max(
        0,
        scrollContainer.scrollHeight - scrollContainer.clientHeight,
      );
      scrollContainer.scrollTo({
        top: clamp(resolvedOffset - PROMPT_SCROLL_TARGET_TOP_PADDING, 0, maxScrollOffset),
        behavior: "auto",
      });
    },
    [
      findIndicator,
      hasOlderHistory,
      isLoadingOlderHistory,
      onNearHistoryStart,
      resolveFindMarkerOffset,
      resolvePromptOffset,
    ],
  );

  useEffect(() => {
    const targetId = pendingUnloadedPromptTargetIdRef.current;
    if (!targetId) {
      return;
    }
    if (!promptIndexGeometry.unloadedPromptOffsetsById.has(targetId)) {
      pendingUnloadedPromptTargetIdRef.current = null;
      updatePromptRailMetrics();
      return;
    }
    if (!hasOlderHistory || isLoadingOlderHistory) {
      return;
    }
    onNearHistoryStart();
  }, [
    hasOlderHistory,
    isLoadingOlderHistory,
    onNearHistoryStart,
    promptIndexGeometry.unloadedPromptOffsetsById,
    updatePromptRailMetrics,
  ]);

  return (
    <div style={viewportChromeStyle}>
      <div
        ref={handleScrollContainerRef}
        data-testid="agent-chat-scroll"
        id={`agent-chat-scroll-${shouldUseVirtualizer ? "web-dom-virtualized" : "web-dom-scroll"}`}
        style={scrollContainerStyle}
      >
        <div ref={handleContentRef} style={contentContainerStyle}>
          {props.layoutProbe}
          {historyStartSlot}
          {unloadedHistorySpacerStyle ? (
            <div
              data-testid="agent-chat-unloaded-history-spacer"
              style={unloadedHistorySpacerStyle}
            />
          ) : null}
          {shouldUseVirtualizer ? (
            <div ref={handleVirtualRowsContainerRef} style={virtualRowsContainerStyle}>
              {virtualRows.map((virtualRow) => {
                const item = segments.historyVirtualized[virtualRow.index];
                if (!item) {
                  return null;
                }
                return (
                  <VirtualStreamItemElement
                    key={virtualRow.key}
                    index={virtualRow.index}
                    itemId={item.id}
                    measureElement={measureVirtualizedRowElement}
                    setStreamItemElement={setStreamItemElement}
                    style={renderVirtualRowStyle(virtualRow.start)}
                  >
                    {renderHistoryVirtualizedRow(
                      item,
                      virtualRow.index,
                      segments.historyVirtualized,
                    )}
                  </VirtualStreamItemElement>
                );
              })}
            </div>
          ) : null}
          {mountedVirtualHistoryRows}
          {mountedHistoryRows}
          {liveHeadRows}
          {liveAuxiliary}
          {shouldRenderEmpty ? listEmptyComponent : null}
        </div>
      </div>
      <ScrollMarkerRail
        markers={scrollMarkers}
        viewportSize={promptRailMetrics.viewportSize}
        contentSize={promptRailMetrics.contentSize}
        previewBoundsTop={promptRailMetrics.previewBoundsTop}
        previewBoundsBottom={promptRailMetrics.previewBoundsBottom}
        activeMarkerId={activeScrollMarkerId}
        railTestId={markerRailPresentation.railTestId}
        itemTestIdPrefix={markerRailPresentation.itemTestIdPrefix}
        ariaLabel={markerRailPresentation.ariaLabel}
        onMarkerPress={handleScrollMarkerPress}
      />
      {pinnedUserInputOverlay}
      {scrollbarOverlay}
    </div>
  );
}

export function createWebStreamStrategy(input: CreateWebStreamStrategyInput): StreamStrategy {
  return createStreamStrategy({
    render: (renderInput) => (
      <WebStreamViewport
        key={renderInput.agentId}
        {...renderInput}
        isMobileBreakpoint={input.isMobileBreakpoint}
      />
    ),
    orderTailReverse: false,
    orderHeadReverse: false,
    assistantTurnTraversalStep: -1,
    edgeSlot: "footer",
    historyLiveBoundaryEdge: "last",
    liveHeadHistoryBoundaryEdge: "first",
    frameChildOrder: "content-then-footer",
    flatListInverted: false,
    overlayScrollbarInverted: false,
    maintainVisibleContentPosition: undefined,
    bottomAnchorTransportBehavior: {
      verificationDelayFrames: 0,
      verificationRetryMode: "rescroll",
    },
    disableParentScrollOnInlineDetailsExpansion: false,
    anchorBottomOnContentSizeChange: true,
    animateManualScrollToBottom: false,
    useVirtualizedList: false,
    isNearBottom: (inputMetrics) => {
      const distanceFromBottom = Math.max(
        0,
        inputMetrics.contentHeight - (inputMetrics.offsetY + inputMetrics.viewportHeight),
      );
      return distanceFromBottom <= inputMetrics.threshold;
    },
    getBottomOffset: (metrics) => Math.max(0, metrics.contentHeight - metrics.viewportHeight),
  });
}
