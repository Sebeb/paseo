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
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { MAX_CONTENT_WIDTH, useIsCompactFormFactor } from "@/constants/layout";
import { useMutation, useQuery } from "@tanstack/react-query";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
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
  PinnedUserMessage,
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
import {
  useSessionStore,
  type AgentTimelineCursorState,
  type AgentTimelinePromptIndex,
} from "@/stores/session-store";
import { useFileExplorerActions } from "@/hooks/use-file-explorer-actions";
import { useLoadOlderAgentHistory } from "@/hooks/use-load-older-agent-history";
import type { ToastApi } from "@/components/toast-host";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { ToolCallDetailsContent } from "@/components/tool-call-details";
import { QuestionFormCard } from "@/components/question-form-card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
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
import { getCollapsedThinkingGroupSpacing } from "./spacing";
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
import { formatDuration } from "@/utils/time";
import type { TurnTiming } from "@/timeline/turn-time";
import type { PinnedUserInputState } from "./pinned-user-input";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import {
  getMessageTableLayoutMetrics,
  MessageLayoutProvider,
  type MessageLayoutMetrics,
} from "@/components/message-layout-context";
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
import { agentBranchGroupsQueryKey } from "@/components/branching/query-keys";
import {
  branchNavigationKey,
  useBranchNavigationStore,
} from "@/components/branching/navigation-store";
import type { MessageBranchInfo } from "@/components/branching/branch-counter";
import type { AgentBranchGroupMember } from "@getpaseo/protocol/agent-types";

const FIND_KEYBOARD_ACTIONS = [
  "agent.find.open",
  "agent.find.next",
  "agent.find.previous",
  "agent.find.close",
] as const;

const PINNED_USER_INPUT_TOP_PADDING = 15;
const PINNED_USER_INPUT_MAX_HEIGHT_DEFAULT = 118;
const PINNED_USER_INPUT_MAX_HEIGHT_COMPACT = 59;
const PINNED_USER_INPUT_GRADIENT_HEIGHT = 15;
const STREAM_LAYOUT_EPSILON = 0.5;

const StreamLayoutReporterContext = React.createContext<
  ((input: { breakoutOffset: number; contentWidth: number }) => void) | null
>(null);

type SessionStoreSnapshot = ReturnType<typeof useSessionStore.getState>;

function selectSessionClient(state: SessionStoreSnapshot, serverId: string): DaemonClient | null {
  return state.sessions[serverId]?.client ?? null;
}

function selectServerSupportsPromptIndex(state: SessionStoreSnapshot, serverId: string): boolean {
  return state.sessions[serverId]?.serverInfo?.features?.timelinePromptIndex === true;
}

function selectAgentStreamHead(
  state: SessionStoreSnapshot,
  serverId: string,
  agentId: string,
): StreamItem[] | undefined {
  return state.sessions[serverId]?.agentStreamHead?.get(agentId);
}

function selectAgentTimelinePromptIndex(
  state: SessionStoreSnapshot,
  serverId: string,
  agentId: string,
): AgentTimelinePromptIndex | null {
  return state.sessions[serverId]?.agentTimelinePromptIndex.get(agentId) ?? null;
}

function selectAgentTimelineCursor(
  state: SessionStoreSnapshot,
  serverId: string,
  agentId: string,
): AgentTimelineCursorState | null {
  return state.sessions[serverId]?.agentTimelineCursor.get(agentId) ?? null;
}

function getPinnedUserInputOverlayHeight(maxContentHeight: number): number {
  return PINNED_USER_INPUT_TOP_PADDING + maxContentHeight + PINNED_USER_INPUT_GRADIENT_HEIGHT;
}

function getPinnedUserInputMaxHeight(isCompact: boolean): number {
  return isCompact ? PINNED_USER_INPUT_MAX_HEIGHT_COMPACT : PINNED_USER_INPUT_MAX_HEIGHT_DEFAULT;
}

function getAgentWorkspaceRoot(agent: AgentScreenAgent): string {
  return agent.cwd?.trim() || "";
}

function useAgentBranchGroupsQuery(input: {
  client: DaemonClient | null;
  resolvedServerId: string;
  agentId: string;
  supportsAgentBranching: boolean;
  membershipCount: number;
}) {
  const { agentId, client, membershipCount, resolvedServerId, supportsAgentBranching } = input;
  return useQuery({
    queryKey: agentBranchGroupsQueryKey(resolvedServerId, agentId),
    queryFn: async () => {
      if (!client) {
        return [];
      }
      const response = await client.fetchAgentBranchGroups(agentId);
      return response.groups;
    },
    enabled: Boolean(client) && supportsAgentBranching && membershipCount > 0,
    staleTime: 5_000,
  });
}

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

