import React, {
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet as RNStyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH, useIsCompactFormFactor } from "@/constants/layout";
import { useMutation } from "@tanstack/react-query";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MessageSquareText,
  Search,
  Wrench,
  X,
} from "lucide-react-native";
import { usePanelStore } from "@/stores/panel-store";
import { useAppSettings } from "@/hooks/use-settings";
import {
  AssistantMessage,
  SpeakMessage,
  UserMessage,
  ActivityLog,
  ToolCall,
  TodoListCard,
  CompactionMarker,
  MessageOuterSpacingProvider,
  type InlinePathTarget,
} from "@/components/message";
import { PlanCard } from "@/components/plan-card";
import type { StreamItem } from "@/types/stream";
import type { PendingPermission } from "@/types/shared";
import type {
  AgentCapabilityFlags,
  AgentPermissionAction,
  AgentPermissionResponse,
} from "@getpaseo/protocol/agent-types";
import type { AgentScreenAgent } from "@/hooks/use-agent-screen-state-machine";
import { useSessionStore } from "@/stores/session-store";
import { useFileExplorerActions } from "@/hooks/use-file-explorer-actions";
import { useLoadOlderAgentHistory } from "@/hooks/use-load-older-agent-history";
import type { ToastApi } from "@/components/toast-host";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { ToolCallDetailsContent } from "@/components/tool-call-details";
import { QuestionFormCard } from "@/components/question-form-card";
import { ToolCallSheetProvider } from "@/components/tool-call-sheet";
import {
  buildCollapseThinkingGroups,
  getThinkingGroupCounts,
  getThinkingGroupPreviewMessages,
  shouldShowThinkingGroupPreview,
  type ThinkingGroup,
  type ThinkingGroupIndex,
  type ThinkingGroupPreviewMessage,
} from "./collapse-thinking";
import { type AgentStreamRenderModel, buildAgentStreamRenderModel } from "./model";
import { resolveStreamRenderStrategy } from "./strategy-resolver";
import { type StreamSegmentRenderers, type StreamViewportHandle } from "./strategy";
import { CompletedTurnFooterRow, TurnFooter, type TurnContentStrategy } from "./turn-footer";
import { layoutStream, type StreamLayoutItem } from "./layout";
import {
  type BottomAnchorLocalRequest,
  type BottomAnchorRouteRequest,
} from "./bottom-anchor-controller";
import {
  AssistantFileLinkResolverProvider,
  normalizeInlinePathTarget,
} from "@/assistant-file-links";
import {
  createWorkspaceFileTabTarget,
  normalizeWorkspaceFileLocation,
  type OpenFileDisposition,
  type WorkspaceFileOpenRequest,
} from "@/workspace/file-open";
import { navigateToPreparedWorkspaceTab } from "@/utils/workspace-navigation";
import { useStableEvent } from "@/hooks/use-stable-event";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { recordRenderProfileReasons } from "@/utils/render-profiler";
import { MountedTabActiveContext } from "@/components/split-container";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import {
  buildFindHighlights,
  buildFindRecords,
  FIND_PART_MESSAGE,
  FIND_PART_SPEAK_MESSAGE,
  FIND_PART_TOOL_SUMMARY,
  FIND_PART_TOOL_TITLE,
  getFindHighlightRanges,
  type FindHighlightsByItemId,
  type FindInThreadMatch,
} from "./find-in-thread";
import { startFindThreadJob } from "./find-runner";

const FIND_KEYBOARD_ACTIONS = [
  "agent.find.open",
  "agent.find.next",
  "agent.find.previous",
  "agent.find.close",
] as const;

function renderLiveAuxiliaryNode(input: {
  pendingPermissions: ReactNode;
  turnFooter: ReactNode;
}): ReactNode {
  if (!input.pendingPermissions && !input.turnFooter) {
    return null;
  }
  return (
    <>
      {input.turnFooter}
      {input.pendingPermissions ? (
        <View style={stylesheet.contentWrapper}>
          <View style={stylesheet.listHeaderContent}>{input.pendingPermissions}</View>
        </View>
      ) : null}
    </>
  );
}

function renderPendingPermissionsNode(input: {
  pendingPermissions: PendingPermission[];
  client: DaemonClient | null;
}): ReactNode {
  if (input.pendingPermissions.length === 0) {
    return null;
  }
  return (
    <View style={stylesheet.permissionsContainer}>
      {input.pendingPermissions.map((permission) => (
        <PermissionRequestCard key={permission.key} permission={permission} client={input.client} />
      ))}
    </View>
  );
}

function renderStreamItemWithTurnFooter(input: {
  content: ReactNode;
  layoutItem: StreamLayoutItem;
  strategy: TurnContentStrategy;
}): ReactNode {
  if (!input.content) {
    return null;
  }

  const footerHost = input.layoutItem.completedFooter;
  const footer = footerHost ? (
    <CompletedTurnFooterRow
      strategy={input.strategy}
      items={footerHost.items}
      timing={footerHost.timing}
      startIndex={footerHost.startIndex}
    />
  ) : null;
  const content = (
    <StreamItemWrapper gapBelow={input.layoutItem.gapBelow}>{input.content}</StreamItemWrapper>
  );

  if (input.layoutItem.frameOrder === "footer-then-content") {
    return (
      <>
        {footer}
        {content}
      </>
    );
  }

  return (
    <>
      {content}
      {footer}
    </>
  );
}

function renderListEmptyComponent(input: {
  renderModel: AgentStreamRenderModel;
  emptyStateStyle: StyleProp<ViewStyle>;
  emptyText: string;
}): ReactNode {
  if (
    input.renderModel.boundary.hasVirtualizedHistory ||
    input.renderModel.boundary.hasMountedHistory ||
    input.renderModel.boundary.hasLiveHead ||
    input.renderModel.auxiliary.pendingPermissions ||
    input.renderModel.auxiliary.turnFooter
  ) {
    return null;
  }

  return (
    <View style={input.emptyStateStyle}>
      <Text style={stylesheet.emptyStateText}>{input.emptyText}</Text>
    </View>
  );
}

function renderHistoryStreamItem(input: {
  item: StreamItem;
  layoutItemById: Map<string, StreamLayoutItem>;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}): ReactNode {
  const layoutItem = input.layoutItemById.get(input.item.id);
  if (!layoutItem) {
    return null;
  }
  return input.renderStreamItem(layoutItem);
}

function renderLiveHeadStreamItem(input: {
  item: StreamItem;
  layoutItemById: Map<string, StreamLayoutItem>;
  renderStreamItem: (layoutItem: StreamLayoutItem) => ReactNode;
}): ReactNode {
  const layoutItem = input.layoutItemById.get(input.item.id);
  if (!layoutItem) {
    return null;
  }
  return input.renderStreamItem(layoutItem);
}

function getTodoFindHighlightRanges(
  highlights: FindHighlightsByItemId,
  itemId: string,
): Map<number, ReturnType<typeof getFindHighlightRanges>> | undefined {
  const parts = highlights.get(itemId);
  if (!parts) {
    return undefined;
  }
  const rangesByIndex = new Map<number, ReturnType<typeof getFindHighlightRanges>>();
  for (const [part, ranges] of parts) {
    if (!part.startsWith("todo:")) {
      continue;
    }
    const index = Number(part.slice("todo:".length));
    if (Number.isInteger(index) && index >= 0) {
      rangesByIndex.set(index, ranges);
    }
  }
  return rangesByIndex.size > 0 ? rangesByIndex : undefined;
}

function getNextFindMatchId(
  matches: readonly FindInThreadMatch[],
  previousMatchId: string | null,
  delta: 1 | -1,
): string | null {
  if (matches.length === 0) {
    return null;
  }
  const currentIndex = previousMatchId
    ? matches.findIndex((match) => match.id === previousMatchId)
    : -1;
  if (currentIndex >= 0) {
    return matches[(currentIndex + delta + matches.length) % matches.length]?.id ?? null;
  }
  if (delta > 0) {
    return matches[0]?.id ?? null;
  }
  return matches.at(-1)?.id ?? null;
}

function resolveActiveFindMatchId(input: {
  currentMatchId: string | null;
  preservedMatchId: string | null;
  matches: readonly FindInThreadMatch[];
}): string | null {
  if (input.currentMatchId && input.matches.some((match) => match.id === input.currentMatchId)) {
    return input.currentMatchId;
  }
  if (
    input.preservedMatchId &&
    input.matches.some((match) => match.id === input.preservedMatchId)
  ) {
    return input.preservedMatchId;
  }
  return input.matches[0]?.id ?? null;
}

export interface AgentStreamViewHandle {
  scrollToBottom(reason?: BottomAnchorLocalRequest["reason"]): void;
  prepareForViewportChange(): void;
  pauseBottomAnchoringForNextLayoutChange(): void;
}

