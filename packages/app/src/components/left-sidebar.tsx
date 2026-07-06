import { router, usePathname, type Href } from "expo-router";
import { FolderPlus, History, Home, Search, Settings, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import {
  type Dispatch,
  memo,
  type ComponentProps,
  type ReactElement,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  Pressable,
  StyleSheet as RNStyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { SidebarGroupingSelector } from "@/components/sidebar/sidebar-grouping-selector";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { useSidebarAnimation } from "@/contexts/sidebar-animation-context";
import { useOpenProjectPicker } from "@/hooks/use-open-project-picker";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useSidebarShortcutModel } from "@/hooks/use-sidebar-shortcut-model";
import { useAppSettings } from "@/hooks/use-settings";
import { useSchedules } from "@/hooks/use-schedules";
import {
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  useSidebarWorkspacesList,
} from "@/hooks/use-sidebar-workspaces-list";
import {
  useSidebarViewStore,
  type SidebarBadgeMode,
  type SidebarGroupMode,
} from "@/stores/sidebar-view-store";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useHostRuntimeSnapshot, useHosts } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import {
  MAX_SIDEBAR_WIDTH,
  MAX_VERTICAL_TABS_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MIN_VERTICAL_TABS_SIDEBAR_WIDTH,
  selectIsAgentListOpen,
  usePanelStore,
} from "@/stores/panel-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { resolveActiveHost } from "@/utils/active-host";
import { formatConnectionStatus } from "@/utils/daemons";
import { useWindowControlsPadding } from "@/utils/desktop-window";
import { canCloseLeftSidebarGesture } from "@/utils/sidebar-animation-state";
import {
  buildHostOpenProjectRoute,
  buildHostSessionsRoute,
  buildSettingsRoute,
  mapPathnameToServer,
} from "@/utils/host-routes";
import { resolveProjectSelectorRowProject } from "@/utils/sidebar-project-selector-row";
import { SidebarScrollContext, useSidebarScroll } from "./sidebar/sidebar-scroll-context";
import { SidebarAgentListSkeleton } from "./sidebar-agent-list-skeleton";
import { SidebarCalloutSlot } from "./sidebar-callout-slot";
import {
  SidebarSelectedProjectHeaderActions,
  SidebarVerticalWorkspaceTabs,
  SidebarVerticalWorkspaceTabsHeaderActions,
  SidebarWorkspaceList,
} from "./sidebar-workspace-list";
import {
  buildAgentWorkspaceLookupKey,
  mergeScheduledComposerMessageCountsByWorkspace,
} from "@/composer/scheduled-messages";

const MIN_CHAT_WIDTH = 400;

function useSidebarScrollProvider() {
  const [isScrolled, setIsScrolled] = useState(false);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setIsScrolled((current) => {
      const next = offsetY > 0;
      return current === next ? current : next;
    });
  }, []);
  return useMemo(() => ({ isScrolled, onScroll }), [isScrolled, onScroll]);
}

type SidebarShortcutModel = ReturnType<typeof useSidebarShortcutModel>;
type SidebarTheme = ReturnType<typeof useUnistyles>["theme"];

interface LeftSidebarProps {
  selectedAgentId?: string;
}

interface SidebarSharedProps {
  theme: SidebarTheme;
  activeServerId: string | null;
  activeHostLabel: string;
  activeHostStatusColor: string;
  hostOptions: ComboboxOption[];
  hostTriggerRef: RefObject<View | null>;
  isHostPickerOpen: boolean;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  projects: SidebarProjectEntry[];
  projectSelectorRowEnabled: boolean;
  selectedSelectorRowProject: SidebarProjectEntry | null;
  headerProjectName: string | null;
  handleProjectSelectorRowSelect: (projectKey: string) => void;
  handleProjectSelectorRowHover: (projectName: string | null) => void;
  isInitialLoad: boolean;
  isRevalidating: boolean;
  isManualRefresh: boolean;
  groupMode: SidebarGroupMode;
  collapsedProjectKeys: SidebarShortcutModel["collapsedProjectKeys"];
  shortcutIndexByWorkspaceKey: SidebarShortcutModel["shortcutIndexByWorkspaceKey"];
  messageStatusCountsByWorkspaceKey: ReadonlyMap<string, number>;
  toggleProjectCollapsed: SidebarShortcutModel["toggleProjectCollapsed"];
  handleRefresh: () => void;
  handleHostSelect: (nextServerId: string) => void;
  handleOpenProject: () => void;
  handleHome: () => void;
  handleSettings: () => void;
  labels: SidebarLabels;
  renderHostOption: (input: {
    option: ComboboxOption;
    selected: boolean;
    active: boolean;
    onPress: () => void;
  }) => ReactElement;
}

interface SidebarLabels {
  addProject: string;
  home: string;
  settings: string;
  switchHost: string;
  searchHosts: string;
  sessions: string;
  closeSidebar: string;
}

interface MobileSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  insetsBottom: number;
  isOpen: boolean;
  closeSidebar: () => void;
  handleViewMoreNavigate: () => void;
}

interface DesktopSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  isOpen: boolean;
  showVerticalTabs: boolean;
  handleViewMore: () => void;
}

interface SidebarMessageStatusQueueState {
  queuedCounts: ReadonlyMap<string, number>;
  agentWorkspaceKeys: ReadonlyMap<string, string>;
}

function selectSidebarMessageStatusQueueState(
  state: ReturnType<typeof useSessionStore.getState>,
): SidebarMessageStatusQueueState {
  const queuedCounts = new Map<string, number>();
  const agentWorkspaceKeys = new Map<string, string>();
  for (const [serverId, session] of Object.entries(state.sessions)) {
    for (const agent of session.agents.values()) {
      if (!agent.workspaceId) continue;
      const workspaceKey = `${serverId}:${agent.workspaceId}`;
      agentWorkspaceKeys.set(buildAgentWorkspaceLookupKey(serverId, agent.id), workspaceKey);
    }
    for (const [agentId, messages] of session.queuedMessages.entries()) {
      const workspaceKey = agentWorkspaceKeys.get(buildAgentWorkspaceLookupKey(serverId, agentId));
      if (!workspaceKey || messages.length === 0) continue;
      queuedCounts.set(workspaceKey, (queuedCounts.get(workspaceKey) ?? 0) + messages.length);
    }
  }
  return { queuedCounts, agentWorkspaceKeys };
}