function PinnedUserInputOverlay({
  accessibilityLabel,
  backdropStyle,
  item,
  overlayHeight,
  translateY,
  onContentLayout,
  onPress,
}: {
  accessibilityLabel: string;
  backdropStyle: StyleProp<ViewStyle>;
  item: Extract<StreamItem, { kind: "user_message" }> | null;
  overlayHeight: number;
  translateY: SharedValue<number>;
  onContentLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const overlayStyle = useMemo(
    () => [
      stylesheet.pinnedUserInputOverlay,
      inlineUnistylesStyle({ height: overlayHeight }),
      animatedStyle,
    ],
    [animatedStyle, overlayHeight],
  );

  if (!item) {
    return null;
  }

  return (
    <Animated.View pointerEvents="box-none" style={overlayStyle}>
      <View pointerEvents="none" style={backdropStyle} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        testID="pinned-user-input-button"
        style={stylesheet.pinnedUserInputPressable}
      >
        <View onLayout={onContentLayout}>
          <StreamItemWrapper gapBelow={0}>
            <PinnedUserMessage
              message={item.text}
              images={item.images}
              attachments={item.attachments}
            />
          </StreamItemWrapper>
        </View>
      </Pressable>
    </Animated.View>
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

function setPromptIndexForAgent(input: {
  previous: Map<string, AgentTimelinePromptIndex>;
  agentId: string;
  payload: AgentTimelinePromptIndex;
}): Map<string, AgentTimelinePromptIndex> {
  const current = input.previous.get(input.agentId);
  if (
    current &&
    current.epoch === input.payload.epoch &&
    current.rows.length === input.payload.rows.length &&
    current.window.minSeq === input.payload.window.minSeq &&
    current.window.maxSeq === input.payload.window.maxSeq
  ) {
    return input.previous;
  }
  const next = new Map(input.previous);
  next.set(input.agentId, input.payload);
  return next;
}

type SetAgentTimelinePromptIndex = (
  serverId: string,
  state:
    | Map<string, AgentTimelinePromptIndex>
    | ((prev: Map<string, AgentTimelinePromptIndex>) => Map<string, AgentTimelinePromptIndex>),
) => void;

function useClearPinnedUserInputWhenDisabled(input: {
  pinUserInputsEnabled: boolean;
  setPinnedUserInput: (value: PinnedUserInputState | null) => void;
}) {
  const { pinUserInputsEnabled, setPinnedUserInput } = input;
  useEffect(() => {
    if (!pinUserInputsEnabled) {
      setPinnedUserInput(null);
    }
  }, [pinUserInputsEnabled, setPinnedUserInput]);
}

function useAgentTimelinePromptIndexLoader(input: {
  agentId: string;
  client: DaemonClient | null;
  promptIndex: AgentTimelinePromptIndex | null;
  resolvedServerId: string;
  serverSupportsPromptIndex: boolean;
  setAgentTimelinePromptIndex: SetAgentTimelinePromptIndex;
}) {
  const {
    agentId,
    client,
    promptIndex,
    resolvedServerId,
    serverSupportsPromptIndex,
    setAgentTimelinePromptIndex,
  } = input;
  useEffect(() => {
    if (!serverSupportsPromptIndex || !client || promptIndex) {
      return;
    }
    const promptIndexClient = client;
    let canceled = false;
    async function loadPromptIndex() {
      try {
        const payload = await promptIndexClient.fetchAgentTimelinePromptIndex(agentId);
        if (canceled) {
          return;
        }
        setAgentTimelinePromptIndex(resolvedServerId, (previous) =>
          setPromptIndexForAgent({
            previous,
            agentId,
            payload,
          }),
        );
      } catch (error) {
        console.warn("[AgentStream] Failed to load timeline prompt index", agentId, error);
      }
    }
    void loadPromptIndex();
    return () => {
      canceled = true;
    };
  }, [
    agentId,
    client,
    promptIndex,
    resolvedServerId,
    serverSupportsPromptIndex,
    setAgentTimelinePromptIndex,
  ]);
}

function useFindKeyboardActions(input: {
  agentId: string;
  isPaneFocused: boolean;
  isFindOpen: boolean;
  openFind: () => void;
  closeFind: () => void;
  moveFindMatch: (delta: 1 | -1) => void;
}) {
  const { agentId, isPaneFocused, isFindOpen, openFind, closeFind, moveFindMatch } = input;
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
}

function useAgentStreamInlinePathPress(input: {
  agent: AgentScreenAgent;
  isMobile: boolean;
  onOpenWorkspaceFile?: (request: WorkspaceFileOpenRequest) => void;
  resolvedServerId: string;
  workspaceRoot: string;
}) {
  const { agent, isMobile, onOpenWorkspaceFile, resolvedServerId, workspaceRoot } = input;
  const openFileExplorerForCheckout = usePanelStore((state) => state.openFileExplorerForCheckout);
  const setExplorerTabForCheckout = usePanelStore((state) => state.setExplorerTabForCheckout);
  const { requestDirectoryListing } = useFileExplorerActions({
    serverId: resolvedServerId,
    workspaceId: agent.workspaceId,
    workspaceRoot,
  });

  return useStableEvent((target: InlinePathTarget, disposition: OpenFileDisposition) => {
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
  });
}

function useEffectiveStreamData(input: {
  streamItems: StreamItem[];
  streamHead: StreamItem[] | undefined;
}): { effectiveStreamItems: StreamItem[]; effectiveStreamHead: StreamItem[] | undefined } {
  const { streamItems, streamHead } = input;
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
  return {
    effectiveStreamItems: isActive ? streamItems : frozenStreamItemsRef.current,
    effectiveStreamHead: isActive ? streamHead : frozenStreamHeadRef.current,
  };
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
  scrollToMessage(messageId: string, viewportY?: number | null): boolean;
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
  // Resolved by the parent: combines the user setting with size-based suppression
  // (e.g. composer taking more than ~1/4 of the chat pane height). Optional so
  // ephemeral previews (e.g. draft submit) can skip the gating wiring.
  pinUserInputsEnabled?: boolean;
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
  "supportsBranchConversation",
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
      pinUserInputsEnabled = false,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const viewportRef = useRef<StreamViewportHandle | null>(null);
    const isMobile = useIsCompactFormFactor();
    const pinnedUserInputMaxHeight = getPinnedUserInputMaxHeight(isMobile);
    const pinnedUserInputOverlayHeight = getPinnedUserInputOverlayHeight(pinnedUserInputMaxHeight);
    const streamRenderStrategy = useMemo(
      () =>
        resolveStreamRenderStrategy({
          platform: Platform.OS,
          isMobileBreakpoint: isMobile,
        }),
      [isMobile],
    );
    const [isNearBottom, setIsNearBottom] = useState(true);
    const [pinnedUserInput, setPinnedUserInput] = useState<PinnedUserInputState | null>(null);
    const [pinnedUserInputContentHeight, setPinnedUserInputContentHeight] =
      useState(pinnedUserInputMaxHeight);
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
    const collapseThinkingBehavior = useAppSettings().settings.collapseThinking;

    // Get serverId (fallback to agent's serverId if not provided)
    const resolvedServerId = serverId ?? agent.serverId ?? "";

    const client = useSessionStore((state) => selectSessionClient(state, resolvedServerId));
    const serverSupportsPromptIndex = useSessionStore((state) =>
      selectServerSupportsPromptIndex(state, resolvedServerId),
    );
    const streamHead = useSessionStore((state) =>
      selectAgentStreamHead(state, resolvedServerId, agentId),
    );
    const promptIndex = useSessionStore((state) =>
      selectAgentTimelinePromptIndex(state, resolvedServerId, agentId),
    );
    const timelineCursor = useSessionStore((state) =>
      selectAgentTimelineCursor(state, resolvedServerId, agentId),
    );
    const setAgentTimelinePromptIndex = useSessionStore(
      (state) => state.setAgentTimelinePromptIndex,
    );
    const supportsAgentBranching = useSessionStore(
      (state) => state.sessions[resolvedServerId]?.serverInfo?.features?.agentBranching === true,
    );
    const pendingBranchNavigation = useBranchNavigationStore(
      (state) => state.pendingByKey[branchNavigationKey(resolvedServerId, agentId)] ?? null,
    );
    const consumePendingBranchNavigation = useBranchNavigationStore(
      (state) => state.consumePending,
    );
    const setPendingBranchNavigation = useBranchNavigationStore((state) => state.setPending);
    const branchGroupsQuery = useAgentBranchGroupsQuery({
      agentId,
      client,
      membershipCount: agent.branching?.memberships.length ?? 0,
      resolvedServerId,
      supportsAgentBranching,
    });

    const workspaceRoot = getAgentWorkspaceRoot(agent);
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
      setPinnedUserInput(null);
      setExpandedInlineToolCallIds(new Set());
      setExpandedThinkingGroupIds(new Map());
      setIsFindOpen(false);
      setFindQuery("");
      findMatchesRef.current = [];
      setFindMatches([]);
      setActiveFindMatchId(null);
    }, [agentId]);

    useClearPinnedUserInputWhenDisabled({
      pinUserInputsEnabled,
      setPinnedUserInput,
    });
    useAgentTimelinePromptIndexLoader({
      agentId,
      client,
      promptIndex,
      resolvedServerId,
      serverSupportsPromptIndex,
      setAgentTimelinePromptIndex,
    });

    const handleInlinePathPress = useAgentStreamInlinePathPress({
      agent,
      isMobile,
      onOpenWorkspaceFile,
      resolvedServerId,
      workspaceRoot,
    });

    const handleToolCallOpenFile = useStableEvent((filePath: string) => {
      handleInlinePathPress({ raw: filePath, path: filePath }, "main");
    });

    const { effectiveStreamItems, effectiveStreamHead } = useEffectiveStreamData({
      streamItems,
      streamHead,
    });
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
        scrollToMessage(messageId, viewportY = null) {
          return viewportRef.current?.scrollToMessage(messageId, viewportY) ?? false;
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

    useEffect(() => {
      if (!pendingBranchNavigation || !isAuthoritativeHistoryReady) {
        return;
      }
      const request = pendingBranchNavigation;
      const frame = requestAnimationFrame(() => {
        const didScroll =
          request.messageId !== null
            ? (viewportRef.current?.scrollToMessage(request.messageId, request.viewportY) ?? false)
            : false;
        if (!didScroll) {
          viewportRef.current?.scrollToBottom("jump-to-bottom");
        }
        consumePendingBranchNavigation(resolvedServerId, agentId, request.requestId);
      });
      return () => cancelAnimationFrame(frame);
    }, [
      agentId,
      consumePendingBranchNavigation,
      isAuthoritativeHistoryReady,
      pendingBranchNavigation,
      resolvedServerId,
    ]);

    const scrollToBottom = useCallback(() => {
      viewportRef.current?.scrollToBottom("jump-to-bottom");
    }, []);
    const pauseBottomAnchoringForNextLayoutChange = useCallback(() => {
      viewportRef.current?.pauseBottomAnchoringForNextLayoutChange();
    }, []);

    const scrollToPinnedUserInput = useCallback(() => {
      const itemId = pinnedUserInput?.item.id;
      if (!itemId) {
        return;
      }
      viewportRef.current?.scrollToStreamItemTop(itemId);
    }, [pinnedUserInput?.item.id]);

    const handlePinnedUserInputContentLayout = useCallback(
      (event: LayoutChangeEvent) => {
        const measuredHeight = event.nativeEvent.layout.height;
        const nextHeight = Math.min(
          pinnedUserInputMaxHeight,
          Math.max(0, Math.ceil(measuredHeight)),
        );
        setPinnedUserInputContentHeight((previousHeight) =>
          previousHeight === nextHeight ? previousHeight : nextHeight,
        );
      },
      [pinnedUserInputMaxHeight],
    );

    const pinnedUserInputTranslateY = useSharedValue(0);

    const handlePinnedUserInputChange = useCallback(
      (next: PinnedUserInputState | null) => {
        // translateY changes on every scroll while the next user_message pushes the
        // overlay up. Writing it straight to the shared value keeps the slide off the
        // React render path.
        pinnedUserInputTranslateY.value = next?.translateY ?? 0;
        setPinnedUserInput((previous) => {
          if (previous?.item === next?.item) {
            return previous;
          }
          if (previous?.item.id === next?.item.id && previous?.item.text === next?.item.text) {
            return previous;
          }
          return next;
        });
      },
      [pinnedUserInputTranslateY],
    );

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

    useFindKeyboardActions({
      agentId,
      isPaneFocused,
      isFindOpen,
      openFind,
      closeFind,
      moveFindMatch,
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

    const branchInfoByMessageId = useMemo(() => {
      const result = new Map<string, MessageBranchInfo>();
      for (const group of branchGroupsQuery.data ?? []) {
        const current = group.members.find((member) => member.agentId === agentId);
        if (!current?.messageId || group.members.length < 2) {
          continue;
        }
        result.set(current.messageId, {
          groupId: group.groupId,
          current,
          members: group.members,
        });
      }
      return result;
    }, [agentId, branchGroupsQuery.data]);

    const handleNavigateBranch = useCallback(
      (member: AgentBranchGroupMember, viewportY: number | null) => {
        if (!agent.workspaceId) {
          return;
        }
        setPendingBranchNavigation({
          serverId: resolvedServerId,
          agentId: member.agentId,
          messageId: member.messageId,
          viewportY,
        });
        navigateToPreparedWorkspaceTab({
          serverId: resolvedServerId,
          workspaceId: agent.workspaceId,
          target: { kind: "agent", agentId: member.agentId },
          pin: true,
        });
      },
      [agent.workspaceId, resolvedServerId, setPendingBranchNavigation],
    );

    const renderUserMessageItem = useCallback(
      (layoutItem: StreamLayoutItem, item: Extract<StreamItem, { kind: "user_message" }>) => {
        return (
          <UserMessage
            serverId={resolvedServerId}
            workspaceId={agent.workspaceId}
            agentId={agentId}
            messageId={item.id}
            message={item.text}
            images={item.images}
            attachments={item.attachments}
            timestamp={item.timestamp.getTime()}
            capabilities={agent.capabilities}
            client={client}
            canBranch={
              Boolean(agent.workspaceId) &&
              supportsAgentBranching &&
              agent.status !== "running" &&
              agent.status !== "initializing" &&
              agent.capabilities?.supportsBranchConversation === true
            }
            branchInfo={branchInfoByMessageId.get(item.id) ?? null}
            onNavigateBranch={handleNavigateBranch}
            isFirstInGroup={layoutItem.isFirstInUserGroup}
            isLastInGroup={layoutItem.isLastInUserGroup}
            findHighlightRanges={getFindHighlightRanges(findHighlights, item.id, FIND_PART_MESSAGE)}
          />
        );
      },
      [
        agent.capabilities,
        agent.status,
        agent.workspaceId,
        agentId,
        branchInfoByMessageId,
        client,
        findHighlights,
        handleNavigateBranch,
        resolvedServerId,
        supportsAgentBranching,
      ],
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
              runningStartedAt={baseRenderModel.turnTiming.runningStartedAt}
              timingByAssistantId={baseRenderModel.turnTiming.byAssistantId}
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
        baseRenderModel.turnTiming.byAssistantId,
        baseRenderModel.turnTiming.runningStartedAt,
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
    const [messageLayoutMetrics, setMessageLayoutMetrics] = useState<MessageLayoutMetrics>(() =>
      getMessageTableLayoutMetrics({ breakoutOffset: 0, contentWidth: 0 }),
    );
    const reportStreamLayout = useStableEvent(
      (input: { breakoutOffset: number; contentWidth: number }) => {
        const next = getMessageTableLayoutMetrics(input);
        setMessageLayoutMetrics((previous) => {
          const breakoutUnchanged =
            Math.abs(previous.tableBreakoutOffset - next.tableBreakoutOffset) <
            STREAM_LAYOUT_EPSILON;
          const widthUnchanged =
            Math.abs(previous.tableWidth - next.tableWidth) < STREAM_LAYOUT_EPSILON;
          return breakoutUnchanged && widthUnchanged ? previous : next;
        });
      },
    );
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
        onClose={closeFind}
        onNext={moveToNextFindMatch}
        onPrevious={moveToPreviousFindMatch}
        onQueryChange={setFindQuery}
        onIncludeThinkingChange={setFindIncludesThinking}
      />
    );

    const pinnedUserInputBackdropFadeStart =
      PINNED_USER_INPUT_TOP_PADDING + pinnedUserInputContentHeight;
    const pinnedUserInputBackdropHeight =
      pinnedUserInputBackdropFadeStart + PINNED_USER_INPUT_GRADIENT_HEIGHT;
    const pinnedUserInputBackdropMask = isWeb
      ? `linear-gradient(to bottom, #000 0, #000 ${pinnedUserInputBackdropFadeStart}px, transparent ${pinnedUserInputBackdropHeight}px)`
      : undefined;
    const pinnedUserInputBackdropStyle = useMemo(
      () => [
        stylesheet.pinnedUserInputBackdrop,
        inlineUnistylesStyle({
          height: pinnedUserInputBackdropHeight,
          maskImage: pinnedUserInputBackdropMask,
          WebkitMaskImage: pinnedUserInputBackdropMask,
        }),
      ],
      [pinnedUserInputBackdropHeight, pinnedUserInputBackdropMask],
    );

    const pinnedUserInputOverlay = (
      <PinnedUserInputOverlay
        accessibilityLabel={t("agentStream.scrollToPinnedUserInput")}
        backdropStyle={pinnedUserInputBackdropStyle}
        item={pinnedUserInput?.item ?? null}
        overlayHeight={pinnedUserInputOverlayHeight}
        translateY={pinnedUserInputTranslateY}
        onContentLayout={handlePinnedUserInputContentLayout}
        onPress={scrollToPinnedUserInput}
      />
    );
    const scrollToBottomOverlay = !isNearBottom ? (
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
    ) : null;

    return (
      <ToolCallSheetProvider>
        <MessageLayoutProvider value={messageLayoutMetrics}>
          <StreamLayoutReporterContext.Provider value={reportStreamLayout}>
            <View style={stylesheet.container}>
              {findOverlay}
              <MessageOuterSpacingProvider disableOuterSpacing>
                {streamRenderStrategy.render({
                  agentId,
                  segments: renderModel.segments,
                  promptIndex,
                  loadedHistoryStartSeq: timelineCursor?.startSeq ?? null,
                  expectsFullHistoryPromptIndex: serverSupportsPromptIndex,
                  boundary,
                  renderers,
                  listEmptyComponent,
                  viewportRef,
                  routeBottomAnchorRequest,
                  isAuthoritativeHistoryReady,
                  onNearBottomChange: setIsNearBottom,
                  onNearHistoryStart: loadOlder,
                  pinUserInputsEnabled,
                  pinnedBottom: pinnedUserInputBackdropFadeStart,
                  onPinnedUserInputChange: handlePinnedUserInputChange,
                  pinnedUserInputOverlay,
                  isLoadingOlderHistory: isLoadingOlder,
                  hasOlderHistory: hasOlder,
                  scrollEnabled: streamScrollEnabled,
                  listStyle: stylesheet.list,
                  baseListContentContainerStyle: stylesheet.listContentContainer,
                  forwardListContentContainerStyle: stylesheet.forwardListContentContainer,
                  findIndicator,
                })}
              </MessageOuterSpacingProvider>
              {scrollToBottomOverlay}
            </View>
          </StreamLayoutReporterContext.Provider>
        </MessageLayoutProvider>
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

function collectAgentProjectPlacementDiffs(
  left: AgentScreenAgent["projectPlacement"],
  right: AgentScreenAgent["projectPlacement"],
): string[] {
  const reasons: string[] = [];
  if (left?.checkout?.cwd !== right?.checkout?.cwd) {
    reasons.push("agent.projectPlacement.checkout.cwd");
  }
  if (left?.checkout?.isGit !== right?.checkout?.isGit) {
    reasons.push("agent.projectPlacement.checkout.isGit");
  }
  if (left?.projectName !== right?.projectName) {
    reasons.push("agent.projectPlacement.projectName");
  }
  if (left?.projectKey !== right?.projectKey) {
    reasons.push("agent.projectPlacement.projectKey");
  }
  return reasons;
}

function collectAgentSetupDiffs(left: AgentScreenAgent, right: AgentScreenAgent): string[] {
  const reasons: string[] = [];
  if (left.currentModeId !== right.currentModeId) reasons.push("agent.currentModeId");
  if (left.model !== right.model) reasons.push("agent.model");
  if (left.thinkingOptionId !== right.thinkingOptionId) {
    reasons.push("agent.thinkingOptionId");
  }
  if (left.runtimeInfo?.modeId !== right.runtimeInfo?.modeId) {
    reasons.push("agent.runtimeInfo.modeId");
  }
  if (left.runtimeInfo?.model !== right.runtimeInfo?.model) {
    reasons.push("agent.runtimeInfo.model");
  }
  if (left.runtimeInfo?.thinkingOptionId !== right.runtimeInfo?.thinkingOptionId) {
    reasons.push("agent.runtimeInfo.thinkingOptionId");
  }
  if (left.features !== right.features) reasons.push("agent.features");
  if (left.branching !== right.branching) reasons.push("agent.branching");
  return reasons;
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
  reasons.push(...collectAgentProjectPlacementDiffs(left.projectPlacement, right.projectPlacement));
  reasons.push(...collectAgentSetupDiffs(left, right));
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
  if (left.pinUserInputsEnabled !== right.pinUserInputsEnabled) {
    reasons.push("pinUserInputsEnabled");
  }
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
    return null;
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
            <Text style={findInThreadStyles.checkboxLabel} numberOfLines={1}>
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
  runningStartedAt: Date | null;
  timingByAssistantId: Map<string, TurnTiming>;
  renderStreamItemContent: (layoutItem: StreamLayoutItem) => ReactNode;
}

function ThinkingGroupRow({
  group,
  layoutItemById,
  expanded,
  onExpandedChange,
  onExpandStart,
  runningStartedAt,
  timingByAssistantId,
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

  const firstLayout = groupLayouts[0];
  const lastLayout = groupLayouts.at(-1);
  const isExpanded = expanded ?? group.defaultExpanded;
  const completedTiming = group.finalAssistantItemId
    ? timingByAssistantId.get(group.finalAssistantItemId)
    : undefined;
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

  const wrapperSpacing =
    !isExpanded && firstLayout
      ? getCollapsedThinkingGroupSpacing({
          aboveItem: firstLayout.aboveItem,
          firstItem: firstLayout.item,
          belowItem: lastLayout?.belowItem,
          defaultGapBelow: lastLayout?.gapBelow ?? 0,
        })
      : { marginTop: 0, gapBelow: lastLayout?.gapBelow ?? 0 };

  return (
    <StreamItemWrapper gapBelow={wrapperSpacing.gapBelow} marginTop={wrapperSpacing.marginTop}>
      <CollapsibleThinkingGroup
        completedTiming={completedTiming}
        counts={counts}
        expanded={isExpanded}
        groupStatus={group.status}
        runningStartedAt={runningStartedAt}
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
  completedTiming,
  counts,
  expanded,
  groupStatus,
  runningStartedAt,
  onExpandStart,
  onExpandedChange,
  previewMessages,
  showPreview,
  children,
}: {
  completedTiming?: TurnTiming;
  counts: ReturnType<typeof getThinkingGroupCounts>;
  expanded: boolean;
  groupStatus: ThinkingGroup["status"];
  runningStartedAt: Date | null;
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
  const handlePreviewExpandPress = useCallback(() => {
    onExpandedChange(true);
  }, [onExpandedChange]);
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
        <ThinkingGroupHeaderTitle
          completedTiming={completedTiming}
          expanded={expanded}
          groupStatus={groupStatus}
          runningStartedAt={runningStartedAt}
          style={thinkingGroupStyles.title}
        />
        <ThinkingGroupHeaderCounts counts={counts} />
      </Pressable>
      {expanded ? <View style={thinkingGroupStyles.content}>{children}</View> : null}
      {showPreview ? (
        <ThinkingGroupPreview
          messages={previewMessages}
          onBottomHalfPress={handlePreviewExpandPress}
        />
      ) : null}
    </View>
  );
}

function ThinkingGroupHeaderTitle({
  completedTiming,
  expanded,
  groupStatus,
  runningStartedAt,
  style,
}: {
  completedTiming?: TurnTiming;
  expanded: boolean;
  groupStatus: ThinkingGroup["status"];
  runningStartedAt: Date | null;
  style: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  const isActive = groupStatus === "active";

  if (expanded) {
    return (
      <ThinkingGroupTitleText isPulsing={isActive} style={style}>
        {t("agentStream.thinking.label")}
      </ThinkingGroupTitleText>
    );
  }
  if (groupStatus === "completed" && completedTiming) {
    return (
      <ThinkingGroupTitleText isPulsing={false} style={style}>
        {t("agentStream.thinking.workedFor", {
          duration: formatDuration(completedTiming.durationMs),
        })}
      </ThinkingGroupTitleText>
    );
  }
  if (groupStatus === "active" && runningStartedAt) {
    return <LiveThinkingGroupHeaderTitle startedAt={runningStartedAt} style={style} />;
  }
  return (
    <ThinkingGroupTitleText isPulsing={isActive} style={style}>
      {t("agentStream.thinking.label")}
    </ThinkingGroupTitleText>
  );
}

function ThinkingGroupTitleText({
  children,
  isPulsing,
  style,
}: {
  children: string;
  isPulsing: boolean;
  style: StyleProp<TextStyle>;
}) {
  const pulseProgress = useSharedValue(0);
  const pulseStyle = useAnimatedStyle(() => {
    return {
      opacity: 0.28 + pulseProgress.value * 0.72,
    };
  });
  const titleBaseStyle = useMemo(
    () => (isPulsing ? [style, thinkingGroupStyles.titlePulsingBase] : style),
    [isPulsing, style],
  );
  const titlePulseOverlayStyle = useMemo(
    () => [thinkingGroupStaticStyles.titlePulseOverlay, pulseStyle],
    [pulseStyle],
  );
  const titlePulseTextStyle = useMemo(() => [style, thinkingGroupStyles.titlePulseText], [style]);

  useEffect(() => {
    if (!isPulsing) {
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
  }, [pulseProgress, isPulsing]);

  return (
    <View style={thinkingGroupStyles.titleContainer}>
      <Text numberOfLines={1} style={titleBaseStyle}>
        {children}
      </Text>
      {isPulsing ? (
        <Animated.View pointerEvents="none" style={titlePulseOverlayStyle}>
          <Text numberOfLines={1} style={titlePulseTextStyle}>
            {children}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const LiveThinkingGroupHeaderTitle = memo(function LiveThinkingGroupHeaderTitle({
  startedAt,
  style,
}: {
  startedAt: Date;
  style: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  const startedAtMs = startedAt.getTime();
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - startedAtMs));

  useEffect(() => {
    setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    const handle = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    }, 100);
    return () => clearInterval(handle);
  }, [startedAtMs]);

  return (
    <ThinkingGroupTitleText isPulsing style={style}>
      {t("agentStream.thinking.workingFor", { duration: formatDuration(elapsedMs) })}
    </ThinkingGroupTitleText>
  );
});

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

function ThinkingGroupPreview({
  messages,
  onBottomHalfPress,
}: {
  messages: ThinkingGroupPreviewMessage[];
  onBottomHalfPress: () => void;
}) {
  const { t } = useTranslation();
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
      <Pressable
        accessibilityLabel={t("agentStream.thinking.label")}
        accessibilityRole="button"
        accessibilityState={COLLAPSED_THINKING_PREVIEW_ACCESSIBILITY_STATE}
        onPress={onBottomHalfPress}
        style={thinkingGroupStyles.previewExpandTarget}
      />
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

const ThemedCheckIcon = withUnistyles(Check);
const ThemedXIcon = withUnistyles(X);

const primaryColorMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
});
const mutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const COLLAPSED_THINKING_PREVIEW_ACCESSIBILITY_STATE = { expanded: false };

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
        <LoadingSpinner size="small" />
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
    position: "relative",
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
  streamItemInner: {
    width: "100%",
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
  pinnedUserInputOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: "box-none",
    zIndex: 2,
  },
  pinnedUserInputBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface0,
    zIndex: 1,
  },
  pinnedUserInputPressable: {
    width: "100%",
    paddingTop: PINNED_USER_INPUT_TOP_PADDING,
    zIndex: 2,
  },
}));

const findInThreadStyles = StyleSheet.create((theme) => ({
  host: {
    width: "100%",
    zIndex: 5,
  },
  content: {
    width: "100%",
    alignSelf: "center",
    alignItems: "stretch",
    pointerEvents: "box-none",
  },
  panel: {
    width: "100%",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: {
      xs: theme.spacing[2],
      md: theme.spacing[3],
    },
    borderBottomWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  input: {
    flex: 1,
    minWidth: 128,
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
    flexShrink: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  scanningText: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  checkboxRow: {
    minHeight: 28,
    flexShrink: 0,
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
    flexShrink: 0,
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
  previewExpandTarget: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
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
  marginTop?: number;
  children: ReactNode;
}

function StreamItemWrapper({ gapBelow, marginTop = 0, children }: StreamItemWrapperProps) {
  const reportLayout = useContext(StreamLayoutReporterContext);
  const breakoutOffsetRef = useRef<number | null>(null);
  const contentWidthRef = useRef<number | null>(null);
  const flushLayoutMetrics = useCallback(() => {
    if (!reportLayout || breakoutOffsetRef.current == null || contentWidthRef.current == null) {
      return;
    }
    reportLayout({
      breakoutOffset: breakoutOffsetRef.current,
      contentWidth: contentWidthRef.current,
    });
  }, [reportLayout]);
  const handleOuterLayout = useCallback(
    (event: LayoutChangeEvent) => {
      breakoutOffsetRef.current = Math.max(0, event.nativeEvent.layout.x);
      flushLayoutMetrics();
    },
    [flushLayoutMetrics],
  );
  const handleInnerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      contentWidthRef.current = Math.max(0, event.nativeEvent.layout.width);
      flushLayoutMetrics();
    },
    [flushLayoutMetrics],
  );
  const wrapperStyle = useMemo(() => [stylesheet.streamItemWrapper], []);
  const innerStyle = useMemo(
    () => [stylesheet.streamItemInner, { marginTop, marginBottom: gapBelow }],
    [gapBelow, marginTop],
  );
  return (
    <View style={wrapperStyle} onLayout={handleOuterLayout}>
      <View style={innerStyle} onLayout={handleInnerLayout}>
        {children}
      </View>
    </View>
  );
}