export interface AgentStreamViewProps {
  agentId: string;
  serverId?: string;
  agent: AgentScreenAgent;
  streamItems: StreamItem[];
  pendingPermissions: Map<string, PendingPermission>;
  routeBottomAnchorRequest?: BottomAnchorRouteRequest | null;
  isAuthoritativeHistoryReady?: boolean;
  toast?: ToastApi | null;
  onOpenWorkspaceFile?: (request: WorkspaceFileOpenRequest) => void;
  isPaneFocused?: boolean;
}

const AGENT_CAPABILITY_FLAG_KEYS: (keyof AgentCapabilityFlags)[] = [
  "supportsStreaming",
  "supportsSessionPersistence",
  "supportsDynamicModes",
  "supportsMcpServers",
  "supportsReasoningStream",
  "supportsToolInvocations",
  "supportsRewindConversation",
  "supportsRewindFiles",
  "supportsRewindBoth",
];

const EMPTY_STREAM_HEAD: StreamItem[] = [];

const EMPTY_THINKING_GROUP_INDEX: ThinkingGroupIndex = {
  groups: [],
  groupByAnchorItemId: new Map(),
  groupByItemId: new Map(),
};

const THINKING_GROUP_PREVIEW_BOTTOM_EPSILON = 4;

const AgentStreamViewComponent = forwardRef<AgentStreamViewHandle, AgentStreamViewProps>(
  function AgentStreamView(
    {
      agentId,
      serverId,
      agent,
      streamItems,
      pendingPermissions,
      routeBottomAnchorRequest = null,
      isAuthoritativeHistoryReady = true,
      toast,
      onOpenWorkspaceFile,
      isPaneFocused = true,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const viewportRef = useRef<StreamViewportHandle | null>(null);
    const isMobile = useIsCompactFormFactor();
    const streamRenderStrategy = useMemo(
      () =>
        resolveStreamRenderStrategy({
          platform: Platform.OS,
          isMobileBreakpoint: isMobile,
        }),
      [isMobile],
    );
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [expandedInlineToolCallIds, setExpandedInlineToolCallIds] = useState<Set<string>>(
      new Set(),
    );
    const [expandedThinkingGroupIds, setExpandedThinkingGroupIds] = useState<Map<string, boolean>>(
      new Map(),
    );
    const [isFindOpen, setIsFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState("");
    const [findIncludesThinking, setFindIncludesThinking] = useState(false);
    const [findMatches, setFindMatches] = useState<FindInThreadMatch[]>([]);
    const [activeFindMatchId, setActiveFindMatchId] = useState<string | null>(null);
    const [isFindScanning, setIsFindScanning] = useState(false);
    const [findScannedRecordCount, setFindScannedRecordCount] = useState(0);
    const [findTotalRecordCount, setFindTotalRecordCount] = useState(0);
    const findInputRef = useRef<TextInput | null>(null);
    const activeFindMatchIdRef = useRef<string | null>(null);
    const preservedFindMatchIdRef = useRef<string | null>(null);
    const findMatchesRef = useRef<FindInThreadMatch[]>([]);
    const openFileExplorerForCheckout = usePanelStore((state) => state.openFileExplorerForCheckout);
    const setExplorerTabForCheckout = usePanelStore((state) => state.setExplorerTabForCheckout);
    const collapseThinkingBehavior = useAppSettings().settings.collapseThinking;

    // Get serverId (fallback to agent's serverId if not provided)
    const resolvedServerId = serverId ?? agent.serverId ?? "";

    const client = useSessionStore((state) => state.sessions[resolvedServerId]?.client ?? null);
    const streamHead = useSessionStore((state) =>
      state.sessions[resolvedServerId]?.agentStreamHead?.get(agentId),
    );

    const workspaceRoot = agent.cwd?.trim() || "";
    const { requestDirectoryListing } = useFileExplorerActions({
      serverId: resolvedServerId,
      workspaceId: agent.workspaceId,
      workspaceRoot,
    });
    const { isLoadingOlder, hasOlder, loadOlder } = useLoadOlderAgentHistory({
      serverId: resolvedServerId,
      agentId,
      toast,
    });
    // Keep entry/exit animations off on Android due to RN dispatchDraw crashes
    // tracked in react-native-reanimated#8422.
    const shouldDisableEntryExitAnimations = Platform.OS === "android";
    const scrollIndicatorFadeIn = shouldDisableEntryExitAnimations
      ? undefined
      : FadeIn.duration(200);
    const scrollIndicatorFadeOut = shouldDisableEntryExitAnimations
      ? undefined
      : FadeOut.duration(200);

    useEffect(() => {
      setIsNearBottom(true);
      setExpandedInlineToolCallIds(new Set());
      setExpandedThinkingGroupIds(new Map());
      setIsFindOpen(false);
      setFindQuery("");
      findMatchesRef.current = [];
      setFindMatches([]);
      setActiveFindMatchId(null);
    }, [agentId]);

    const handleInlinePathPress = useStableEvent(
      (target: InlinePathTarget, disposition: OpenFileDisposition) => {
        if (!target.path) {
          return;
        }

        const normalized = normalizeInlinePathTarget(target.path, agent.cwd);
        if (!normalized) {
          return;
        }

        if (normalized.file) {
          const location = normalizeWorkspaceFileLocation({
            path: normalized.file,
            lineStart: target.lineStart,
            lineEnd: target.lineEnd,
          });
          if (!location) {
            return;
          }

          if (onOpenWorkspaceFile) {
            onOpenWorkspaceFile({
              location,
              disposition,
            });
            return;
          }

          if (agent.workspaceId) {
            navigateToPreparedWorkspaceTab({
              serverId: resolvedServerId,
              workspaceId: agent.workspaceId,
              target: createWorkspaceFileTabTarget(location),
            });
          }
          return;
        }

        void requestDirectoryListing(normalized.directory, {
          recordHistory: false,
          setCurrentPath: false,
        });

        const checkout = {
          serverId: resolvedServerId,
          cwd: agent.cwd,
          isGit: agent.projectPlacement?.checkout?.isGit ?? true,
        };
        setExplorerTabForCheckout({ ...checkout, tab: "files" });
        openFileExplorerForCheckout({
          isCompact: isMobile,
          checkout,
        });
      },
    );

    const handleToolCallOpenFile = useStableEvent((filePath: string) => {
      handleInlinePathPress({ raw: filePath, path: filePath }, "main");
    });

    // Freeze stream data while this tab slot is hidden to prevent offscreen FlatList
    // cell-window renders on every 48ms flush from background agents.
    // When isActive flips back to true, the context change triggers a re-render and
    // the component reads the current (fresh) streamItems/streamHead from props.
    const isActive = useContext(MountedTabActiveContext);
    const frozenStreamItemsRef = useRef(streamItems);
    const frozenStreamHeadRef = useRef(streamHead);
    if (isActive) {
      frozenStreamItemsRef.current = streamItems;
      frozenStreamHeadRef.current = streamHead;
    }
    const effectiveStreamItems = isActive ? streamItems : frozenStreamItemsRef.current;
    const effectiveStreamHead = isActive ? streamHead : frozenStreamHeadRef.current;
    const chronologicalStreamItems = useMemo(
      () => [...effectiveStreamItems, ...(effectiveStreamHead ?? EMPTY_STREAM_HEAD)],
      [effectiveStreamHead, effectiveStreamItems],
    );
    const thinkingGroupIndex = useMemo(() => {
      if (collapseThinkingBehavior === "never") {
        return EMPTY_THINKING_GROUP_INDEX;
      }
      return buildCollapseThinkingGroups({
        items: chronologicalStreamItems,
        behavior: collapseThinkingBehavior,
        agentStatus: agent.status,
      });
    }, [agent.status, chronologicalStreamItems, collapseThinkingBehavior]);
    const findThinkingGroupIndex = useMemo(
      () =>
        buildCollapseThinkingGroups({
          items: chronologicalStreamItems,
          behavior: "completed",
          agentStatus: agent.status,
        }),
      [agent.status, chronologicalStreamItems],
    );
    const findRecords = useMemo(
      () =>
        buildFindRecords({
          items: chronologicalStreamItems,
          thinkingGroupIndex: findThinkingGroupIndex,
          options: { includeThinking: findIncludesThinking },
        }),
      [chronologicalStreamItems, findIncludesThinking, findThinkingGroupIndex],
    );
    const findHighlights = useMemo(
      () => buildFindHighlights({ matches: findMatches, activeMatchId: activeFindMatchId }),
      [activeFindMatchId, findMatches],
    );
    const activeFindMatch = useMemo(
      () => findMatches.find((match) => match.id === activeFindMatchId) ?? null,
      [activeFindMatchId, findMatches],
    );
    const activeFindMatchIndex = useMemo(
      () =>
        activeFindMatchId ? findMatches.findIndex((match) => match.id === activeFindMatchId) : -1,
      [activeFindMatchId, findMatches],
    );
    const findIndicator = useMemo(
      () => ({
        isActive: isFindOpen,
        markers: findMatches.map((match) => ({ id: match.id, itemId: match.itemId })),
        activeMarkerId: activeFindMatchId,
        onMarkerPress: setActiveFindMatchId,
      }),
      [activeFindMatchId, findMatches, isFindOpen],
    );

    const baseRenderModel = useMemo(() => {
      return buildAgentStreamRenderModel({
        agentStatus: agent.status,
        tail: effectiveStreamItems,
        head: effectiveStreamHead ?? EMPTY_STREAM_HEAD,
        platform: isWeb ? "web" : "native",
        isMobileBreakpoint: isMobile,
      });
    }, [agent.status, isMobile, effectiveStreamHead, effectiveStreamItems]);
    const streamLayout = useMemo(
      () =>
        layoutStream({
          strategy: streamRenderStrategy,
          agentStatus: agent.status,
          history: baseRenderModel.history,
          liveHead: baseRenderModel.segments.liveHead,
          timingByAssistantId: baseRenderModel.turnTiming.byAssistantId,
        }),
      [
        agent.status,
        baseRenderModel.history,
        baseRenderModel.segments.liveHead,
        baseRenderModel.turnTiming.byAssistantId,
        streamRenderStrategy,
      ],
    );
    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom(reason = "jump-to-bottom") {
          viewportRef.current?.scrollToBottom(reason);
        },
        prepareForViewportChange() {
          viewportRef.current?.prepareForViewportChange();
        },
        pauseBottomAnchoringForNextLayoutChange() {
          viewportRef.current?.pauseBottomAnchoringForNextLayoutChange();
        },
      }),
      [],
    );

    const scrollToBottom = useCallback(() => {
      viewportRef.current?.scrollToBottom("jump-to-bottom");
    }, []);
    const pauseBottomAnchoringForNextLayoutChange = useCallback(() => {
      viewportRef.current?.pauseBottomAnchoringForNextLayoutChange();
    }, []);

    useEffect(() => {
      activeFindMatchIdRef.current = activeFindMatchId;
    }, [activeFindMatchId]);

    const closeFind = useCallback(() => {
      setIsFindOpen(false);
      setFindQuery("");
      findMatchesRef.current = [];
      setFindMatches([]);
      setActiveFindMatchId(null);
      setIsFindScanning(false);
      setFindScannedRecordCount(0);
      setFindTotalRecordCount(0);
    }, []);

    const openFind = useCallback(() => {
      setIsFindOpen(true);
      const focusInput = () => findInputRef.current?.focus();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(focusInput);
      } else {
        setTimeout(focusInput, 0);
      }
    }, []);

    const moveFindMatch = useCallback(
      (delta: 1 | -1) => {
        setActiveFindMatchId((previous) => getNextFindMatchId(findMatches, previous, delta));
      },
      [findMatches],
    );

    const moveToNextFindMatch = useCallback(() => {
      moveFindMatch(1);
    }, [moveFindMatch]);

    const moveToPreviousFindMatch = useCallback(() => {
      moveFindMatch(-1);
    }, [moveFindMatch]);

    const handleFindKeyboardAction = useCallback(
      (action: KeyboardActionDefinition): boolean => {
        if (!isPaneFocused) {
          return false;
        }
        switch (action.id) {
          case "agent.find.open":
            openFind();
            return true;
          case "agent.find.next":
            if (!isFindOpen) return false;
            moveFindMatch(1);
            return true;
          case "agent.find.previous":
            if (!isFindOpen) return false;
            moveFindMatch(-1);
            return true;
          case "agent.find.close":
            if (!isFindOpen) return false;
            closeFind();
            return true;
          default:
            return false;
        }
      },
      [closeFind, isFindOpen, isPaneFocused, moveFindMatch, openFind],
    );

    useKeyboardActionHandler({
      handlerId: `agent-find:${agentId}`,
      actions: FIND_KEYBOARD_ACTIONS,
      enabled: isPaneFocused,
      priority: 80,
      isActive: () => isPaneFocused,
      handle: handleFindKeyboardAction,
    });

    useEffect(() => {
      if (!isFindOpen || findQuery.length === 0) {
        findMatchesRef.current = [];
        setFindMatches([]);
        setActiveFindMatchId(null);
        setIsFindScanning(false);
        setFindScannedRecordCount(0);
        setFindTotalRecordCount(findRecords.length);
        return;
      }

      preservedFindMatchIdRef.current = activeFindMatchIdRef.current;
      findMatchesRef.current = [];
      setFindMatches([]);
      setActiveFindMatchId(null);
      setIsFindScanning(true);
      setFindScannedRecordCount(0);
      setFindTotalRecordCount(findRecords.length);

      const job = startFindThreadJob({
        records: findRecords,
        query: findQuery,
        onProgress: (progress) => {
          setFindScannedRecordCount(progress.scannedRecordCount);
          setFindTotalRecordCount(progress.totalRecordCount);
          const nextMatches = [...findMatchesRef.current, ...progress.matches];
          findMatchesRef.current = nextMatches;
          setFindMatches(nextMatches);
          const preservedMatchId = preservedFindMatchIdRef.current;
          setActiveFindMatchId((currentMatchId) => {
            const nextActiveMatchId = resolveActiveFindMatchId({
              currentMatchId,
              preservedMatchId,
              matches: nextMatches,
            });
            if (nextActiveMatchId === preservedMatchId) {
              preservedFindMatchIdRef.current = null;
            }
            return nextActiveMatchId;
          });
        },
        onComplete: (complete) => {
          setFindScannedRecordCount(complete.scannedRecordCount);
          setFindTotalRecordCount(complete.totalRecordCount);
          setIsFindScanning(false);
        },
      });

      return () => {
        job.cancel();
      };
    }, [findQuery, findRecords, isFindOpen]);

    useEffect(() => {
      if (!activeFindMatch) {
        return () => {};
      }
      const thinkingGroup = thinkingGroupIndex.groupByItemId.get(activeFindMatch.itemId);
      if (thinkingGroup) {
        pauseBottomAnchoringForNextLayoutChange();
        setExpandedThinkingGroupIds((previous) => {
          if (previous.get(thinkingGroup.id) === true) {
            return previous;
          }
          const next = new Map(previous);
          next.set(thinkingGroup.id, true);
          return next;
        });
      }
      const timeout = setTimeout(
        () => {
          viewportRef.current?.scrollToStreamItemTop(activeFindMatch.itemId);
        },
        thinkingGroup ? 40 : 0,
      );
      return () => {
        clearTimeout(timeout);
      };
    }, [activeFindMatch, pauseBottomAnchoringForNextLayoutChange, thinkingGroupIndex]);

    const setInlineDetailsExpanded = useCallback(
      (itemId: string, expanded: boolean) => {
        if (!streamRenderStrategy.shouldDisableParentScrollOnInlineDetailsExpansion()) {
          return;
        }
        setExpandedInlineToolCallIds((previous) => {
          const next = new Set(previous);
          if (expanded) {
            next.add(itemId);
          } else {
            next.delete(itemId);
          }
          return next;
        });
      },
      [streamRenderStrategy],
    );

    const renderUserMessageItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "user_message" }>) => {
        return (
          <UserMessage
            serverId={resolvedServerId}
            agentId={agentId}
            messageId={item.id}
            message={item.text}
            images={item.images}
            attachments={item.attachments}
            timestamp={item.timestamp.getTime()}
            capabilities={agent.capabilities}
            client={client}
            isFirstInGroup={layoutItem.isFirstInUserGroup}
            isLastInGroup={layoutItem.isLastInUserGroup}
            findHighlightRanges={getFindHighlightRanges(findHighlights, item.id, FIND_PART_MESSAGE)}
          />
        );
      },
      [agent.capabilities, agentId, client, findHighlights, resolvedServerId],
    );

    const renderAssistantMessageItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "assistant_message" }>) => {
        return (
          <AssistantFileLinkResolverProvider
            client={client}
            serverId={resolvedServerId}
            workspaceRoot={workspaceRoot}
            onOpenWorkspaceFile={handleInlinePathPress}
            toast={toast}
          >
            <AssistantMessage
              message={item.text}
              timestamp={item.timestamp.getTime()}
              workspaceRoot={workspaceRoot}
              serverId={resolvedServerId}
              client={client}
              spacing={layoutItem.assistantSpacing}
              findHighlightRanges={getFindHighlightRanges(
                findHighlights,
                item.id,
                FIND_PART_MESSAGE,
              )}
            />
          </AssistantFileLinkResolverProvider>
        );
      },
      [client, findHighlights, handleInlinePathPress, resolvedServerId, toast, workspaceRoot],
    );

    const renderThoughtItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "thought" }>) => {
        return (
          <ToolCallSlot
            itemId={item.id}
            onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
            toolName="thinking"
            args={item.text}
            status={item.status === "ready" ? "completed" : "executing"}
            isLastInSequence={layoutItem.isLastInToolSequence}
            summaryFindHighlightRanges={getFindHighlightRanges(
              findHighlights,
              item.id,
              FIND_PART_MESSAGE,
            )}
          />
        );
      },
      [findHighlights, setInlineDetailsExpanded],
    );

    const renderToolCallItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "tool_call" }>) => {
        const { payload } = item;

        if (payload.source === "agent") {
          const data = payload.data;

          if (
            data.name === "speak" &&
            data.detail.type === "unknown" &&
            typeof data.detail.input === "string" &&
            data.detail.input.trim()
          ) {
            return (
              <SpeakMessage
                message={data.detail.input}
                timestamp={item.timestamp.getTime()}
                findHighlightRanges={getFindHighlightRanges(
                  findHighlights,
                  item.id,
                  FIND_PART_SPEAK_MESSAGE,
                )}
              />
            );
          }

          return (
            <ToolCallSlot
              itemId={item.id}
              onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
              toolName={data.name}
              error={data.error}
              status={data.status}
              detail={data.detail}
              cwd={agent.cwd}
              metadata={data.metadata}
              isLastInSequence={layoutItem.isLastInToolSequence}
              onOpenFilePath={handleToolCallOpenFile}
              labelFindHighlightRanges={getFindHighlightRanges(
                findHighlights,
                item.id,
                FIND_PART_TOOL_TITLE,
              )}
              summaryFindHighlightRanges={getFindHighlightRanges(
                findHighlights,
                item.id,
                FIND_PART_TOOL_SUMMARY,
              )}
            />
          );
        }

        const data = payload.data;
        return (
          <ToolCallSlot
            itemId={item.id}
            onInlineDetailsExpandedChangeByItemId={setInlineDetailsExpanded}
            toolName={data.toolName}
            args={data.arguments}
            result={data.result}
            status={data.status}
            isLastInSequence={layoutItem.isLastInToolSequence}
            onOpenFilePath={handleToolCallOpenFile}
            labelFindHighlightRanges={getFindHighlightRanges(
              findHighlights,
              item.id,
              FIND_PART_TOOL_TITLE,
            )}
            summaryFindHighlightRanges={getFindHighlightRanges(
              findHighlights,
              item.id,
              FIND_PART_TOOL_SUMMARY,
            )}
          />
        );
      },
      [agent.cwd, findHighlights, setInlineDetailsExpanded, handleToolCallOpenFile],
    );

    const renderStreamItemContent = useCallback(
      (layoutItem: StreamLayoutItem) => {
        const item = layoutItem.item;
        switch (item.kind) {
          case "user_message":
            return renderUserMessageItem(layoutItem, item);

          case "assistant_message":
            return renderAssistantMessageItem(layoutItem, item);

          case "thought":
            return renderThoughtItem(layoutItem, item);

          case "tool_call":
            return renderToolCallItem(layoutItem, item);

          case "activity_log":
            return (
              <ActivityLog
                type={item.activityType}
                message={item.message}
                timestamp={item.timestamp.getTime()}
                metadata={item.metadata}
              />
            );

          case "todo_list":
            return (
              <TodoListCard
                items={item.items}
                findHighlightRangesByIndex={getTodoFindHighlightRanges(findHighlights, item.id)}
              />
            );

          case "compaction":
            return (
              <CompactionMarker
                status={item.status}
                trigger={item.trigger}
                preTokens={item.preTokens}
              />
            );

          default:
            return null;
        }
      },
      [
        findHighlights,
        renderUserMessageItem,
        renderAssistantMessageItem,
        renderThoughtItem,
        renderToolCallItem,
      ],
    );

    const bottomTurnFooterHost = streamLayout.auxiliaryTurnFooter;

    const layoutItemById = useMemo(() => {
      const itemById = new Map<string, StreamLayoutItem>();
      for (const item of streamLayout.history) {
        itemById.set(item.item.id, item);
      }
      for (const item of streamLayout.liveHead) {
        itemById.set(item.item.id, item);
      }
      return itemById;
    }, [streamLayout.history, streamLayout.liveHead]);

    const renderStreamItem = useCallback(
      (layoutItem: StreamLayoutItem) => {
        const thinkingGroup = thinkingGroupIndex.groupByItemId.get(layoutItem.item.id);
        if (thinkingGroup) {
          if (thinkingGroup.anchorItemId !== layoutItem.item.id) {
            return null;
          }
          return (
            <ThinkingGroupRow
              group={thinkingGroup}
              layoutItemById={layoutItemById}
              expanded={expandedThinkingGroupIds.get(thinkingGroup.id)}
              onExpandedChange={setExpandedThinkingGroupIds}
              onExpandStart={pauseBottomAnchoringForNextLayoutChange}
              renderStreamItemContent={renderStreamItemContent}
            />
          );
        }

        const content = renderStreamItemContent(layoutItem);
        return renderStreamItemWithTurnFooter({
          content,
          layoutItem,
          strategy: streamRenderStrategy,
        });
      },
      [
        expandedThinkingGroupIds,
        layoutItemById,
        pauseBottomAnchoringForNextLayoutChange,
        renderStreamItemContent,
        streamRenderStrategy,
        thinkingGroupIndex,
      ],
    );

    const pendingPermissionItems = useMemo(
      () => Array.from(pendingPermissions.values()).filter((perm) => perm.agentId === agentId),
      [pendingPermissions, agentId],
    );

    const showRunningTurnFooter = agent.status === "running";
    const pendingPermissionsNode = useMemo(
      () =>
        renderPendingPermissionsNode({
          pendingPermissions: pendingPermissionItems,
          client,
        }),
      [client, pendingPermissionItems],
    );
    const turnFooterNode = useMemo(
      () =>
        showRunningTurnFooter || bottomTurnFooterHost ? (
          <TurnFooter
            isRunning={showRunningTurnFooter}
            inFlightTurnStartedAt={baseRenderModel.turnTiming.runningStartedAt}
            host={bottomTurnFooterHost}
            strategy={streamRenderStrategy}
          />
        ) : null,
      [
        showRunningTurnFooter,
        baseRenderModel.turnTiming.runningStartedAt,
        bottomTurnFooterHost,
        streamRenderStrategy,
      ],
    );
    const renderModel = useMemo<AgentStreamRenderModel>(() => {
      return {
        ...baseRenderModel,
        boundary: baseRenderModel.boundary,
        auxiliary: {
          pendingPermissions: pendingPermissionsNode,
          turnFooter: turnFooterNode,
        },
      };
    }, [baseRenderModel, pendingPermissionsNode, turnFooterNode]);

    const emptyStateStyle = useMemo(() => [stylesheet.emptyState, stylesheet.contentWrapper], []);
    const listEmptyComponent = useMemo(
      () =>
        renderListEmptyComponent({
          renderModel,
          emptyStateStyle,
          emptyText: t("agentStream.empty"),
        }),
      [renderModel, emptyStateStyle, t],
    );

    const { boundary, auxiliary } = renderModel;

    const layoutHistoryItemById = useMemo(() => {
      const itemById = new Map<string, StreamLayoutItem>();
      for (const item of streamLayout.history) {
        itemById.set(item.item.id, item);
      }
      return itemById;
    }, [streamLayout.history]);

    const layoutLiveHeadItemById = useMemo(() => {
      const itemById = new Map<string, StreamLayoutItem>();
      for (const item of streamLayout.liveHead) {
        itemById.set(item.item.id, item);
      }
      return itemById;
    }, [streamLayout.liveHead]);

    const renderHistoryRow = useCallback(
      (item: StreamItem) =>
        renderHistoryStreamItem({
          item,
          layoutItemById: layoutHistoryItemById,
          renderStreamItem,
        }),
      [layoutHistoryItemById, renderStreamItem],
    );

    const renderHistoryVirtualizedRow = useCallback<
      StreamSegmentRenderers["renderHistoryVirtualizedRow"]
    >((item) => renderHistoryRow(item), [renderHistoryRow]);
    const renderHistoryMountedRow = useCallback<StreamSegmentRenderers["renderHistoryMountedRow"]>(
      (item) => renderHistoryRow(item),
      [renderHistoryRow],
    );
    // useStableEvent keeps the function reference stable across flushes.
    // layoutLiveHeadItemById and renderStreamItem are read from the ref at call time,
    // so the live-head render always uses the latest layout without causing renderers
    // to be a new object on every text-chunk flush.
    const renderLiveHeadRow: StreamSegmentRenderers["renderLiveHeadRow"] = useStableEvent(
      (item: StreamItem) =>
        renderLiveHeadStreamItem({
          item,
          layoutItemById: layoutLiveHeadItemById,
          renderStreamItem,
        }),
    );
    const renderLiveAuxiliary = useCallback<StreamSegmentRenderers["renderLiveAuxiliary"]>(() => {
      return renderLiveAuxiliaryNode({
        pendingPermissions: auxiliary.pendingPermissions,
        turnFooter: auxiliary.turnFooter,
      });
    }, [auxiliary.pendingPermissions, auxiliary.turnFooter]);

    const renderers = useMemo<StreamSegmentRenderers>(
      () => ({
        renderHistoryVirtualizedRow,
        renderHistoryMountedRow,
        renderLiveHeadRow,
        renderLiveAuxiliary,
      }),
      [
        renderHistoryVirtualizedRow,
        renderHistoryMountedRow,
        renderLiveHeadRow,
        renderLiveAuxiliary,
      ],
    );

    const streamScrollEnabled =
      !streamRenderStrategy.shouldDisableParentScrollOnInlineDetailsExpansion() ||
      expandedInlineToolCallIds.size === 0;
    const findOverlay = (
      <FindInThreadControls
        isOpen={isFindOpen}
        query={findQuery}
        inputRef={findInputRef}
        includeThinking={findIncludesThinking}
        matchesCount={findMatches.length}
        activeMatchIndex={activeFindMatchIndex}
        isScanning={isFindScanning}
        scannedRecordCount={findScannedRecordCount}
        totalRecordCount={findTotalRecordCount}
        onOpen={openFind}
        onClose={closeFind}
        onNext={moveToNextFindMatch}
        onPrevious={moveToPreviousFindMatch}
        onQueryChange={setFindQuery}
        onIncludeThinkingChange={setFindIncludesThinking}
      />
    );

    return (
      <ToolCallSheetProvider>
        <View style={stylesheet.container}>
          <MessageOuterSpacingProvider disableOuterSpacing>
            {streamRenderStrategy.render({
              agentId,
              segments: renderModel.segments,
              boundary,
              renderers,
              listEmptyComponent,
              viewportRef,
              routeBottomAnchorRequest,
              isAuthoritativeHistoryReady,
              onNearBottomChange: setIsNearBottom,
              onNearHistoryStart: loadOlder,
              isLoadingOlderHistory: isLoadingOlder,
              hasOlderHistory: hasOlder,
              scrollEnabled: streamScrollEnabled,
              listStyle: stylesheet.list,
              baseListContentContainerStyle: stylesheet.listContentContainer,
              forwardListContentContainerStyle: stylesheet.forwardListContentContainer,
              findIndicator,
            })}
          </MessageOuterSpacingProvider>
          {findOverlay}
          {!isNearBottom && (
            <Animated.View
              style={stylesheet.scrollToBottomContainer}
              entering={scrollIndicatorFadeIn}
              exiting={scrollIndicatorFadeOut}
            >
              <View style={stylesheet.scrollToBottomInner}>
                <Pressable
                  style={stylesheet.scrollToBottomButton}
                  onPress={scrollToBottom}
                  accessibilityRole="button"
                  accessibilityLabel={t("agentStream.scrollToBottom")}
                  testID="scroll-to-bottom-button"
                >
                  <ChevronDown size={24} color={stylesheet.scrollToBottomIcon.color} />
                </Pressable>
              </View>
            </Animated.View>
          )}
        </View>
      </ToolCallSheetProvider>
    );
  },
);