function areSidebarMessageStatusQueueStatesEqual(
  left: SidebarMessageStatusQueueState,
  right: SidebarMessageStatusQueueState,
): boolean {
  return (
    areMapsEqual(left.queuedCounts, right.queuedCounts) &&
    areMapsEqual(left.agentWorkspaceKeys, right.agentWorkspaceKeys)
  );
}

function areMapsEqual<Value>(
  left: ReadonlyMap<string, Value>,
  right: ReadonlyMap<string, Value>,
): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [key, leftValue] of left) {
    if (!right.has(key) || !Object.is(leftValue, right.get(key))) {
      return false;
    }
  }
  return true;
}

function useMessageStatusCountsByWorkspace(
  schedules: ReturnType<typeof useSchedules>["schedules"],
): ReadonlyMap<string, number> {
  const queueState = useStoreWithEqualityFn(
    useSessionStore,
    selectSidebarMessageStatusQueueState,
    areSidebarMessageStatusQueueStatesEqual,
  );

  return useMemo(() => {
    return mergeScheduledComposerMessageCountsByWorkspace({
      queuedCounts: queueState.queuedCounts,
      schedules,
      agentWorkspaceKeys: queueState.agentWorkspaceKeys,
    });
  }, [queueState.agentWorkspaceKeys, queueState.queuedCounts, schedules]);
}