function agentCapabilityFlagsEqual(
  left: AgentCapabilityFlags | undefined,
  right: AgentCapabilityFlags | undefined,
): boolean {
  return AGENT_CAPABILITY_FLAG_KEYS.every((key) => left?.[key] === right?.[key]);
}

function collectAgentScreenAgentDiffs(left: AgentScreenAgent, right: AgentScreenAgent): string[] {
  const reasons: string[] = [];
  if (left.serverId !== right.serverId) reasons.push("agent.serverId");
  if (left.id !== right.id) reasons.push("agent.id");
  if (left.status !== right.status) reasons.push("agent.status");
  if (left.cwd !== right.cwd) reasons.push("agent.cwd");
  if (!agentCapabilityFlagsEqual(left.capabilities, right.capabilities)) {
    reasons.push("agent.capabilities");
  }
  if (left.lastError !== right.lastError) reasons.push("agent.lastError");
  if (left.projectPlacement?.checkout?.cwd !== right.projectPlacement?.checkout?.cwd) {
    reasons.push("agent.projectPlacement.checkout.cwd");
  }
  if (left.projectPlacement?.checkout?.isGit !== right.projectPlacement?.checkout?.isGit) {
    reasons.push("agent.projectPlacement.checkout.isGit");
  }
  return reasons;
}

function bottomAnchorRouteRequestsEqual(
  left: BottomAnchorRouteRequest | null | undefined,
  right: BottomAnchorRouteRequest | null | undefined,
): boolean {
  return (
    left?.agentId === right?.agentId &&
    left?.reason === right?.reason &&
    left?.requestKey === right?.requestKey
  );
}

function agentStreamViewPropsEqual(
  left: AgentStreamViewProps,
  right: AgentStreamViewProps,
): boolean {
  const reasons: string[] = [];
  if (left.agentId !== right.agentId) reasons.push("agentId");
  if (left.serverId !== right.serverId) reasons.push("serverId");
  reasons.push(...collectAgentScreenAgentDiffs(left.agent, right.agent));
  if (left.streamItems !== right.streamItems) reasons.push("streamItems");
  if (left.pendingPermissions !== right.pendingPermissions) reasons.push("pendingPermissions");
  if (
    !bottomAnchorRouteRequestsEqual(left.routeBottomAnchorRequest, right.routeBottomAnchorRequest)
  ) {
    reasons.push("routeBottomAnchorRequest");
  }
  if (left.isAuthoritativeHistoryReady !== right.isAuthoritativeHistoryReady) {
    reasons.push("isAuthoritativeHistoryReady");
  }
  if (left.toast !== right.toast) reasons.push("toast");
  if (left.onOpenWorkspaceFile !== right.onOpenWorkspaceFile) reasons.push("onOpenWorkspaceFile");
  if (left.isPaneFocused !== right.isPaneFocused) reasons.push("isPaneFocused");
  recordRenderProfileReasons(`AgentStreamView:${right.agentId}`, reasons);
  return reasons.length === 0;
}