export const LeftSidebar = memo(function LeftSidebar({
  selectedAgentId: _selectedAgentId,
}: LeftSidebarProps) {
  void _selectedAgentId;

  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isCompactLayout = useIsCompactFormFactor();
  const isOpen = usePanelStore((state) =>
    selectIsAgentListOpen(state, { isCompact: isCompactLayout }),
  );
  const { settings } = useAppSettings();
  const showDesktopVerticalTabs = settings.tabLayoutMode === "vertical" && !isCompactLayout;
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);
  const pathname = usePathname();
  const daemons = useHosts();
  const activeDaemon = useMemo(
    () => resolveActiveHost({ hosts: daemons, pathname }),
    [daemons, pathname],
  );
  const activeServerId = activeDaemon?.serverId ?? null;
  const activeHostLabel = useMemo(() => {
    if (!activeDaemon) return t("sidebar.host.noHost");
    const trimmed = activeDaemon.label?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : activeDaemon.serverId;
  }, [activeDaemon, t]);
  const activeHostSnapshot = useHostRuntimeSnapshot(activeServerId ?? "");
  const activeHostStatus = activeServerId
    ? (activeHostSnapshot?.connectionStatus ?? "connecting")
    : "idle";
  let activeHostStatusColor: string;
  if (activeHostStatus === "online") activeHostStatusColor = theme.colors.palette.green[400];
  else if (activeHostStatus === "connecting")
    activeHostStatusColor = theme.colors.palette.amber[500];
  else activeHostStatusColor = theme.colors.palette.red[500];
  const hostOptions = useMemo(
    () =>
      daemons.map((daemon) => ({
        id: daemon.serverId,
        label: daemon.label?.trim() || daemon.serverId,
      })),
    [daemons],
  );
  const renderHostOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => (
      <HostSwitchOption
        serverId={option.id}
        label={option.label}
        selected={selected}
        active={active}
        onPress={onPress}
      />
    ),
    [],
  );
  const hostTriggerRef = useRef<View | null>(null);
  const [isHostPickerOpen, setIsHostPickerOpen] = useState(false);

  const { projects, isInitialLoad, isRevalidating, refreshAll } = useSidebarWorkspacesList({
    serverId: activeServerId,
    enabled: isCompactLayout || isOpen || showDesktopVerticalTabs,
  });
  const { collapsedProjectKeys, shortcutIndexByWorkspaceKey, toggleProjectCollapsed } =
    useSidebarShortcutModel({ projects });
  const schedulesQuery = useSchedules();
  const messageStatusCountsByWorkspaceKey = useMessageStatusCountsByWorkspace(
    schedulesQuery.schedules,
  );

  const groupMode = useSidebarViewStore((state) =>
    activeServerId ? state.getGroupMode(activeServerId) : "project",
  );
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const projectSelectorRowSettingEnabled = useSidebarViewStore(
    (state) => state.projectSelectorRowEnabled,
  );
  const projectSelectorRowProjectKey = useSidebarViewStore(
    (state) => state.projectSelectorRowProjectKey,
  );
  const setProjectSelectorRowProjectKey = useSidebarViewStore(
    (state) => state.setProjectSelectorRowProjectKey,
  );
  const projectSelectorRowEnabled = groupMode === "project" && projectSelectorRowSettingEnabled;
  const [hoveredSelectorRowProjectName, setHoveredSelectorRowProjectName] = useState<string | null>(
    null,
  );
  const selectedSelectorRowProject = useMemo(
    () =>
      projectSelectorRowEnabled
        ? resolveProjectSelectorRowProject({
            projects,
            activeWorkspaceSelection,
            storedProjectKey: projectSelectorRowProjectKey,
          })
        : null,
    [activeWorkspaceSelection, projects, projectSelectorRowEnabled, projectSelectorRowProjectKey],
  );

  // Follow route navigation into other projects, but only once per active
  // workspace change — otherwise this would immediately override a manual
  // capsule selection while the old workspace route is still active.
  const activeWorkspaceSelectionKey = activeWorkspaceSelection
    ? `${activeWorkspaceSelection.serverId}:${activeWorkspaceSelection.workspaceId}`
    : "";
  const syncedActiveWorkspaceSelectionKeyRef = useRef("");

  useEffect(() => {
    if (!projectSelectorRowEnabled) {
      syncedActiveWorkspaceSelectionKeyRef.current = "";
      return;
    }
    if (!activeWorkspaceSelection) {
      return;
    }
    if (syncedActiveWorkspaceSelectionKeyRef.current === activeWorkspaceSelectionKey) {
      return;
    }
    let activeProjectKey: string | null = null;
    for (const project of projects) {
      for (const workspace of project.workspaces) {
        if (
          workspace.serverId === activeWorkspaceSelection.serverId &&
          workspace.workspaceId === activeWorkspaceSelection.workspaceId
        ) {
          activeProjectKey = project.projectKey;
          break;
        }
      }
      if (activeProjectKey) break;
    }
    if (!activeProjectKey) {
      return;
    }
    syncedActiveWorkspaceSelectionKeyRef.current = activeWorkspaceSelectionKey;
    if (activeProjectKey !== projectSelectorRowProjectKey) {
      setProjectSelectorRowProjectKey(activeProjectKey);
    }
  }, [
    activeWorkspaceSelection,
    activeWorkspaceSelectionKey,
    projects,
    setProjectSelectorRowProjectKey,
    projectSelectorRowEnabled,
    projectSelectorRowProjectKey,
  ]);

  const headerProjectName = projectSelectorRowEnabled
    ? (hoveredSelectorRowProjectName ?? selectedSelectorRowProject?.projectName ?? null)
    : null;
  const handleProjectSelectorRowSelect = useCallback(
    (projectKey: string) => {
      setProjectSelectorRowProjectKey(projectKey);
    },
    [setProjectSelectorRowProjectKey],
  );
  const handleProjectSelectorRowHover = useCallback((projectName: string | null) => {
    setHoveredSelectorRowProjectName(projectName);
  }, []);

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!isRevalidating && isManualRefresh) {
      setIsManualRefresh(false);
    }
  }, [isRevalidating, isManualRefresh]);

  const openProjectPicker = useOpenProjectPicker(activeServerId);

  const handleOpenProjectMobile = useCallback(() => {
    showMobileAgent();
    void openProjectPicker();
  }, [showMobileAgent, openProjectPicker]);

  const handleOpenProjectDesktop = useCallback(() => {
    void openProjectPicker();
  }, [openProjectPicker]);

  const handleSettingsMobile = useCallback(() => {
    showMobileAgent();
    router.push(buildSettingsRoute());
  }, [showMobileAgent]);

  const handleSettingsDesktop = useCallback(() => {
    router.push(buildSettingsRoute());
  }, []);

  const handleHomeMobile = useCallback(() => {
    if (!activeServerId) return;
    showMobileAgent();
    router.push(buildHostOpenProjectRoute(activeServerId));
  }, [activeServerId, showMobileAgent]);

  const handleHomeDesktop = useCallback(() => {
    if (!activeServerId) return;
    router.push(buildHostOpenProjectRoute(activeServerId));
  }, [activeServerId]);

  const handleViewMoreNavigate = useCallback(() => {
    if (!activeServerId) {
      return;
    }
    router.push(buildHostSessionsRoute(activeServerId));
  }, [activeServerId]);

  const handleHostSelect = useCallback(
    (nextServerId: string) => {
      if (!nextServerId) {
        return;
      }
      const nextPath = mapPathnameToServer(pathname, nextServerId);
      setIsHostPickerOpen(false);
      router.push(nextPath as Href);
    },
    [pathname],
  );

  const labels = useMemo(
    (): SidebarLabels => ({
      addProject: t("sidebar.actions.addProject"),
      home: t("sidebar.actions.home"),
      settings: t("sidebar.actions.settings"),
      switchHost: t("sidebar.host.switchTitle"),
      searchHosts: t("sidebar.host.searchPlaceholder"),
      sessions: t("sidebar.sections.sessions"),
      closeSidebar: t("sidebar.actions.closeSidebar"),
    }),
    [t],
  );

  const sharedProps = {
    theme,
    activeServerId,
    activeHostLabel,
    activeHostStatusColor,
    hostOptions,
    hostTriggerRef,
    isHostPickerOpen,
    setIsHostPickerOpen,
    projects,
    projectSelectorRowEnabled,
    selectedSelectorRowProject,
    headerProjectName,
    handleProjectSelectorRowSelect,
    handleProjectSelectorRowHover,
    isInitialLoad,
    isRevalidating,
    isManualRefresh,
    groupMode,
    collapsedProjectKeys,
    shortcutIndexByWorkspaceKey,
    messageStatusCountsByWorkspaceKey,
    toggleProjectCollapsed,
    handleRefresh,
    handleHostSelect,
    renderHostOption,
    labels,
  };

  if (isCompactLayout) {
    return (
      <MobileSidebar
        {...sharedProps}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        isOpen={isOpen}
        closeSidebar={showMobileAgent}
        handleOpenProject={handleOpenProjectMobile}
        handleHome={handleHomeMobile}
        handleSettings={handleSettingsMobile}
        handleViewMoreNavigate={handleViewMoreNavigate}
      />
    );
  }

  return (
    <DesktopSidebar
      {...sharedProps}
      insetsTop={insets.top}
      isOpen={isOpen}
      showVerticalTabs={showDesktopVerticalTabs}
      handleOpenProject={handleOpenProjectDesktop}
      handleHome={handleHomeDesktop}
      handleSettings={handleSettingsDesktop}
      handleViewMore={handleViewMoreNavigate}
    />
  );
});

interface HostPickerTriggerProps {
  triggerRef: React.Ref<View>;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  hostOptionsEmpty: boolean;
  hostStatusDotStyle: StyleProp<ViewStyle>;
  activeHostLabel: string;
}

function HostPickerTrigger({
  triggerRef,
  setIsHostPickerOpen,
  hostOptionsEmpty,
  hostStatusDotStyle,
  activeHostLabel,
}: HostPickerTriggerProps) {
  const pressableStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.hostTrigger,
      hovered && styles.hostTriggerHovered,
    ],
    [],
  );
  const handlePress = useCallback(() => setIsHostPickerOpen(true), [setIsHostPickerOpen]);
  return (
    <Pressable
      ref={triggerRef}
      style={pressableStyle}
      onPress={handlePress}
      disabled={hostOptionsEmpty}
    >
      <View style={hostStatusDotStyle} />
      <Text style={styles.hostTriggerText} numberOfLines={1}>
        {activeHostLabel}
      </Text>
    </Pressable>
  );
}