export const AgentStreamView = memo(AgentStreamViewComponent, agentStreamViewPropsEqual);
AgentStreamView.displayName = "AgentStreamView";

interface ToolCallSlotProps extends Omit<
  ComponentProps<typeof ToolCall>,
  "onInlineDetailsExpandedChange"
> {
  itemId: string;
  onInlineDetailsExpandedChangeByItemId: (itemId: string, expanded: boolean) => void;
}

function ToolCallSlot({
  itemId,
  onInlineDetailsExpandedChangeByItemId,
  ...rest
}: ToolCallSlotProps) {
  const handleExpandedChange = useCallback(
    (expanded: boolean) => onInlineDetailsExpandedChangeByItemId(itemId, expanded),
    [onInlineDetailsExpandedChangeByItemId, itemId],
  );
  return <ToolCall {...rest} onInlineDetailsExpandedChange={handleExpandedChange} />;
}

interface FindInThreadControlsProps {
  isOpen: boolean;
  query: string;
  inputRef: React.RefObject<TextInput | null>;
  includeThinking: boolean;
  matchesCount: number;
  activeMatchIndex: number;
  isScanning: boolean;
  scannedRecordCount: number;
  totalRecordCount: number;
  onOpen: () => void;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onQueryChange: (query: string) => void;
  onIncludeThinkingChange: (includeThinking: boolean) => void;
}

function FindInThreadControls({
  isOpen,
  query,
  inputRef,
  includeThinking,
  matchesCount,
  activeMatchIndex,
  isScanning,
  scannedRecordCount,
  totalRecordCount,
  onOpen,
  onClose,
  onNext,
  onPrevious,
  onQueryChange,
  onIncludeThinkingChange,
}: FindInThreadControlsProps) {
  const { t } = useTranslation();
  const currentMatchNumber = matchesCount > 0 && activeMatchIndex >= 0 ? activeMatchIndex + 1 : 0;
  const countLabel = t("agentStream.find.matchCount", {
    current: currentMatchNumber,
    total: matchesCount,
  });
  const scanningLabel =
    isScanning && query.length > 0
      ? t("agentStream.find.scanning", {
          current: scannedRecordCount,
          total: totalRecordCount,
        })
      : "";
  const accessibilityState = useMemo(() => ({ checked: includeThinking }), [includeThinking]);
  const checkboxStyle = useMemo(
    () => [findInThreadStyles.checkbox, includeThinking && findInThreadStyles.checkboxChecked],
    [includeThinking],
  );
  const handleIncludeThinkingPress = useCallback(() => {
    onIncludeThinkingChange(!includeThinking);
  }, [includeThinking, onIncludeThinkingChange]);

  if (!isOpen) {
    return (
      <View pointerEvents="box-none" style={findInThreadStyles.host}>
        <View style={findInThreadStyles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("agentStream.find.open")}
            onPress={onOpen}
            testID="find-in-thread-open"
            style={findInThreadStyles.openButton}
          >
            <Search size={16} color={findInThreadStyles.icon.color} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={findInThreadStyles.host}>
      <View style={findInThreadStyles.content}>
        <View testID="find-in-thread-root" style={findInThreadStyles.panel}>
          <Search size={16} color={findInThreadStyles.iconMuted.color} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onQueryChange}
            placeholder={t("agentStream.find.placeholder")}
            placeholderTextColor={findInThreadStyles.placeholder.color}
            style={findInThreadStyles.input}
            autoCapitalize="none"
            autoCorrect={false}
            selectTextOnFocus
            testID="find-in-thread-input"
            onSubmitEditing={onNext}
          />
          <FindIconButton
            accessibilityLabel={t("agentStream.find.previous")}
            onPress={onPrevious}
            disabled={matchesCount === 0}
          >
            <ChevronUp size={17} color={findInThreadStyles.icon.color} />
          </FindIconButton>
          <FindIconButton
            accessibilityLabel={t("agentStream.find.next")}
            onPress={onNext}
            disabled={matchesCount === 0}
          >
            <ChevronDown size={17} color={findInThreadStyles.icon.color} />
          </FindIconButton>
          <Text style={findInThreadStyles.countText} numberOfLines={1}>
            {countLabel}
          </Text>
          {scanningLabel ? (
            <Text style={findInThreadStyles.scanningText} numberOfLines={1}>
              {scanningLabel}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={accessibilityState}
            accessibilityLabel={t("agentStream.find.searchThinking")}
            onPress={handleIncludeThinkingPress}
            style={findInThreadStyles.checkboxRow}
            testID="find-in-thread-thinking"
          >
            <View style={checkboxStyle}>
              {includeThinking ? (
                <Check size={12} color={findInThreadStyles.checkboxIcon.color} />
              ) : null}
            </View>
            <Text style={findInThreadStyles.checkboxLabel}>
              {t("agentStream.find.searchThinking")}
            </Text>
          </Pressable>
          <FindIconButton accessibilityLabel={t("agentStream.find.close")} onPress={onClose}>
            <X size={17} color={findInThreadStyles.icon.color} />
          </FindIconButton>
        </View>
      </View>
    </View>
  );
}

function FindIconButton({
  accessibilityLabel,
  onPress,
  disabled = false,
  children,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const buttonStyle = useMemo(
    () => [findInThreadStyles.iconButton, disabled && findInThreadStyles.iconButtonDisabled],
    [disabled],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={buttonStyle}
      hitSlop={4}
    >
      {children}
    </Pressable>
  );
}

interface ThinkingGroupRowProps {
  group: ThinkingGroup;
  layoutItemById: Map<string, StreamLayoutItem>;
  expanded: boolean | undefined;
  onExpandedChange: (updater: (previous: Map<string, boolean>) => Map<string, boolean>) => void;
  onExpandStart: () => void;
  renderStreamItemContent: (layoutItem: StreamLayoutItem) => ReactNode;
}

function ThinkingGroupRow({
  group,
  layoutItemById,
  expanded,
  onExpandedChange,
  onExpandStart,
  renderStreamItemContent,
}: ThinkingGroupRowProps) {
  const groupLayouts = useMemo(() => {
    const layouts: StreamLayoutItem[] = [];
    for (const itemId of group.itemIds) {
      const layoutItem = layoutItemById.get(itemId);
      if (layoutItem) {
        layouts.push(layoutItem);
      }
    }
    return layouts;
  }, [group.itemIds, layoutItemById]);

  const lastLayout = groupLayouts.at(-1);
  const gapBelow = lastLayout?.gapBelow ?? 0;
  const isExpanded = expanded ?? group.defaultExpanded;
  const groupItems = useMemo(
    () => groupLayouts.map((layoutItem) => layoutItem.item),
    [groupLayouts],
  );
  const counts = useMemo(() => getThinkingGroupCounts(groupItems), [groupItems]);
  const previewMessages = useMemo(() => getThinkingGroupPreviewMessages(groupItems), [groupItems]);
  const showPreview = shouldShowThinkingGroupPreview({
    expanded: isExpanded,
    groupStatus: group.status,
    messageCount: counts.messageCount,
  });

  const handleExpandedChange = useCallback(
    (nextExpanded: boolean) => {
      onExpandedChange((previous) => {
        const next = new Map(previous);
        next.set(group.id, nextExpanded);
        return next;
      });
    },
    [group.id, onExpandedChange],
  );

  if (groupLayouts.length === 0) {
    return null;
  }

  return (
    <StreamItemWrapper gapBelow={gapBelow}>
      <CollapsibleThinkingGroup
        counts={counts}
        expanded={isExpanded}
        groupStatus={group.status}
        onExpandStart={onExpandStart}
        onExpandedChange={handleExpandedChange}
        previewMessages={previewMessages}
        showPreview={showPreview}
      >
        {groupLayouts.map((layoutItem, index) => {
          return (
            <ThinkingGroupContentItem
              key={layoutItem.item.id}
              layoutItem={layoutItem}
              isLast={index === groupLayouts.length - 1}
              renderStreamItemContent={renderStreamItemContent}
            />
          );
        })}
      </CollapsibleThinkingGroup>
    </StreamItemWrapper>
  );
}

function ThinkingGroupContentItem({
  layoutItem,
  isLast,
  renderStreamItemContent,
}: {
  layoutItem: StreamLayoutItem;
  isLast: boolean;
  renderStreamItemContent: (layoutItem: StreamLayoutItem) => ReactNode;
}) {
  const content = renderStreamItemContent(layoutItem);
  const itemStyle = useMemo(
    () => (isLast ? undefined : { marginBottom: layoutItem.gapBelow }),
    [isLast, layoutItem.gapBelow],
  );
  if (!content) {
    return null;
  }
  return <View style={itemStyle}>{content}</View>;
}

function CollapsibleThinkingGroup({
  counts,
  expanded,
  groupStatus,
  onExpandStart,
  onExpandedChange,
  previewMessages,
  showPreview,
  children,
}: {
  counts: ReturnType<typeof getThinkingGroupCounts>;
  expanded: boolean;
  groupStatus: ThinkingGroup["status"];
  onExpandStart: () => void;
  onExpandedChange: (expanded: boolean) => void;
  previewMessages: ThinkingGroupPreviewMessage[];
  showPreview: boolean;
  children: ReactNode;
}) {
  const handlePress = useCallback(() => {
    if (!expanded) {
      onExpandStart();
    }
    onExpandedChange(!expanded);
  }, [expanded, onExpandStart, onExpandedChange]);
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);
  const Icon = expanded ? ChevronDown : ChevronRight;

  return (
    <View style={thinkingGroupStyles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        onPress={handlePress}
        style={thinkingGroupStyles.header}
      >
        <Icon size={14} color={thinkingGroupStyles.chevron.color} />
        <ThinkingGroupHeaderTitle groupStatus={groupStatus} style={thinkingGroupStyles.title} />
        <ThinkingGroupHeaderCounts counts={counts} />
      </Pressable>
      {expanded ? <View style={thinkingGroupStyles.content}>{children}</View> : null}
      {showPreview ? <ThinkingGroupPreview messages={previewMessages} /> : null}
    </View>
  );
}

function ThinkingGroupHeaderTitle({
  groupStatus,
  style,
}: {
  groupStatus: ThinkingGroup["status"];
  style: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  const isActive = groupStatus === "active";
  const pulseProgress = useSharedValue(0);
  const pulseStyle = useAnimatedStyle(() => {
    return {
      opacity: 0.28 + pulseProgress.value * 0.72,
    };
  });
  const titleBaseStyle = useMemo(
    () => (isActive ? [style, thinkingGroupStyles.titlePulsingBase] : style),
    [isActive, style],
  );
  const titlePulseOverlayStyle = useMemo(
    () => [thinkingGroupStaticStyles.titlePulseOverlay, pulseStyle],
    [pulseStyle],
  );
  const titlePulseTextStyle = useMemo(() => [style, thinkingGroupStyles.titlePulseText], [style]);

  useEffect(() => {
    if (!isActive) {
      cancelAnimation(pulseProgress);
      pulseProgress.value = 0;
      return;
    }
    pulseProgress.value = 0;
    pulseProgress.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulseProgress);
    };
  }, [pulseProgress, isActive]);

  return (
    <View style={thinkingGroupStyles.titleContainer}>
      <Text numberOfLines={1} style={titleBaseStyle}>
        {t("agentStream.thinking.label")}
      </Text>
      {isActive ? (
        <Animated.View pointerEvents="none" style={titlePulseOverlayStyle}>
          <Text numberOfLines={1} style={titlePulseTextStyle}>
            {t("agentStream.thinking.label")}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function ThinkingGroupHeaderCounts({
  counts,
}: {
  counts: ReturnType<typeof getThinkingGroupCounts>;
}) {
  const { t } = useTranslation();
  return (
    <View style={thinkingGroupStyles.counts}>
      {counts.messageCount > 0 ? (
        <View
          accessibilityLabel={t("agentStream.thinking.messageCount", {
            count: counts.messageCount,
          })}
          style={thinkingGroupStyles.countPill}
        >
          <MessageSquareText size={13} color={thinkingGroupStyles.countIcon.color} />
          <Text style={thinkingGroupStyles.countText}>{counts.messageCount}</Text>
        </View>
      ) : null}
      {counts.toolCallCount > 0 ? (
        <View
          accessibilityLabel={t("agentStream.thinking.toolCallCount", {
            count: counts.toolCallCount,
          })}
          style={thinkingGroupStyles.countPill}
        >
          <Wrench size={13} color={thinkingGroupStyles.countIcon.color} />
          <Text style={thinkingGroupStyles.countText}>{counts.toolCallCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ThinkingGroupPreview({ messages }: { messages: ThinkingGroupPreviewMessage[] }) {
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const currentScrollYRef = useRef(0);
  const isPinnedToBottomRef = useRef(true);

  const updatePinnedToBottom = useCallback(
    (scrollY: number, contentHeight: number, viewportHeight: number) => {
      const maxScrollY = Math.max(0, contentHeight - viewportHeight);
      currentScrollYRef.current = scrollY;
      isPinnedToBottomRef.current = maxScrollY - scrollY <= THINKING_GROUP_PREVIEW_BOTTOM_EPSILON;
    },
    [],
  );

  const scrollPreviewToBottom = useCallback((animated: boolean) => {
    const targetY = Math.max(0, contentHeightRef.current - viewportHeightRef.current);
    currentScrollYRef.current = targetY;
    isPinnedToBottomRef.current = true;
    scrollRef.current?.scrollTo({ y: targetY, animated });
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      updatePinnedToBottom(
        Math.max(0, contentOffset.y),
        Math.max(0, contentSize.height),
        Math.max(0, layoutMeasurement.height),
      );
    },
    [updatePinnedToBottom],
  );

  const handlePreviewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const viewportHeight = Math.max(0, event.nativeEvent.layout.height);
      viewportHeightRef.current = viewportHeight;
      if (isPinnedToBottomRef.current) {
        scrollPreviewToBottom(false);
        return;
      }
      updatePinnedToBottom(currentScrollYRef.current, contentHeightRef.current, viewportHeight);
    },
    [scrollPreviewToBottom, updatePinnedToBottom],
  );

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = Math.max(0, height);
      if (isPinnedToBottomRef.current) {
        scrollPreviewToBottom(false);
        return;
      }
      updatePinnedToBottom(
        currentScrollYRef.current,
        contentHeightRef.current,
        viewportHeightRef.current,
      );
    },
    [scrollPreviewToBottom, updatePinnedToBottom],
  );

  useEffect(() => {
    if (messages.length === 0) {
      currentScrollYRef.current = 0;
      isPinnedToBottomRef.current = true;
    }
  }, [messages.length]);

  return (
    <View style={thinkingGroupStyles.preview}>
      <ScrollView
        ref={scrollRef}
        onLayout={handlePreviewLayout}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        style={thinkingGroupStyles.previewScroll}
        contentContainerStyle={thinkingGroupStaticStyles.previewContent}
      >
        {messages.map((message) => (
          <ThinkingGroupPreviewMessageRow key={message.id} message={message} />
        ))}
      </ScrollView>
      <PreviewFade edge="top" />
      <PreviewFade edge="bottom" />
    </View>
  );
}

function ThinkingGroupPreviewMessageRow({ message }: { message: ThinkingGroupPreviewMessage }) {
  return (
    <View style={thinkingGroupStyles.previewMessage}>
      <Text style={thinkingGroupStyles.previewText}>{message.text}</Text>
    </View>
  );
}

function PreviewFade({ edge }: { edge: "top" | "bottom" }) {
  const isTop = edge === "top";
  const containerStyle = useMemo(
    () => [
      thinkingGroupStyles.previewFade,
      isTop ? thinkingGroupStyles.previewFadeTop : thinkingGroupStyles.previewFadeBottom,
    ],
    [isTop],
  );
  const fadeBands = useMemo(
    () =>
      isTop
        ? [
            {
              key: "strong",
              style: [thinkingGroupStyles.previewFadeBand, thinkingGroupStyles.previewFadeStrong],
            },
            {
              key: "medium",
              style: [thinkingGroupStyles.previewFadeBand, thinkingGroupStyles.previewFadeMedium],
            },
            {
              key: "weak",
              style: [thinkingGroupStyles.previewFadeBand, thinkingGroupStyles.previewFadeWeak],
            },
          ]
        : [
            {
              key: "weak",
              style: [thinkingGroupStyles.previewFadeBand, thinkingGroupStyles.previewFadeWeak],
            },
            {
              key: "medium",
              style: [thinkingGroupStyles.previewFadeBand, thinkingGroupStyles.previewFadeMedium],
            },
            {
              key: "strong",
              style: [thinkingGroupStyles.previewFadeBand, thinkingGroupStyles.previewFadeStrong],
            },
          ],
    [isTop],
  );
  return (
    <View pointerEvents="none" style={containerStyle}>
      {fadeBands.map((fadeBand) => (
        <View key={`${edge}-${fadeBand.key}`} style={fadeBand.style} />
      ))}
    </View>
  );
}

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedCheckIcon = withUnistyles(Check);
const ThemedXIcon = withUnistyles(X);

const primaryColorMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
});
const mutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const pressableStyle = ({
  pressed,
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) => [
  permissionStyles.optionButton,
  hovered ? permissionStyles.optionButtonHovered : null,
  pressed ? permissionStyles.optionButtonPressed : null,
];

interface PermissionActionButtonProps {
  action: AgentPermissionAction;
  isRespondingAction: boolean;
  isResponding: boolean;
  isPrimary: boolean;
  Icon: typeof ThemedCheckIcon;
  testID: string;
  onPress: (action: AgentPermissionAction) => void;
}

function PermissionActionButton({
  action,
  isRespondingAction,
  isResponding,
  isPrimary,
  Icon,
  testID,
  onPress,
}: PermissionActionButtonProps) {
  const handlePress = useCallback(() => onPress(action), [onPress, action]);
  const optionTextStyle = isPrimary ? optionTextPrimaryStyle : permissionStyles.optionText;
  const colorMapping = isPrimary ? primaryColorMapping : mutedColorMapping;
  return (
    <Pressable testID={testID} style={pressableStyle} onPress={handlePress} disabled={isResponding}>
      {isRespondingAction ? (
        <ThemedActivityIndicator size="small" uniProps={colorMapping} />
      ) : (
        <View style={permissionStyles.optionContent}>
          <Icon size={14} uniProps={colorMapping} />
          <Text style={optionTextStyle}>{action.label}</Text>
        </View>
      )}
    </Pressable>
  );
}

function PermissionRequestCard({
  permission,
  client,
}: {
  permission: PendingPermission;
  client: DaemonClient | null;
}) {
  const { t } = useTranslation();
  const isMobile = useIsCompactFormFactor();

  const { request } = permission;
  const isPlanRequest = request.kind === "plan";
  const title = isPlanRequest
    ? t("agentStream.permission.plan")
    : (request.title ?? request.name ?? t("agentStream.permission.required"));
  const description = request.description ?? "";
  const resolvedToolCallDetail = useMemo(
    () =>
      request.detail ?? {
        type: "unknown" as const,
        input: request.input ?? null,
        output: null,
      },
    [request.detail, request.input],
  );
  const resolvedActions = useMemo((): AgentPermissionAction[] => {
    if (request.kind === "question") {
      return [];
    }
    if (Array.isArray(request.actions) && request.actions.length > 0) {
      return request.actions;
    }
    return [
      {
        id: "reject",
        label: t("agentStream.permission.deny"),
        behavior: "deny",
        variant: "danger",
        intent: "dismiss",
      },
      {
        id: "accept",
        label: isPlanRequest
          ? t("agentStream.permission.implement")
          : t("agentStream.permission.accept"),
        behavior: "allow",
        variant: "primary",
      },
    ];
  }, [isPlanRequest, request, t]);

  const planMarkdown = useMemo(() => {
    if (!request) {
      return undefined;
    }
    const planFromMetadata =
      typeof request.metadata?.planText === "string" ? request.metadata.planText : undefined;
    if (planFromMetadata) {
      return planFromMetadata;
    }
    const candidate = request.input?.["plan"];
    if (typeof candidate === "string") {
      return candidate;
    }
    return undefined;
  }, [request]);

  const permissionMutation = useMutation({
    mutationFn: async (input: {
      agentId: string;
      requestId: string;
      response: AgentPermissionResponse;
    }) => {
      if (!client) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      return client.respondToPermissionAndWait(
        input.agentId,
        input.requestId,
        input.response,
        15000,
      );
    },
  });
  const {
    reset: resetPermissionMutation,
    mutateAsync: respondToPermission,
    isPending: isResponding,
  } = permissionMutation;

  const [respondingActionId, setRespondingActionId] = useState<string | null>(null);

  useEffect(() => {
    resetPermissionMutation();
    setRespondingActionId(null);
  }, [permission.request.id, resetPermissionMutation]);
  const handleResponse = useCallback(
    (response: AgentPermissionResponse) => {
      respondToPermission({
        agentId: permission.agentId,
        requestId: permission.request.id,
        response,
      }).catch((error) => {
        console.error("[PermissionRequestCard] Failed to respond to permission:", error);
      });
    },
    [permission.agentId, permission.request.id, respondToPermission],
  );
  const handleActionPress = useCallback(
    (action: AgentPermissionAction) => {
      setRespondingActionId(action.id);
      if (action.behavior === "allow") {
        handleResponse({
          behavior: "allow",
          selectedActionId: action.id,
        });
        return;
      }
      handleResponse({
        behavior: "deny",
        selectedActionId: action.id,
        message: "Denied by user",
      });
    },
    [handleResponse],
  );

  const optionsContainerStyle = useMemo(
    () => [
      permissionStyles.optionsContainer,
      !isMobile && permissionStyles.optionsContainerDesktop,
    ],
    [isMobile],
  );

  if (request.kind === "question") {
    return (
      <QuestionFormCard
        permission={permission}
        onRespond={handleResponse}
        isResponding={isResponding}
      />
    );
  }

  const footer = (
    <>
      <Text testID="permission-request-question" style={permissionStyles.question}>
        {t("agentStream.permission.question")}
      </Text>

      <View style={optionsContainerStyle}>
        {resolvedActions.map((action) => {
          const isPrimary = action.variant === "primary";
          const isRespondingAction = respondingActionId === action.id;
          const Icon = action.behavior === "allow" ? ThemedCheckIcon : ThemedXIcon;
          let testID: string;
          if (action.behavior === "deny") testID = "permission-request-deny";
          else if (action.id === "accept" || action.id === "implement")
            testID = "permission-request-accept";
          else testID = `permission-request-action-${action.id}`;

          return (
            <PermissionActionButton
              key={action.id}
              action={action}
              isRespondingAction={isRespondingAction}
              isResponding={isResponding}
              isPrimary={isPrimary}
              Icon={Icon}
              testID={testID}
              onPress={handleActionPress}
            />
          );
        })}
      </View>
    </>
  );

  if (isPlanRequest && planMarkdown) {
    return (
      <PlanCard
        title={title}
        description={description}
        text={planMarkdown}
        footer={footer}
        testID="permission-plan-card"
        disableOuterSpacing
      />
    );
  }

  return (
    <View style={permissionStyles.container}>
      <Text style={permissionStyles.title}>{title}</Text>

      {description ? <Text style={permissionStyles.description}>{description}</Text> : null}

      {planMarkdown ? (
        <PlanCard
          title={t("agentStream.permission.proposedPlan")}
          text={planMarkdown}
          testID="permission-plan-card"
          disableOuterSpacing
        />
      ) : null}

      {!isPlanRequest ? (
        <ToolCallDetailsContent detail={resolvedToolCallDetail} maxHeight={200} />
      ) : null}

      {footer}
    </View>
  );
}

const stylesheet = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  contentWrapper: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
  },
  listContentContainer: {
    paddingVertical: 0,
    flexGrow: 1,
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
  },
  forwardListContentContainer: {
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  list: {
    flex: 1,
  },
  streamItemWrapper: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[12],
  },
  permissionsContainer: {
    gap: theme.spacing[2],
  },
  listHeaderContent: {
    gap: theme.spacing[3],
  },
  syncingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[2],
  },
  syncingIndicatorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  invertedWrapper: {
    transform: [{ scaleY: -1 }],
    width: "100%",
  },
  emptyStateText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  scrollToBottomContainer: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "box-none",
  },
  scrollToBottomInner: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    alignItems: "center",
  },
  scrollToBottomButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.sm,
  },
  scrollToBottomIcon: {
    color: theme.colors.foreground,
  },
}));