function HostSwitchOption({
  serverId,
  label,
  selected,
  active,
  onPress,
}: {
  serverId: string;
  label: string;
  selected: boolean;
  active: boolean;
  onPress: () => void;
}) {
  const snapshot = useHostRuntimeSnapshot(serverId);
  const connectionStatus = snapshot?.connectionStatus ?? "connecting";

  return (
    <ComboboxItem
      label={label}
      description={formatConnectionStatus(connectionStatus)}
      selected={selected}
      active={active}
      onPress={onPress}
    />
  );
}

function FooterIconButton({
  onPress,
  testID,
  accessibilityLabel,
  icon: Icon,
  theme,
  isActive = false,
}: {
  onPress: () => void;
  testID: string;
  accessibilityLabel: string;
  icon: typeof FolderPlus;
  theme: SidebarTheme;
  isActive?: boolean;
}) {
  return (
    <Pressable
      style={styles.footerIconButton}
      testID={testID}
      nativeID={testID}
      collapsable={false}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
    >
      {({ hovered }) => (
        <Icon
          size={theme.iconSize.md}
          color={hovered || isActive ? theme.colors.foreground : theme.colors.foregroundMuted}
        />
      )}
    </Pressable>
  );
}

function AddProjectTooltipContent({
  newAgentKeys,
  label,
}: {
  newAgentKeys: ReturnType<typeof useShortcutKeys>;
  label: string;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{label}</Text>
      {newAgentKeys ? <Shortcut chord={newAgentKeys} /> : null}
    </View>
  );
}

function HeaderIconTooltipContent({
  label,
  shortcutKeys,
}: {
  label: string;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{label}</Text>
      {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
    </View>
  );
}

function SidebarFooter({
  theme,
  activeServerId,
  activeHostLabel,
  hostStatusDotStyle,
  hostOptions,
  hostTriggerRef,
  isHostPickerOpen,
  setIsHostPickerOpen,
  handleHostSelect,
  renderHostOption,
  handleViewMore,
  handleOpenProject,
  handleHome,
  handleSettings,
  labels,
  isSessionsActive,
}: {
  theme: SidebarTheme;
  activeServerId: string | null;
  activeHostLabel: string;
  hostStatusDotStyle: StyleProp<ViewStyle>;
  hostOptions: ComboboxOption[];
  hostTriggerRef: RefObject<View | null>;
  isHostPickerOpen: boolean;
  setIsHostPickerOpen: Dispatch<SetStateAction<boolean>>;
  handleHostSelect: (nextServerId: string) => void;
  renderHostOption: SidebarSharedProps["renderHostOption"];
  handleViewMore: () => void;
  handleOpenProject: () => void;
  handleHome: () => void;
  handleSettings: () => void;
  labels: {
    addProject: string;
    home: string;
    settings: string;
    switchHost: string;
    searchHosts: string;
    sessions: string;
  };
  isSessionsActive: boolean;
}) {
  const newAgentKeys = useShortcutKeys("new-agent");
  return (
    <View style={styles.sidebarFooter}>
      <View style={styles.footerHostSlot}>
        <HostPickerTrigger
          triggerRef={hostTriggerRef}
          setIsHostPickerOpen={setIsHostPickerOpen}
          hostOptionsEmpty={hostOptions.length === 0}
          hostStatusDotStyle={hostStatusDotStyle}
          activeHostLabel={activeHostLabel}
        />
      </View>
      <View style={styles.footerIconRow}>
        <FooterIconButton
          onPress={handleViewMore}
          testID="sidebar-sessions"
          accessibilityLabel={labels.sessions}
          icon={History}
          theme={theme}
          isActive={isSessionsActive}
        />
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <FooterIconButton
              onPress={handleOpenProject}
              testID="sidebar-add-project"
              accessibilityLabel={labels.addProject}
              icon={FolderPlus}
              theme={theme}
            />
          </TooltipTrigger>
          <TooltipContent side="top" align="center" offset={8}>
            <AddProjectTooltipContent newAgentKeys={newAgentKeys} label={labels.addProject} />
          </TooltipContent>
        </Tooltip>
        <FooterIconButton
          onPress={handleHome}
          testID="sidebar-home"
          accessibilityLabel={labels.home}
          icon={Home}
          theme={theme}
        />
        <FooterIconButton
          onPress={handleSettings}
          testID="sidebar-settings"
          accessibilityLabel={labels.settings}
          icon={Settings}
          theme={theme}
        />
      </View>
      <Combobox
        options={hostOptions}
        value={activeServerId ?? ""}
        onSelect={handleHostSelect}
        renderOption={renderHostOption}
        searchable={false}
        title={labels.switchHost}
        searchPlaceholder={labels.searchHosts}
        desktopMinWidth={280}
        open={isHostPickerOpen}
        onOpenChange={setIsHostPickerOpen}
        anchorRef={hostTriggerRef}
      />
    </View>
  );
}

function MobileSidebar({
  theme,
  activeServerId,
  activeHostLabel,
  activeHostStatusColor,
  hostOptions,
  hostTriggerRef,
  isHostPickerOpen,
  setIsHostPickerOpen,
  projects,
  projectSelectorRowEnabled,
  selectedSelectorRowProject,
  headerProjectName,
  handleProjectSelectorRowSelect,
  handleProjectSelectorRowHover,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  messageStatusCountsByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleHostSelect,
  renderHostOption,
  handleOpenProject,
  handleHome,
  handleSettings,
  labels,
  insetsTop,
  insetsBottom,
  isOpen,
  closeSidebar,
  handleViewMoreNavigate,
}: MobileSidebarProps) {
  const pathname = usePathname();
  const isSessionsActive = pathname.includes("/sessions");
  const {
    translateX,
    backdropOpacity,
    windowWidth,
    animateToOpen,
    animateToClose,
    overlayVisible,
    isGesturing,
    mobilePanelState,
    gestureAnimatingRef,
    closeGestureRef,
  } = useSidebarAnimation();
  const closeTouchStartX = useSharedValue(0);
  const closeTouchStartY = useSharedValue(0);

  const handleCloseFromGesture = useCallback(() => {
    gestureAnimatingRef.current = true;
    closeSidebar();
  }, [closeSidebar, gestureAnimatingRef]);

  const handleViewMore = useCallback(() => {
    if (!activeServerId) {
      return;
    }
    translateX.value = -windowWidth;
    backdropOpacity.value = 0;
    closeSidebar();
    handleViewMoreNavigate();
  }, [
    activeServerId,
    backdropOpacity,
    closeSidebar,
    handleViewMoreNavigate,
    translateX,
    windowWidth,
  ]);

  const handleWorkspacePress = useCallback(() => {
    closeSidebar();
  }, [closeSidebar]);

  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .withRef(closeGestureRef)
        .enabled(true)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (!touch) {
            return;
          }
          closeTouchStartX.value = touch.absoluteX;
          closeTouchStartY.value = touch.absoluteY;
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1) {
            stateManager.fail();
            return;
          }

          const deltaX = touch.absoluteX - closeTouchStartX.value;
          const deltaY = touch.absoluteY - closeTouchStartY.value;
          const absDeltaX = Math.abs(deltaX);
          const absDeltaY = Math.abs(deltaY);

          if (!canCloseLeftSidebarGesture(mobilePanelState.value)) {
            stateManager.fail();
            return;
          }

          if (deltaX >= 10) {
            stateManager.fail();
            return;
          }
          if (absDeltaY > 10 && absDeltaY > absDeltaX) {
            stateManager.fail();
            return;
          }
          if (deltaX <= -15 && absDeltaX > absDeltaY) {
            stateManager.activate();
          }
        })
        .onStart(() => {
          isGesturing.value = true;
        })
        .onUpdate((event) => {
          const newTranslateX = Math.min(0, Math.max(-windowWidth, event.translationX));
          translateX.value = newTranslateX;
          backdropOpacity.value = interpolate(
            newTranslateX,
            [-windowWidth, 0],
            [0, 1],
            Extrapolation.CLAMP,
          );
        })
        .onEnd((event) => {
          isGesturing.value = false;
          const shouldClose = event.translationX < -windowWidth / 3 || event.velocityX < -500;
          if (shouldClose) {
            animateToClose();
            runOnJS(handleCloseFromGesture)();
          } else {
            animateToOpen();
          }
        })
        .onFinalize(() => {
          isGesturing.value = false;
        }),
    [
      closeGestureRef,
      closeTouchStartX,
      closeTouchStartY,
      isGesturing,
      mobilePanelState,
      windowWidth,
      translateX,
      backdropOpacity,
      animateToClose,
      animateToOpen,
      handleCloseFromGesture,
    ],
  );

  const mobileSidebarInsetStyle = useMemo(
    () => ({ width: windowWidth, paddingTop: insetsTop, paddingBottom: insetsBottom }),
    [windowWidth, insetsTop, insetsBottom],
  );

  const hostStatusDotStyle = useMemo(
    () => [styles.hostStatusDot, { backgroundColor: activeHostStatusColor }],
    [activeHostStatusColor],
  );

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  let overlayPointerEvents: "auto" | "none" | "box-none";
  if (!isWeb) overlayPointerEvents = "box-none";
  else if (isOpen) overlayPointerEvents = "auto";
  else overlayPointerEvents = "none";

  const backdropStyle = useMemo(
    () => [
      staticStyles.backdrop,
      backdropAnimatedStyle,
      // pointerEvents is React-owned, not worklet-owned: Reanimated never
      // touches it, so a stale animated-prop revert can't wedge an invisible
      // tap-eating backdrop.
      { pointerEvents: isOpen ? ("auto" as const) : ("none" as const) },
    ],
    [backdropAnimatedStyle, isOpen],
  );
  const mobileSidebarStyle = useMemo(
    () => [
      staticStyles.mobileSidebar,
      mobileSidebarInsetStyle,
      sidebarAnimatedStyle,
      { backgroundColor: theme.colors.surfaceSidebar },
    ],
    [mobileSidebarInsetStyle, sidebarAnimatedStyle, theme.colors.surfaceSidebar],
  );
  // display is React-owned on the plain wrapper View (no animated styles), so
  // a hidden overlay stays hidden no matter what Reanimated's Fabric overlay
  // reverts the panel transform to after a heavy commit (reanimated#9635).
  const overlayStyle = useMemo(
    () => [
      StyleSheet.absoluteFillObject,
      { display: overlayVisible ? ("flex" as const) : ("none" as const) },
    ],
    [overlayVisible],
  );

  const scrollValue = useSidebarScrollProvider();

  return (
    <SidebarScrollContext.Provider value={scrollValue}>
      <View style={overlayStyle} pointerEvents={overlayPointerEvents}>
        <Animated.View style={backdropStyle} />

        <GestureDetector gesture={closeGesture} touchAction="pan-y">
          <Animated.View style={mobileSidebarStyle} pointerEvents="auto">
            <View style={styles.sidebarContent} pointerEvents="auto">
              <WorkspacesSectionHeader
                serverId={activeServerId}
                title={headerProjectName ?? undefined}
                projectTitle={projectSelectorRowEnabled}
                selectedProject={projectSelectorRowEnabled ? selectedSelectorRowProject : null}
                onSelectedProjectWorkspacePress={closeSidebar}
              />
              <Pressable
                style={styles.mobileCloseButton}
                onPress={closeSidebar}
                testID="sidebar-close"
                nativeID="sidebar-close"
                accessible
                accessibilityRole="button"
                accessibilityLabel={labels.closeSidebar}
                hitSlop={8}
              >
                {({ hovered, pressed }) => (
                  <X
                    size={theme.iconSize.md}
                    color={
                      hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted
                    }
                  />
                )}
              </Pressable>

              {isInitialLoad ? (
                <SidebarAgentListSkeleton />
              ) : (
                <SidebarWorkspaceList
                  serverId={activeServerId}
                  collapsedProjectKeys={collapsedProjectKeys}
                  onToggleProjectCollapsed={toggleProjectCollapsed}
                  shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
                  messageStatusCountsByWorkspaceKey={messageStatusCountsByWorkspaceKey}
                  groupMode={groupMode}
                  projects={projects}
                  projectSelectorRowEnabled={projectSelectorRowEnabled}
                  projectSelectorRowProject={selectedSelectorRowProject}
                  onProjectSelectorRowSelected={handleProjectSelectorRowSelect}
                  onProjectSelectorRowHover={handleProjectSelectorRowHover}
                  isRefreshing={isManualRefresh && isRevalidating}
                  onRefresh={handleRefresh}
                  onWorkspacePress={handleWorkspacePress}
                  onAddProject={handleOpenProject}
                  parentGestureRef={closeGestureRef}
                />
              )}

              <SidebarFooter
                theme={theme}
                activeServerId={activeServerId}
                activeHostLabel={activeHostLabel}
                hostStatusDotStyle={hostStatusDotStyle}
                hostOptions={hostOptions}
                hostTriggerRef={hostTriggerRef}
                isHostPickerOpen={isHostPickerOpen}
                setIsHostPickerOpen={setIsHostPickerOpen}
                handleHostSelect={handleHostSelect}
                renderHostOption={renderHostOption}
                handleViewMore={handleViewMore}
                handleOpenProject={handleOpenProject}
                handleHome={handleHome}
                handleSettings={handleSettings}
                labels={labels}
                isSessionsActive={isSessionsActive}
              />
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </SidebarScrollContext.Provider>
  );
}