const findInThreadStyles = StyleSheet.create((theme) => ({
  host: {
    position: "absolute",
    top: theme.spacing[3],
    left: 0,
    right: 0,
    zIndex: 5,
    pointerEvents: "box-none",
  },
  content: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[4],
    alignItems: "flex-end",
    pointerEvents: "box-none",
  },
  panel: {
    minHeight: 42,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    ...theme.shadow.sm,
  },
  openButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    ...theme.shadow.sm,
  },
  input: {
    width: {
      xs: 128,
      sm: 180,
      md: 220,
    },
    height: 32,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 0,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  placeholder: {
    color: theme.colors.foregroundMuted,
  },
  icon: {
    color: theme.colors.foreground,
  },
  iconMuted: {
    color: theme.colors.foregroundMuted,
  },
  iconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  iconButtonDisabled: {
    opacity: 0.35,
  },
  countText: {
    minWidth: 54,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  scanningText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  checkboxRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.sm,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface0,
  },
  checkboxChecked: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  checkboxIcon: {
    color: theme.colors.accentForeground,
  },
  checkboxLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));

const permissionStyles = StyleSheet.create((theme) => ({
  container: {
    marginVertical: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.spacing[2],
    borderWidth: 1,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
  },
  title: {
    fontSize: theme.fontSize.base,
    lineHeight: 22,
    color: theme.colors.foreground,
  },
  description: {
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    color: theme.colors.foregroundMuted,
  },
  section: {
    gap: theme.spacing[2],
  },
  sectionTitle: {
    fontSize: theme.fontSize.xs,
  },
  question: {
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[1],
    color: theme.colors.foregroundMuted,
  },
  optionsContainer: {
    gap: theme.spacing[2],
  },
  optionsContainerDesktop: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
  },
  optionButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    borderWidth: theme.borderWidth[1],
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.borderAccent,
  },
  optionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  optionButtonPressed: {
    opacity: 0.9,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  optionText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  optionTextPrimary: {
    color: theme.colors.foreground,
  },
}));