function DesktopSidebar({
  theme,
  activeServerId,
  activeHostLabel,
  activeHostStatusColor,
  hostOptions,
  hostTriggerRef,
  isHostPickerOpen,
  setIsHostPickerOpen,
  projects,
  projectSelectorRowEnabled,
  selectedSelectorRowProject,
  headerProjectName,
  handleProjectSelectorRowSelect,
  handleProjectSelectorRowHover,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  messageStatusCountsByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleHostSelect,
  renderHostOption,
  handleOpenProject,
  handleHome,
  handleSettings,
  labels,
  insetsTop,
  isOpen,
  showVerticalTabs,
  handleViewMore,
}: DesktopSidebarProps) {
  const pathname = usePathname();
  const isSessionsActive = pathname.includes("/sessions");
  const padding = useWindowControlsPadding("sidebar");
  const sidebarWidth = usePanelStore((state) => state.sidebarWidth);
  const setSidebarWidth = usePanelStore((state) => state.setSidebarWidth);
  const verticalTabsSidebarWidth = usePanelStore((state) => state.verticalTabsSidebarWidth);
  const setVerticalTabsSidebarWidth = usePanelStore((state) => state.setVerticalTabsSidebarWidth);
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const badgeMode = useSidebarViewStore((state) =>
    activeServerId ? state.getTabBarBadgeMode(activeServerId) : "status",
  );
  const { width: viewportWidth } = useWindowDimensions();
  const hostStatusDotStyle = useMemo(
    () => [styles.hostStatusDot, { backgroundColor: activeHostStatusColor }],
    [activeHostStatusColor],
  );
  const hasActiveWorkspaceSelection =
    activeServerId !== null && activeWorkspaceSelection?.serverId === activeServerId;
  const showVerticalTabsSidebar = showVerticalTabs && hasActiveWorkspaceSelection;

  const startWidthRef = useRef(sidebarWidth);
  const resizeWidth = useSharedValue(sidebarWidth);
  const startVerticalTabsWidthRef = useRef(verticalTabsSidebarWidth);
  const resizeVerticalTabsWidth = useSharedValue(verticalTabsSidebarWidth);

  useEffect(() => {
    resizeWidth.value = sidebarWidth;
  }, [sidebarWidth, resizeWidth]);
  useEffect(() => {
    resizeVerticalTabsWidth.value = verticalTabsSidebarWidth;
  }, [resizeVerticalTabsWidth, verticalTabsSidebarWidth]);

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 8, right: 8, top: 0, bottom: 0 })
        .onStart(() => {
          startWidthRef.current = sidebarWidth;
          resizeWidth.value = sidebarWidth;
        })
        .onUpdate((event) => {
          // Dragging right (positive translationX) increases width
          const newWidth = startWidthRef.current + event.translationX;
          const reservedTabsWidth = showVerticalTabsSidebar ? verticalTabsSidebarWidth : 0;
          const maxWidth = Math.max(
            MIN_SIDEBAR_WIDTH,
            Math.min(MAX_SIDEBAR_WIDTH, viewportWidth - MIN_CHAT_WIDTH - reservedTabsWidth),
          );
          const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, newWidth));
          resizeWidth.value = clampedWidth;
        })
        .onEnd(() => {
          runOnJS(setSidebarWidth)(resizeWidth.value);
        }),
    [
      resizeWidth,
      setSidebarWidth,
      showVerticalTabsSidebar,
      sidebarWidth,
      verticalTabsSidebarWidth,
      viewportWidth,
    ],
  );

  const resizeAnimatedStyle = useAnimatedStyle(() => ({
    width: resizeWidth.value,
  }));
  const effectiveSidebarWidth = isOpen ? sidebarWidth : 0;
  const verticalTabsResizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 8, right: 8, top: 0, bottom: 0 })
        .onStart(() => {
          startVerticalTabsWidthRef.current = verticalTabsSidebarWidth;
          resizeVerticalTabsWidth.value = verticalTabsSidebarWidth;
        })
        .onUpdate((event) => {
          const newWidth = startVerticalTabsWidthRef.current + event.translationX;
          const maxWidth = Math.max(
            MIN_VERTICAL_TABS_SIDEBAR_WIDTH,
            Math.min(
              MAX_VERTICAL_TABS_SIDEBAR_WIDTH,
              viewportWidth - MIN_CHAT_WIDTH - effectiveSidebarWidth,
            ),
          );
          const clampedWidth = Math.max(
            MIN_VERTICAL_TABS_SIDEBAR_WIDTH,
            Math.min(maxWidth, newWidth),
          );
          resizeVerticalTabsWidth.value = clampedWidth;
        })
        .onEnd(() => {
          runOnJS(setVerticalTabsSidebarWidth)(resizeVerticalTabsWidth.value);
        }),
    [
      effectiveSidebarWidth,
      resizeVerticalTabsWidth,
      setVerticalTabsSidebarWidth,
      verticalTabsSidebarWidth,
      viewportWidth,
    ],
  );

  const verticalTabsResizeAnimatedStyle = useAnimatedStyle(() => ({
    width: resizeVerticalTabsWidth.value,
  }));

  const paddingTopSpacerStyle = useMemo(() => ({ height: padding.top }), [padding.top]);
  const desktopSidebarStyle = useMemo(
    () => [staticStyles.desktopSidebar, resizeAnimatedStyle],
    [resizeAnimatedStyle],
  );
  const desktopSidebarBorderStyle = useMemo(
    () => [styles.desktopSidebarBorder, { flex: 1, paddingTop: insetsTop }],
    [insetsTop],
  );
  const resizeHandleStyle = useMemo(
    () => [styles.resizeHandle, isWeb && ({ cursor: "col-resize" } as object)],
    [],
  );
  const selectedWorkspace = useMemo(
    () =>
      findSelectedWorkspace({
        projects,
        activeServerId,
        activeWorkspaceSelection,
      }),
    [activeServerId, activeWorkspaceSelection, projects],
  );
  const verticalTabsSidebarStyle = useMemo(
    () => [styles.verticalTabsSidebar, verticalTabsResizeAnimatedStyle],
    [verticalTabsResizeAnimatedStyle],
  );

  const scrollValue = useSidebarScrollProvider();

  if (!isOpen && !showVerticalTabsSidebar) {
    return null;
  }

  return (
    <SidebarScrollContext.Provider value={scrollValue}>
      <View style={styles.desktopSidebarShell}>
        {isOpen ? (
          <Animated.View style={desktopSidebarStyle}>
            <View style={desktopSidebarBorderStyle}>
              <View style={styles.sidebarDragArea}>
                <TitlebarDragRegion />
                {padding.top > 0 ? <View style={paddingTopSpacerStyle} /> : null}
              </View>
              <WorkspacesSectionHeader
                serverId={activeServerId}
                title={headerProjectName ?? undefined}
                projectTitle={projectSelectorRowEnabled}
                selectedProject={projectSelectorRowEnabled ? selectedSelectorRowProject : null}
              />

              {isInitialLoad ? (
                <SidebarAgentListSkeleton />
              ) : (
                <SidebarWorkspaceList
                  serverId={activeServerId}
                  collapsedProjectKeys={collapsedProjectKeys}
                  onToggleProjectCollapsed={toggleProjectCollapsed}
                  shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
                  messageStatusCountsByWorkspaceKey={messageStatusCountsByWorkspaceKey}
                  groupMode={groupMode}
                  projects={projects}
                  projectSelectorRowEnabled={projectSelectorRowEnabled}
                  projectSelectorRowProject={selectedSelectorRowProject}
                  onProjectSelectorRowSelected={handleProjectSelectorRowSelect}
                  onProjectSelectorRowHover={handleProjectSelectorRowHover}
                  isRefreshing={isManualRefresh && isRevalidating}
                  onRefresh={handleRefresh}
                  onAddProject={handleOpenProject}
                />
              )}

              <SidebarCalloutSlot />

              <SidebarFooter
                theme={theme}
                activeServerId={activeServerId}
                activeHostLabel={activeHostLabel}
                hostStatusDotStyle={hostStatusDotStyle}
                hostOptions={hostOptions}
                hostTriggerRef={hostTriggerRef}
                isHostPickerOpen={isHostPickerOpen}
                setIsHostPickerOpen={setIsHostPickerOpen}
                handleHostSelect={handleHostSelect}
                renderHostOption={renderHostOption}
                handleViewMore={handleViewMore}
                handleOpenProject={handleOpenProject}
                handleHome={handleHome}
                handleSettings={handleSettings}
                labels={labels}
                isSessionsActive={isSessionsActive}
              />

              <GestureDetector gesture={resizeGesture}>
                <View style={resizeHandleStyle} />
              </GestureDetector>
            </View>
          </Animated.View>
        ) : null}
        {showVerticalTabsSidebar ? (
          <VerticalTabsSidebar
            style={verticalTabsSidebarStyle}
            selectedWorkspace={selectedWorkspace}
            badgeMode={badgeMode}
            onWorkspacePress={undefined}
            resizeGesture={verticalTabsResizeGesture}
            resizeHandleStyle={resizeHandleStyle}
          />
        ) : null}
      </View>
    </SidebarScrollContext.Provider>
  );
}

function findSelectedWorkspace({
  projects,
  activeServerId,
  activeWorkspaceSelection,
}: {
  projects: SidebarProjectEntry[];
  activeServerId: string | null;
  activeWorkspaceSelection: ReturnType<typeof useActiveWorkspaceSelection>;
}): SidebarWorkspaceEntry | null {
  if (!activeServerId || activeWorkspaceSelection?.serverId !== activeServerId) {
    return null;
  }
  for (const project of projects) {
    const workspace = project.workspaces.find(
      (entry) => entry.workspaceId === activeWorkspaceSelection.workspaceId,
    );
    if (workspace) {
      return workspace;
    }
  }
  return null;
}

function VerticalTabsSidebar({
  style,
  selectedWorkspace,
  badgeMode,
  onWorkspacePress,
  resizeGesture,
  resizeHandleStyle,
}: {
  style: ComponentProps<typeof Animated.View>["style"];
  selectedWorkspace: SidebarWorkspaceEntry | null;
  badgeMode: SidebarBadgeMode;
  onWorkspacePress?: () => void;
  resizeGesture: ReturnType<typeof Gesture.Pan>;
  resizeHandleStyle: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  return (
    <Animated.View style={style}>
      <View style={styles.verticalTabsSidebarBorder}>
        <View style={styles.verticalTabsHeader}>
          <Text style={styles.verticalTabsTitle}>{t("sidebar.workspace.embeddedTabs.title")}</Text>
          {selectedWorkspace ? (
            <SidebarVerticalWorkspaceTabsHeaderActions
              workspace={selectedWorkspace}
              onWorkspacePress={onWorkspacePress}
            />
          ) : null}
        </View>
        <View style={styles.verticalTabsBody}>
          {selectedWorkspace ? (
            <SidebarVerticalWorkspaceTabs
              workspace={selectedWorkspace}
              badgeMode={badgeMode}
              onWorkspacePress={onWorkspacePress}
            />
          ) : (
            <View style={styles.verticalTabsEmpty}>
              <Text style={styles.verticalTabsEmptyText}>
                {t("sidebar.workspace.embeddedTabs.noWorkspaceSelected")}
              </Text>
            </View>
          )}
        </View>
        <GestureDetector gesture={resizeGesture}>
          <View style={resizeHandleStyle} />
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

function WorkspacesSectionHeader({
  serverId,
  title = "Workspaces",
  projectTitle = false,
  selectedProject = null,
  onSelectedProjectWorkspacePress,
}: {
  serverId: string | null;
  title?: string;
  projectTitle?: boolean;
  selectedProject?: SidebarProjectEntry | null;
  onSelectedProjectWorkspacePress?: () => void;
}) {
  const { theme } = useUnistyles();
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const commandCenterKeys = useShortcutKeys("toggle-command-center");
  const handleSearchPress = useCallback(() => setCommandCenterOpen(true), [setCommandCenterOpen]);
  const searchButtonStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.workspacesHeaderIconButton,
      (hovered || pressed) && styles.workspacesHeaderIconButtonHovered,
    ],
    [],
  );
  const { isScrolled } = useSidebarScroll();
  const headerStyle = useMemo(
    () => [styles.workspacesSectionHeader, isScrolled && styles.workspacesSectionHeaderScrolled],
    [isScrolled],
  );
  const titleStyle = useMemo(
    () => [styles.workspacesSectionTitle, projectTitle && styles.workspacesProjectTitle],
    [projectTitle],
  );

  return (
    <View style={headerStyle}>
      <Text style={titleStyle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.workspacesSectionActions}>
        {selectedProject ? (
          <SidebarSelectedProjectHeaderActions
            project={selectedProject}
            serverId={serverId}
            onWorkspacePress={onSelectedProjectWorkspacePress}
          />
        ) : null}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open command center"
              testID="sidebar-command-center-search"
              style={searchButtonStyle}
              onPress={handleSearchPress}
            >
              {({ hovered, pressed }) => (
                <Search
                  size={14}
                  color={
                    hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted
                  }
                />
              )}
            </Pressable>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <HeaderIconTooltipContent label="Search" shortcutKeys={commandCenterKeys} />
          </TooltipContent>
        </Tooltip>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <View>
              <SidebarGroupingSelector serverId={serverId} />
            </View>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <HeaderIconTooltipContent label="Display preferences" />
          </TooltipContent>
        </Tooltip>
      </View>
    </View>
  );
}

// Static styles for Animated.Views — must NOT use Unistyles dynamic theme to
// avoid the "Unable to find node on an unmounted component" crash when Unistyles
// tries to patch the native node that Reanimated also manages.
const staticStyles = RNStyleSheet.create({
  backdrop: {
    ...RNStyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  mobileSidebar: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    overflow: "hidden" as const,
  },
  desktopSidebar: {
    position: "relative" as const,
  },
});

const styles = StyleSheet.create((theme) => ({
  sidebarHeaderGroup: {
    paddingTop: theme.spacing[2],
    gap: 2,
    // Distance from History's bottom edge to the divider. WorkspacesSectionHeader
    // uses a slightly smaller paddingTop to balance the action buttons' centering
    // offset so the divider reads as visually centered between the two.
    paddingBottom: theme.spacing[1.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  workspacesSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    // Align the title with the compact rows' icons and the project icons below
    // (listContent + projectRow inner padding both spacing[2]).
    paddingLeft: theme.spacing[2] + theme.spacing[2],
    // Align the trailing action pill's right edge with the New workspace and
    // project row pills (both 8px from the sidebar edge).
    paddingRight: theme.spacing[2],
    // Less than sidebarHeaderGroup's paddingBottom: the 28px-tall action buttons
    // center the title and add their own offset above it, so equal padding reads
    // as a larger gap than History's. Trim paddingTop to balance it visually.
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  workspacesSectionHeaderScrolled: {
    borderBottomColor: theme.colors.border,
  },
  workspacesSectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  // Project selector row replaces the muted section label with the selected
  // project's name using the same typography as project rows.
  workspacesProjectTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
  workspacesSectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  workspacesHeaderIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  workspacesHeaderIconButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  sidebarContent: {
    flex: 1,
    minHeight: 0,
  },
  desktopSidebarShell: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  mobileCloseButton: {
    position: "absolute",
    top: theme.spacing[3],
    right: theme.spacing[4],
    zIndex: 2,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  desktopSidebarBorder: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  verticalTabsSidebar: {
    position: "relative",
  },
  verticalTabsSidebarBorder: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  verticalTabsHeader: {
    minHeight: 37,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  verticalTabsTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    flex: 1,
    minWidth: 0,
  },
  verticalTabsBody: {
    flex: 1,
    minHeight: 0,
    paddingTop: theme.spacing[1],
  },
  verticalTabsEmpty: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
  },
  verticalTabsEmptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
  },
  resizeHandle: {
    position: "absolute",
    right: -5,
    top: 0,
    bottom: 0,
    width: 10,
    zIndex: 10,
  },
  sidebarDragArea: {
    position: "relative",
  },
  hostTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[2],
    minWidth: 0,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  hostTriggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  hostStatusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
  hostTriggerText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
    minWidth: 0,
  },
  sidebarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerHostSlot: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    marginRight: theme.spacing[2],
  },
  footerIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  footerIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  hostPickerList: {
    gap: theme.spacing[2],
  },
  hostPickerOption: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  hostPickerOptionText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  hostPickerCancel: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  hostPickerCancelText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.popoverForeground,
  },
}));