const optionTextPrimaryStyle = [permissionStyles.optionText, permissionStyles.optionTextPrimary];

const thinkingGroupStyles = StyleSheet.create((theme) => ({
  container: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  header: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  chevron: {
    color: theme.colors.foregroundMuted,
  },
  title: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  titlePulsingBase: {
    color: theme.colors.foregroundMuted,
  },
  titlePulseText: {
    color: theme.colors.foreground,
  },
  titleContainer: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    position: "relative",
  },
  counts: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    marginLeft: "auto",
  },
  countPill: {
    minWidth: 34,
    height: 22,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
  },
  countIcon: {
    color: theme.colors.foregroundMuted,
  },
  countText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    fontVariant: ["tabular-nums"],
  },
  content: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    padding: theme.spacing[3],
  },
  preview: {
    height: 168,
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    position: "relative",
    overflow: "hidden",
  },
  previewScroll: {
    flex: 1,
  },
  previewMessage: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  previewText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  previewFade: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 16,
    flexDirection: "column",
  },
  previewFadeTop: {
    top: 0,
  },
  previewFadeBottom: {
    bottom: 0,
  },
  previewFadeBand: {
    flex: 1,
    backgroundColor: theme.colors.surface1,
  },
  previewFadeStrong: {
    opacity: 0.92,
  },
  previewFadeMedium: {
    opacity: 0.58,
  },
  previewFadeWeak: {
    opacity: 0.24,
  },
}));

const thinkingGroupStaticStyles = RNStyleSheet.create({
  titlePulseOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  previewContent: {
    paddingVertical: 10,
  },
});

interface StreamItemWrapperProps {
  gapBelow: number;
  children: ReactNode;
}

function StreamItemWrapper({ gapBelow, children }: StreamItemWrapperProps) {
  const wrapperStyle = useMemo(
    () => [stylesheet.streamItemWrapper, { marginBottom: gapBelow }],
    [gapBelow],
  );
  return <View style={wrapperStyle}>{children}</View>;
}
