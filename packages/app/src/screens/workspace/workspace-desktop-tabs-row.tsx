import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PressableStateCallbackType,
} from "react-native";
import {
  CopyX,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronDown,
  Columns2,
  Copy,
  Pencil,
  RotateCw,
  Rows2,
  Globe,
  MoreVertical,
  Plus,
  Settings2,
  SquarePen,
  SquareTerminal,
  X,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useRouter, type Href } from "expo-router";
import { SortableInlineList } from "@/components/sortable-inline-list";
import type {
  DraggableListDragHandleProps,
  DraggableRenderItemInfo,
} from "@/components/draggable-list.types";
import { isNative, isWeb } from "@/constants/platform";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  useContextMenu,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { useWorkspaceTabLayout } from "@/screens/workspace/use-workspace-tab-layout";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import { WorkspaceTabTooltipPreview } from "@/screens/workspace/workspace-tab-tooltip-preview";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";
import {
  buildWorkspaceDesktopTabActions,
  type WorkspaceDesktopTabActions,
  type WorkspaceTabMenuEntry,
  type WorkspaceTabMenuLabels,
} from "@/screens/workspace/workspace-tab-menu";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { RecentlyClosedWorkspaceTab } from "@/stores/workspace-layout-store";
import type { Theme } from "@/styles/theme";
import { RenderProfile } from "@/utils/render-profiler";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useAppSettings } from "@/hooks/use-settings";
import { SidebarDisplayPreferencesMenuSections } from "@/components/sidebar/sidebar-grouping-selector";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import {
  getTerminalProfileIcon,
  resolveTerminalProfiles,
} from "@getpaseo/protocol/terminal-profiles";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import type { TerminalProfileInput } from "@/screens/workspace/terminals/use-workspace-terminals";
import { ProfileIcon, usePinnedLaunchers } from "@/workspace-pins/launch";
import { runPinnedTabTarget, type TabTargetHandlers } from "@/workspace-pins/run";
import type { PinnedTabTarget } from "@/workspace-pins/target";
import { PinnedTargetsRow } from "@/workspace-pins/pinned-targets-row";
import { PinnableMenuItem } from "@/workspace-pins/pinnable-menu-item";

const DROPDOWN_WIDTH = 220;
const LOADING_TAB_LABEL_SKELETON_WIDTH = 80;
const DEFAULT_INLINE_ADD_BUTTON_RESERVED_WIDTH = 36;

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedX = withUnistyles(X);
const ThemedCopy = withUnistyles(Copy);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedArrowLeftToLine = withUnistyles(ArrowLeftToLine);
const ThemedArrowRightToLine = withUnistyles(ArrowRightToLine);
const ThemedCopyX = withUnistyles(CopyX);
const ThemedPencil = withUnistyles(Pencil);
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedSquareTerminal = withUnistyles(SquareTerminal);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedGlobe = withUnistyles(Globe);
const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedColumns2 = withUnistyles(Columns2);
const ThemedRows2 = withUnistyles(Rows2);
const ThemedPlus = withUnistyles(Plus);
const ThemedSettings2 = withUnistyles(Settings2);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const AGENT_ICON = <ThemedSquarePen size={14} uniProps={mutedColorMapping} />;
const TERMINAL_ICON = <ThemedSquareTerminal size={14} uniProps={mutedColorMapping} />;
const BROWSER_ICON = <ThemedGlobe size={14} uniProps={mutedColorMapping} />;

const DRAFT_TARGET: PinnedTabTarget = { kind: "draft" };
const TERMINAL_TARGET: PinnedTabTarget = { kind: "terminal" };
const BROWSER_TARGET: PinnedTabTarget = { kind: "browser" };

function newTabActionButtonStyle({ hovered, pressed }: PressableStateCallbackType) {
  return [styles.newTabActionButton, (hovered || pressed) && styles.newTabActionButtonHovered];
}

function inlineAddActionButtonStyle({ hovered, pressed }: PressableStateCallbackType) {
  return [styles.inlineAddActionButton, (hovered || pressed) && styles.newTabActionButtonHovered];
}

function tabOverflowButtonStyle({ hovered, pressed }: PressableStateCallbackType) {
  return [styles.tabOverflowButton, (hovered || pressed) && styles.tabCloseButtonActive];
}

function updateMeasuredWidth(setWidth: Dispatch<SetStateAction<number>>, event: LayoutChangeEvent) {
  const nextWidth = Math.round(event.nativeEvent.layout.width);
  setWidth((current) => (Math.abs(current - nextWidth) > 1 ? nextWidth : current));
}

function shouldDisableTabReorder(input: {
  disableReorderTabs: boolean;
  externalDndContext: boolean;
  tabCount: number;
}): boolean {
  return input.disableReorderTabs || (!input.externalDndContext && input.tabCount < 2);
}

function reorderTabsWhenEnabled(input: {
  disableReorderTabs: boolean;
  nextTabs: WorkspaceDesktopTabRowItem[];
  onReorderTabs: (nextTabs: WorkspaceTabDescriptor[]) => void;
}): void {
  if (input.disableReorderTabs) {
    return;
  }
  input.onReorderTabs(input.nextTabs.map((tab) => tab.tab));
}

function ProfileLeadingIcon({ iconKey }: { iconKey: string | undefined }) {
  return (
    <View style={styles.terminalProfileIconWrapper}>
      <ProfileIcon iconKey={iconKey} />
    </View>
  );
}

interface PinnableProfileMenuItemProps {
  profile: { id: string; name: string; command: string; args?: string[]; icon?: string };
  disabled?: boolean;
  onLaunch: (target: PinnedTabTarget) => void;
}

function PinnableProfileMenuItem({ profile, disabled, onLaunch }: PinnableProfileMenuItemProps) {
  const target = useMemo<PinnedTabTarget>(
    () => ({ kind: "profile", profileId: profile.id }),
    [profile.id],
  );
  const leading = useMemo(
    () => <ProfileLeadingIcon iconKey={getTerminalProfileIcon(profile)} />,
    [profile],
  );
  const handleSelect = useCallback(() => onLaunch(target), [onLaunch, target]);

  return (
    <PinnableMenuItem
      target={target}
      label={profile.name}
      leading={leading}
      disabled={disabled}
      onSelect={handleSelect}
    />
  );
}

interface WorkspaceInlineAddTabButtonProps {
  shortcutKeys: ShortcutKey[][] | null;
  recentlyClosedTabs: RecentlyClosedWorkspaceTab[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onCreateAgentTab: () => void;
  onRestoreClosedTab: (entryKey: string) => void;
  onLayout: (event: LayoutChangeEvent) => void;
}

function WorkspaceInlineAddTabButton({
  shortcutKeys,
  recentlyClosedTabs,
  normalizedServerId,
  normalizedWorkspaceId,
  onCreateAgentTab,
  onRestoreClosedTab,
  onLayout,
}: WorkspaceInlineAddTabButtonProps) {
  const { t } = useTranslation();
  const tooltipText = t("workspace.tabs.actions.newAgent");
  const fallbackTabLabels = useMemo(
    () => ({
      newAgent: t("workspace.tabs.fallback.newAgent"),
      setup: t("workspace.tabs.fallback.setup"),
      terminal: t("workspace.tabs.fallback.terminal"),
      agent: t("workspace.tabs.fallback.agent"),
    }),
    [t],
  );

  return (
    <View style={styles.inlineAddButton} onLayout={onLayout}>
      <ContextMenu>
        <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild triggerRefProp="triggerRef">
            <ContextMenuTrigger
              testID="workspace-new-agent-tab-inline"
              onPress={onCreateAgentTab}
              accessibilityRole="button"
              accessibilityLabel={tooltipText}
              enabledOnMobile={false}
              style={inlineAddActionButtonStyle}
            >
              <ThemedPlus size={14} uniProps={mutedColorMapping} />
            </ContextMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <View style={styles.newTabTooltipRow}>
              <Text style={styles.newTabTooltipText}>{tooltipText}</Text>
              {shortcutKeys ? (
                <Shortcut chord={shortcutKeys} style={styles.newTabTooltipShortcut} />
              ) : null}
            </View>
          </TooltipContent>
        </Tooltip>
        <ContextMenuContent
          align="start"
          minWidth={220}
          testID="workspace-recently-closed-tabs-menu"
        >
          <ContextMenuLabel>{t("workspace.tabs.recentlyClosed.title")}</ContextMenuLabel>
          {recentlyClosedTabs.length === 0 ? (
            <ContextMenuItem testID="workspace-recently-closed-tabs-empty" disabled>
              {t("workspace.tabs.recentlyClosed.empty")}
            </ContextMenuItem>
          ) : (
            recentlyClosedTabs.map((entry) => (
              <RecentlyClosedTabMenuItem
                key={entry.key}
                entry={entry}
                normalizedServerId={normalizedServerId}
                normalizedWorkspaceId={normalizedWorkspaceId}
                fallbackLabels={fallbackTabLabels}
                onRestoreClosedTab={onRestoreClosedTab}
              />
            ))
          )}
        </ContextMenuContent>
      </ContextMenu>
    </View>
  );
}

function RecentlyClosedTabMenuItemResolved({
  entryKey,
  label,
  presentation,
  onSelect,
}: {
  entryKey: string;
  label: string;
  presentation: WorkspaceTabPresentation;
  onSelect: () => void;
}) {
  const leading = useMemo(
    () => <WorkspaceTabIcon presentation={presentation} active={false} />,
    [presentation],
  );
  return (
    <ContextMenuItem
      testID={`workspace-recently-closed-tab-${entryKey}`}
      leading={leading}
      onSelect={onSelect}
    >
      {label}
    </ContextMenuItem>
  );
}

function RecentlyClosedTabMenuItem({
  entry,
  normalizedServerId,
  normalizedWorkspaceId,
  fallbackLabels,
  onRestoreClosedTab,
}: {
  entry: RecentlyClosedWorkspaceTab;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  fallbackLabels: { newAgent: string; setup: string; terminal: string; agent: string };
  onRestoreClosedTab: (entryKey: string) => void;
}) {
  const tab = useMemo<WorkspaceTabDescriptor>(
    () => ({
      key: entry.tab.tabId,
      tabId: entry.tab.tabId,
      kind: entry.tab.target.kind,
      target: entry.tab.target,
    }),
    [entry.tab],
  );
  const handleSelect = useCallback(() => {
    onRestoreClosedTab(entry.key);
  }, [entry.key, onRestoreClosedTab]);

  return (
    <WorkspaceTabPresentationResolver
      tab={tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {(presentation) => {
        const label =
          presentation.titleState === "loading"
            ? getFallbackTabLabel(tab, fallbackLabels)
            : presentation.label;
        return (
          <RecentlyClosedTabMenuItemResolved
            entryKey={entry.key}
            label={label}
            presentation={presentation}
            onSelect={handleSelect}
          />
        );
      }}
    </WorkspaceTabPresentationResolver>
  );
}

export interface WorkspaceNewTabDropdownProps {
  onCreateAgentTab: () => void;
  onCreateTerminal: () => void;
  onCreateBrowser: () => void;
  onCreateTerminalWithProfile: (profile: TerminalProfileInput) => void;
  onEditProfiles: () => void;
  normalizedServerId: string;
  showCreateBrowserTab: boolean;
  terminalDisabled: boolean;
  testIDPrefix?: string;
}

export function WorkspaceNewTabDropdown({
  onCreateAgentTab,
  onCreateTerminal,
  onCreateBrowser,
  onCreateTerminalWithProfile,
  onEditProfiles,
  normalizedServerId,
  showCreateBrowserTab,
  terminalDisabled,
  testIDPrefix = "workspace-new-tab-menu",
}: WorkspaceNewTabDropdownProps) {
  const { t } = useTranslation();
  const { config } = useDaemonConfig(normalizedServerId);
  const profiles = useMemo(
    () => resolveTerminalProfiles(config?.terminalProfiles),
    [config?.terminalProfiles],
  );

  const handlers = useMemo<TabTargetHandlers>(
    () => ({
      createDraft: onCreateAgentTab,
      createTerminal: onCreateTerminal,
      createBrowser: onCreateBrowser,
      createTerminalWithProfile: onCreateTerminalWithProfile,
    }),
    [onCreateAgentTab, onCreateBrowser, onCreateTerminal, onCreateTerminalWithProfile],
  );

  const onLaunch = useCallback(
    (target: PinnedTabTarget) => {
      runPinnedTabTarget(target, profiles, handlers);
    },
    [handlers, profiles],
  );

  return (
    <DropdownMenu>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild triggerRefProp="triggerRef">
          <DropdownMenuTrigger
            testID={`${testIDPrefix}-trigger`}
            accessibilityRole="button"
            accessibilityLabel={t("workspace.tabs.actions.moreActions")}
            style={newTabActionButtonStyle}
          >
            <ThemedChevronDown size={14} uniProps={mutedColorMapping} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <Text style={styles.newTabTooltipText}>{t("workspace.tabs.actions.moreActions")}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end" offset={4} minWidth={200}>
        <PinnableMenuItem
          testID={`${testIDPrefix}-agent`}
          target={DRAFT_TARGET}
          label={t("workspace.tabs.actions.newAgent")}
          leading={AGENT_ICON}
          onSelect={onCreateAgentTab}
        />
        <PinnableMenuItem
          testID={`${testIDPrefix}-terminal`}
          target={TERMINAL_TARGET}
          label={t("workspace.tabs.actions.newTerminal")}
          leading={TERMINAL_ICON}
          disabled={terminalDisabled}
          onSelect={terminalDisabled ? undefined : onCreateTerminal}
        />
        {showCreateBrowserTab ? (
          <PinnableMenuItem
            testID={`${testIDPrefix}-browser`}
            target={BROWSER_TARGET}
            label={t("workspace.tabs.actions.newBrowser")}
            leading={BROWSER_ICON}
            onSelect={onCreateBrowser}
          />
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("workspace.tabs.actions.terminalProfilesMenu")}</DropdownMenuLabel>
        {profiles.map((profile) => (
          <PinnableProfileMenuItem
            key={profile.id}
            profile={profile}
            disabled={terminalDisabled}
            onLaunch={onLaunch}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem testID={`${testIDPrefix}-edit-profiles`} onSelect={onEditProfiles}>
          {t("workspace.tabs.actions.editTerminalProfiles")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceTabRowExtras(props: WorkspaceNewTabDropdownProps) {
  const onLaunch = useWorkspaceNewTabDropdownLauncher(props);
  const launchers = usePinnedLaunchers({
    serverId: props.normalizedServerId,
    onLaunch,
  });
  return (
    <>
      <WorkspaceNewTabDropdown {...props} />
      <PinnedTargetsRow launchers={launchers} testIdPrefix="workspace-pinned-target" />
    </>
  );
}

function useWorkspaceNewTabDropdownLauncher({
  onCreateAgentTab,
  onCreateTerminal,
  onCreateBrowser,
  onCreateTerminalWithProfile,
  normalizedServerId,
}: WorkspaceNewTabDropdownProps) {
  const { config } = useDaemonConfig(normalizedServerId);
  const profiles = useMemo(
    () => resolveTerminalProfiles(config?.terminalProfiles),
    [config?.terminalProfiles],
  );
  const handlers = useMemo<TabTargetHandlers>(
    () => ({
      createDraft: onCreateAgentTab,
      createTerminal: onCreateTerminal,
      createBrowser: onCreateBrowser,
      createTerminalWithProfile: onCreateTerminalWithProfile,
    }),
    [onCreateAgentTab, onCreateBrowser, onCreateTerminal, onCreateTerminalWithProfile],
  );
  return useCallback(
    (target: PinnedTabTarget) => {
      runPinnedTabTarget(target, profiles, handlers);
    },
    [handlers, profiles],
  );
}

interface WorkspaceTabDisplayMenuProps {
  normalizedServerId: string;
  verticalTabsSelected: boolean;
  orientation: "horizontal" | "vertical";
  onVerticalTabsChange: (selected: boolean) => void;
}

function WorkspaceTabDisplayMenu({
  normalizedServerId,
  verticalTabsSelected,
  orientation,
  onVerticalTabsChange,
}: WorkspaceTabDisplayMenuProps) {
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const showVerticalDisplaySections = settings.tabLayoutMode === "vertical";
  const showVerticalTabsToggle = orientation === "vertical";
  const handleToggleVerticalTabs = useCallback(() => {
    onVerticalTabsChange(!verticalTabsSelected);
  }, [onVerticalTabsChange, verticalTabsSelected]);

  return (
    <DropdownMenu>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild triggerRefProp="triggerRef">
          <DropdownMenuTrigger
            testID="workspace-tab-display-menu-trigger"
            accessibilityRole="button"
            accessibilityLabel="Display preferences"
            style={newTabActionButtonStyle}
          >
            <ThemedSettings2 size={14} uniProps={mutedColorMapping} />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <Text style={styles.newTabTooltipText}>Display preferences</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="bottom" align="end" offset={4} minWidth={200}>
        {showVerticalTabsToggle ? (
          <>
            <DropdownMenuItem
              testID="workspace-display-menu-vertical-tabs"
              selected={verticalTabsSelected}
              showSelectedCheck
              onSelect={handleToggleVerticalTabs}
            >
              {t("workspace.tabs.actions.verticalTabs")}
            </DropdownMenuItem>
            {showVerticalDisplaySections ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {orientation === "horizontal" || showVerticalDisplaySections ? (
          <SidebarDisplayPreferencesMenuSections
            serverId={normalizedServerId}
            showTabControls
            showRecentTabCount={orientation === "vertical"}
            showSidebarBadge={orientation === "vertical"}
            badgePreference={orientation === "vertical" ? "tabBar" : "sidebar"}
            closeOnSelect={false}
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TabContextMenuItem({
  entry,
}: {
  entry: Extract<WorkspaceTabMenuEntry, { kind: "item" }>;
}) {
  const iconStyle = entry.iconRotation === "clockwise-90" ? styles.rotatedMenuIcon : undefined;
  const leading = useMemo(() => {
    switch (entry.icon) {
      case "copy":
        return <ThemedCopy size={16} uniProps={mutedColorMapping} />;
      case "rotate-cw":
        return <ThemedRotateCw size={16} uniProps={mutedColorMapping} />;
      case "arrow-left-to-line":
        return <ThemedArrowLeftToLine size={16} style={iconStyle} uniProps={mutedColorMapping} />;
      case "arrow-right-to-line":
        return <ThemedArrowRightToLine size={16} style={iconStyle} uniProps={mutedColorMapping} />;
      case "copy-x":
        return <ThemedCopyX size={16} uniProps={mutedColorMapping} />;
      case "pencil":
        return <ThemedPencil size={16} uniProps={mutedColorMapping} />;
      case "x":
        return <ThemedX size={16} uniProps={mutedColorMapping} />;
      default:
        return undefined;
    }
  }, [entry.icon, iconStyle]);
  const trailing = useMemo(
    () => (entry.hint ? <Text style={styles.menuItemHint}>{entry.hint}</Text> : undefined),
    [entry.hint],
  );
  return (
    <ContextMenuItem
      testID={entry.testID}
      disabled={entry.disabled}
      destructive={entry.destructive}
      onSelect={entry.onSelect}
      tooltip={entry.tooltip}
      leading={leading}
      trailing={trailing}
    >
      {entry.label}
    </ContextMenuItem>
  );
}

function tabKeyExtractor(tab: WorkspaceDesktopTabRowItem) {
  return `${tab.tab.key}:${tab.tab.kind}`;
}

export interface WorkspaceDesktopTabRowItem {
  tab: WorkspaceTabDescriptor;
  isActive: boolean;
  isCloseHovered: boolean;
  isClosingTab: boolean;
}

interface SplitActionButtonProps {
  onPress: () => void;
  label: string;
  shortcutKeys: ShortcutKey[][] | null;
  icon: "split-right" | "split-down";
}

function SplitActionButton({ onPress, label, shortcutKeys, icon }: SplitActionButtonProps) {
  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={newTabActionButtonStyle}
      >
        {icon === "split-right" ? (
          <ThemedColumns2 size={14} uniProps={mutedColorMapping} />
        ) : (
          <ThemedRows2 size={14} uniProps={mutedColorMapping} />
        )}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center" offset={8}>
        <View style={styles.newTabTooltipRow}>
          <Text style={styles.newTabTooltipText}>{label}</Text>
          {shortcutKeys ? (
            <Shortcut chord={shortcutKeys} style={styles.newTabTooltipShortcut} />
          ) : null}
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

interface WorkspaceDesktopTabsRowProps {
  paneId?: string;
  isFocused?: boolean;
  tabs: WorkspaceDesktopTabRowItem[];
  recentlyClosedTabs: RecentlyClosedWorkspaceTab[];
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  onRestoreClosedTab: (entryKey: string) => void;
  onCreateDraftTab: (input: { paneId?: string }) => void;
  onCreateTerminalTab: (input: { paneId?: string; profile?: TerminalProfileInput }) => void;
  onCreateBrowserTab: (input: { paneId?: string }) => void;
  showCreateBrowserTab?: boolean;
  disableCreateTerminal?: boolean;
  isWaitingOnTerminalReadiness?: boolean;
  onReorderTabs: (nextTabs: WorkspaceTabDescriptor[]) => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  tabBarOrientation?: "horizontal" | "vertical";
  verticalTabsSelected?: boolean;
  onVerticalTabsChange?: (selected: boolean) => void;
  externalDndContext?: boolean;
  activeDragTabId?: string | null;
  tabDropPreviewIndex?: number | null;
  disableReorderTabs?: boolean;
  showPaneSplitActions?: boolean;
}

function getFallbackTabLabel(
  tab: WorkspaceTabDescriptor,
  labels: { newAgent: string; setup: string; terminal: string; agent: string },
): string {
  if (tab.target.kind === "draft") {
    return labels.newAgent;
  }
  if (tab.target.kind === "setup") {
    return labels.setup;
  }
  if (tab.target.kind === "terminal") {
    return labels.terminal;
  }
  if (tab.target.kind === "file") {
    return tab.target.path.split("/").findLast(Boolean) ?? tab.target.path;
  }
  return labels.agent;
}

function useShowVerticalStatusBadge(serverId: string): boolean {
  return useSidebarViewStore((state) => state.getTabBarBadgeMode(serverId) === "status");
}

function useVerticalScrollState(isVertical: boolean) {
  const [isScrolled, setIsScrolled] = useState(false);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setIsScrolled((current) => {
      const next = offsetY > 0;
      return current === next ? current : next;
    });
  }, []);
  return { isScrolled, onScroll: isVertical ? onScroll : undefined };
}

function buildTabsHeaderStyles(input: { isVertical: boolean; isScrolled: boolean }) {
  const result: unknown[] = [styles.tabsHeader];
  if (input.isVertical) {
    result.push(styles.tabsHeaderVertical);
    if (input.isScrolled) result.push(styles.tabsHeaderVerticalScrolled);
  }
  return result as React.ComponentProps<typeof View>["style"];
}

function useMiddleClickClose(onClose: () => void) {
  const [node, setNode] = useState<View | null>(null);
  const ref = useCallback((nextNode: View | null) => {
    setNode(nextNode);
  }, []);

  useEffect(() => {
    if (isNative) return;
    const element = node as unknown as HTMLElement | null;
    if (!element) return;

    function handleAuxClick(event: MouseEvent) {
      if (event.button === 1) {
        event.preventDefault();
        onClose();
      }
    }

    element.addEventListener("auxclick", handleAuxClick);
    return () => element.removeEventListener("auxclick", handleAuxClick);
  }, [node, onClose]);

  return ref;
}

function getVerticalStatusBadgeStyle(bucket: WorkspaceTabPresentation["statusBucket"]) {
  switch (bucket) {
    case "needs_input":
      return styles.tabStatusBadgeNeedsInput;
    case "failed":
      return styles.tabStatusBadgeFailed;
    case "running":
      return styles.tabStatusBadgeRunning;
    case "attention":
      return styles.tabStatusBadgeAttention;
    default:
      return null;
  }
}

function VerticalTabStatusBadge({
  bucket,
  visible,
}: {
  bucket: WorkspaceTabPresentation["statusBucket"];
  visible: boolean;
}) {
  const badgeStyle = getVerticalStatusBadgeStyle(bucket);
  const containerStyle = useMemo(() => [styles.tabStatusBadge, badgeStyle], [badgeStyle]);
  if (!visible || !badgeStyle) {
    return null;
  }
  return <View pointerEvents="none" style={containerStyle} />;
}

function VerticalTabOverflowButton({ visible, testID }: { visible: boolean; testID: string }) {
  const menuController = useContextMenu();
  const handlePress = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      menuController.setOpen(true);
    },
    [menuController],
  );
  const handlePressIn = useCallback((event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
  }, []);
  const buttonOverlayStyle = useMemo(
    () => [styles.tabOverflowButtonOverlay, !visible && styles.tabCloseButtonHidden],
    [visible],
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Tab actions"
      onPressIn={handlePressIn}
      onPress={handlePress}
      pointerEvents={visible ? "auto" : "none"}
      style={buttonOverlayStyle}
    >
      {({ hovered, pressed }) => (
        <View style={tabOverflowButtonStyle({ hovered, pressed })}>
          <ThemedMoreVertical
            size={12}
            uniProps={hovered || pressed ? foregroundColorMapping : mutedColorMapping}
          />
        </View>
      )}
    </Pressable>
  );
}

function TabHandleContent({
  presentation,
  isHighlighted,
  showLabel,
  style,
  tabLabelSkeletonStyle,
  tabLabelStyle,
  showIconStatusBadge = true,
}: {
  presentation: WorkspaceTabPresentation;
  isHighlighted: boolean;
  showLabel: boolean;
  style?: React.ComponentProps<typeof View>["style"];
  tabLabelSkeletonStyle: React.ComponentProps<typeof View>["style"];
  tabLabelStyle: React.ComponentProps<typeof Text>["style"];
  showIconStatusBadge?: boolean;
}) {
  const tabHandleDataSet = useMemo(
    () => ({ statusBucket: presentation.statusBucket ?? "none" }),
    [presentation.statusBucket],
  );
  const tabHandleStyle = useMemo(() => [styles.tabHandle, style], [style]);

  return (
    <View style={tabHandleStyle} dataSet={tabHandleDataSet}>
      <View style={styles.tabIcon}>
        <WorkspaceTabIcon
          presentation={presentation}
          active={isHighlighted}
          showStatusBadge={showIconStatusBadge}
        />
      </View>
      {showLabel && presentation.titleState === "loading" ? (
        <View style={tabLabelSkeletonStyle} />
      ) : null}
      {showLabel && presentation.titleState !== "loading" ? (
        <Text style={tabLabelStyle} selectable={false} numberOfLines={1} ellipsizeMode="tail">
          {presentation.label}
        </Text>
      ) : null}
    </View>
  );
}

function TabChip({
  tab,
  isActive,
  isDragging,
  isFocused,
  resolvedTabWidth,
  showLabel,
  showCloseButton,
  isCloseHovered,
  isClosingTab,
  presentation,
  tooltipLabel,
  resolvedTab,
  orientation,
  showVerticalStatusBadge,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  dragHandleProps,
}: {
  tab: WorkspaceTabDescriptor;
  isActive: boolean;
  isDragging: boolean;
  isFocused: boolean;
  resolvedTabWidth: number;
  showLabel: boolean;
  showCloseButton: boolean;
  isCloseHovered: boolean;
  isClosingTab: boolean;
  presentation: WorkspaceTabPresentation;
  tooltipLabel: string;
  resolvedTab: WorkspaceDesktopTabActions;
  orientation: "horizontal" | "vertical";
  showVerticalStatusBadge: boolean;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  dragHandleProps: DraggableListDragHandleProps | undefined;
}) {
  const { closeButtonTestId, contextMenuTestId, menuEntries } = resolvedTab;
  const middleClickRef = useMiddleClickClose(
    useCallback(() => void onCloseTab(tab.tabId), [onCloseTab, tab.tabId]),
  );
  const [hovered, setHovered] = useState(false);
  const isHighlighted = isActive || hovered || isCloseHovered;
  const usesOverlayCloseButton = orientation === "vertical";
  const showVerticalTrailingActions = orientation === "vertical" && isHighlighted;
  const hasVerticalStatusBadge = getVerticalStatusBadgeStyle(presentation.statusBucket) !== null;
  const shouldShowVerticalStatusBadge =
    showVerticalStatusBadge &&
    orientation === "vertical" &&
    !showVerticalTrailingActions &&
    hasVerticalStatusBadge;
  const closeButtonVisible = showCloseButton && (!usesOverlayCloseButton || isHighlighted);
  const closeButtonDragBlockers = isWeb
    ? ({
        onPointerDown: (event: { stopPropagation?: () => void }) => {
          event.stopPropagation?.();
        },
        onMouseDown: (event: { stopPropagation?: () => void }) => {
          event.stopPropagation?.();
        },
      } as const)
    : undefined;

  const tabChipStyle = useCallback(
    () => [
      styles.tab,
      orientation === "vertical" && styles.tabVertical,
      isWeb && isDragging && ({ cursor: "grabbing" } as object),
      {
        minWidth: resolvedTabWidth,
        width: resolvedTabWidth,
        maxWidth: resolvedTabWidth,
      },
    ],
    [isDragging, orientation, resolvedTabWidth],
  );

  const handleTabHoverIn = useCallback(() => {
    setHovered(true);
  }, []);

  const handleTabHoverOut = useCallback(() => {
    setHovered(false);
  }, []);

  const handleNavigateTab = useCallback(() => {
    onNavigateTab(tab.tabId);
  }, [onNavigateTab, tab.tabId]);

  const handleCloseButtonPressIn = useCallback((event: { stopPropagation?: () => void }) => {
    event.stopPropagation?.();
  }, []);

  const handleCloseButtonHoverIn = useCallback(() => {
    setHoveredCloseTabKey(tab.key);
  }, [setHoveredCloseTabKey, tab.key]);

  const handleCloseButtonHoverOut = useCallback(() => {
    setHoveredCloseTabKey((current) => (current === tab.key ? null : current));
  }, [setHoveredCloseTabKey, tab.key]);

  const handleCloseButtonPress = useCallback(
    (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      void onCloseTab(tab.tabId);
    },
    [onCloseTab, tab.tabId],
  );

  const setTabTriggerRef = useCallback(
    (node: View | null) => {
      middleClickRef(node);
      dragHandleProps?.setActivatorNodeRef?.(node);
    },
    [dragHandleProps, middleClickRef],
  );

  const closeButtonStyle = useCallback(
    ({ hovered: isButtonHovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.tabCloseButton,
      usesOverlayCloseButton && styles.tabCloseButtonOverlay,
      !closeButtonVisible && styles.tabCloseButtonHidden,
      (Boolean(isButtonHovered) || pressed) && styles.tabCloseButtonActive,
    ],
    [closeButtonVisible, usesOverlayCloseButton],
  );

  const tabAccessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const tabFocusIndicatorStyle = useMemo(
    () => [
      styles.tabFocusIndicator,
      orientation === "vertical" && styles.tabFocusIndicatorVertical,
      !isFocused && styles.tabFocusIndicatorUnfocused,
    ],
    [isFocused, orientation],
  );
  const tabLabelSkeletonStyle = useMemo(
    () => [
      styles.tabLabelSkeleton,
      showCloseButton && !usesOverlayCloseButton && styles.tabLabelSkeletonWithCloseButton,
    ],
    [showCloseButton, usesOverlayCloseButton],
  );
  const tabLabelStyle = useMemo(
    () => [
      styles.tabLabel,
      isHighlighted && styles.tabLabelActive,
      showCloseButton && !usesOverlayCloseButton && styles.tabLabelWithCloseButton,
    ],
    [isHighlighted, showCloseButton, usesOverlayCloseButton],
  );
  const tabHandleStyle = useMemo(
    () => [
      usesOverlayCloseButton && closeButtonVisible && styles.tabHandleWithOverlayActions,
      shouldShowVerticalStatusBadge && styles.tabHandleWithVerticalStatusBadge,
    ],
    [closeButtonVisible, shouldShowVerticalStatusBadge, usesOverlayCloseButton],
  );

  return (
    <View>
      <ContextMenu key={tab.key}>
        <Tooltip delayDuration={400} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild triggerRefProp="triggerRef">
            <ContextMenuTrigger
              {...(dragHandleProps?.attributes as object | undefined)}
              {...(dragHandleProps?.listeners as object | undefined)}
              testID={`workspace-tab-${buildDeterministicWorkspaceTabId(tab.target)}`}
              triggerRef={setTabTriggerRef}
              enabledOnMobile={false}
              style={tabChipStyle}
              onHoverIn={handleTabHoverIn}
              onHoverOut={handleTabHoverOut}
              onPressIn={handleNavigateTab}
              onPress={handleNavigateTab}
              accessibilityRole="button"
              accessibilityLabel={tooltipLabel}
              accessibilityState={tabAccessibilityState}
              aria-selected={isActive}
            >
              {isActive && <View style={tabFocusIndicatorStyle} />}
              <TabHandleContent
                presentation={presentation}
                isHighlighted={isHighlighted}
                showLabel={showLabel}
                style={tabHandleStyle}
                tabLabelSkeletonStyle={tabLabelSkeletonStyle}
                tabLabelStyle={tabLabelStyle}
                showIconStatusBadge={orientation !== "vertical"}
              />

              {orientation === "vertical" ? (
                <>
                  <VerticalTabStatusBadge
                    bucket={presentation.statusBucket}
                    visible={shouldShowVerticalStatusBadge}
                  />
                  <VerticalTabOverflowButton
                    visible={showVerticalTrailingActions}
                    testID={`${contextMenuTestId}-trigger`}
                  />
                </>
              ) : null}

              {showCloseButton ? (
                <Pressable
                  {...(closeButtonDragBlockers as object | undefined)}
                  testID={closeButtonTestId}
                  disabled={isClosingTab}
                  onPressIn={handleCloseButtonPressIn}
                  onHoverIn={handleCloseButtonHoverIn}
                  onHoverOut={handleCloseButtonHoverOut}
                  onPress={handleCloseButtonPress}
                  pointerEvents={closeButtonVisible ? "auto" : "none"}
                  style={closeButtonStyle}
                >
                  {({ hovered: closeHovered, pressed }) =>
                    isClosingTab ? (
                      <ThemedActivityIndicator
                        size={12}
                        uniProps={
                          closeHovered || pressed ? foregroundColorMapping : mutedColorMapping
                        }
                      />
                    ) : (
                      <ThemedX
                        size={12}
                        uniProps={
                          closeHovered || pressed ? foregroundColorMapping : mutedColorMapping
                        }
                      />
                    )
                  }
                </Pressable>
              ) : null}
            </ContextMenuTrigger>
          </TooltipTrigger>
          <TooltipContent
            side={orientation === "vertical" ? "right" : "bottom"}
            align="center"
            offset={8}
          >
            <WorkspaceTabTooltipPreview
              tab={tab}
              presentation={presentation}
              tooltipLabel={tooltipLabel}
              orientation={orientation}
            />
          </TooltipContent>
        </Tooltip>

        <ContextMenuContent align="start" width={DROPDOWN_WIDTH} testID={contextMenuTestId}>
          {menuEntries.map((entry) =>
            entry.kind === "separator" ? (
              <ContextMenuSeparator key={entry.key} />
            ) : (
              <TabContextMenuItem key={entry.key} entry={entry} />
            ),
          )}
        </ContextMenuContent>
      </ContextMenu>
    </View>
  );
}

export function WorkspaceDesktopTabsRow({
  paneId,
  isFocused = false,
  tabs,
  recentlyClosedTabs,
  normalizedServerId,
  normalizedWorkspaceId,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  onCopyResumeCommand,
  onCopyAgentId,
  onCopyFilePath,
  onReloadAgent,
  onRenameTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  onRestoreClosedTab,
  onCreateDraftTab,
  onCreateTerminalTab,
  onCreateBrowserTab,
  showCreateBrowserTab = false,
  disableCreateTerminal = false,
  isWaitingOnTerminalReadiness = false,
  onReorderTabs,
  onSplitRight,
  onSplitDown,
  tabBarOrientation = "horizontal",
  verticalTabsSelected = false,
  onVerticalTabsChange,
  externalDndContext = false,
  activeDragTabId = null,
  tabDropPreviewIndex = null,
  disableReorderTabs = false,
  showPaneSplitActions = true,
}: WorkspaceDesktopTabsRowProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const newTabKeys = useShortcutKeys("workspace-tab-new");
  const splitRightKeys = useShortcutKeys("workspace-pane-split-right");
  const splitDownKeys = useShortcutKeys("workspace-pane-split-down");
  const [tabsContainerWidth, setTabsContainerWidth] = useState<number>(0);
  const [tabsActionsWidth, setTabsActionsWidth] = useState<number>(0);
  const [inlineAddButtonWidth, setInlineAddButtonWidth] = useState<number>(0);
  const isVertical = tabBarOrientation === "vertical";
  const { isScrolled, onScroll: scrollOnScroll } = useVerticalScrollState(isVertical);

  const handleTabsContainerLayout = useCallback((event: LayoutChangeEvent) => {
    updateMeasuredWidth(setTabsContainerWidth, event);
  }, []);

  const handleTabsActionsLayout = useCallback((event: LayoutChangeEvent) => {
    updateMeasuredWidth(setTabsActionsWidth, event);
  }, []);

  const handleInlineAddButtonLayout = useCallback((event: LayoutChangeEvent) => {
    updateMeasuredWidth(setInlineAddButtonWidth, event);
  }, []);

  const layoutMetrics = useMemo(
    () => ({
      rowHorizontalInset: 0,
      actionsReservedWidth: Math.max(
        0,
        tabsActionsWidth + (inlineAddButtonWidth || DEFAULT_INLINE_ADD_BUTTON_RESERVED_WIDTH),
      ),
      rowPaddingHorizontal: 0,
      tabGap: 0,
      maxTabWidth: 200,
      tabIconWidth: 14,
      tabHorizontalPadding: 12,
      estimatedCharWidth: 7,
      closeButtonWidth: 22,
    }),
    [inlineAddButtonWidth, tabsActionsWidth],
  );

  const fallbackTabLabels = useMemo(
    () => ({
      newAgent: t("workspace.tabs.fallback.newAgent"),
      setup: t("workspace.tabs.fallback.setup"),
      terminal: t("workspace.tabs.fallback.terminal"),
      agent: t("workspace.tabs.fallback.agent"),
    }),
    [t],
  );
  const tabMenuLabels = useMemo<WorkspaceTabMenuLabels>(
    () => ({
      copyResumeCommand: t("workspace.tabs.menu.copyResumeCommand"),
      copyAgentId: t("workspace.tabs.menu.copyAgentId"),
      copyFilePath: t("workspace.tabs.menu.copyFilePath"),
      rename: t("workspace.tabs.menu.rename"),
      closeAbove: t("workspace.tabs.menu.closeAbove"),
      closeBelow: t("workspace.tabs.menu.closeBelow"),
      closeLeft: t("workspace.tabs.menu.closeLeft"),
      closeRight: t("workspace.tabs.menu.closeRight"),
      closeOthers: t("workspace.tabs.menu.closeOthers"),
      reloadAgent: t("workspace.tabs.menu.reloadAgent"),
      reloadAgentTooltip: t("workspace.tabs.menu.reloadAgentTooltip"),
      close: t("workspace.tabs.menu.close"),
    }),
    [t],
  );
  const tabLabelLengths = useMemo(
    () =>
      tabs.map((tab) => {
        const label = getFallbackTabLabel(tab.tab, fallbackTabLabels);
        return label.length;
      }),
    [fallbackTabLabels, tabs],
  );

  const { layout: horizontalLayout } = useWorkspaceTabLayout({
    tabLabelLengths,
    viewportWidthOverride: tabsContainerWidth > 0 ? tabsContainerWidth : null,
    metrics: layoutMetrics,
  });
  const verticalLayout = useMemo(
    () => ({
      items: tabLabelLengths.map(() => ({
        width: Math.max(60, Math.min(200, tabsContainerWidth || 200)),
        showLabel: true,
        labelCharCap: Number.POSITIVE_INFINITY,
      })),
      closeButtonPolicy: "all" as const,
      requiresHorizontalScrollFallback: false,
    }),
    [tabLabelLengths, tabsContainerWidth],
  );
  const layout = isVertical ? verticalLayout : horizontalLayout;
  const showVerticalStatusBadge = useShowVerticalStatusBadge(normalizedServerId);

  const handleDragEnd = useCallback(
    (nextTabs: WorkspaceDesktopTabRowItem[]) => {
      reorderTabsWhenEnabled({ disableReorderTabs, nextTabs, onReorderTabs });
    },
    [disableReorderTabs, onReorderTabs],
  );

  const getTabDragData = useMemo(() => {
    if (!paneId) return undefined;
    return (tab: WorkspaceDesktopTabRowItem) => ({
      kind: "workspace-tab" as const,
      paneId,
      tabId: tab.tab.tabId,
    });
  }, [paneId]);

  const handleCreateAgentTab = useCallback(() => {
    onCreateDraftTab({ paneId });
  }, [onCreateDraftTab, paneId]);

  const handleCreateTerminal = useCallback(() => {
    onCreateTerminalTab({ paneId });
  }, [onCreateTerminalTab, paneId]);

  const handleCreateTerminalWithProfile = useCallback(
    (profile: TerminalProfileInput) => {
      onCreateTerminalTab({ paneId, profile });
    },
    [onCreateTerminalTab, paneId],
  );

  const handleEditProfiles = useCallback(() => {
    router.push(buildSettingsHostSectionRoute(normalizedServerId, "terminals") as Href);
  }, [normalizedServerId, router]);

  const handleCreateBrowser = useCallback(() => {
    onCreateBrowserTab({ paneId });
  }, [onCreateBrowserTab, paneId]);

  const terminalDisabled = disableCreateTerminal || isWaitingOnTerminalReadiness;
  const handleVerticalTabsChange = useCallback(
    (selected: boolean) => {
      onVerticalTabsChange?.(selected);
    },
    [onVerticalTabsChange],
  );

  const renderTab = useCallback(
    ({
      item,
      index,
      dragHandleProps,
      isActive,
    }: DraggableRenderItemInfo<WorkspaceDesktopTabRowItem>) => {
      const shouldShowCloseButton = layout.closeButtonPolicy === "all";
      const layoutItem = layout.items[index] ?? null;
      const resolvedTabWidth = layoutItem?.width ?? 150;
      const showLabel = layoutItem?.showLabel ?? true;
      const showDropIndicatorBefore = activeDragTabId !== null && tabDropPreviewIndex === index;
      const showDropIndicatorAfter =
        activeDragTabId !== null &&
        tabDropPreviewIndex === tabs.length &&
        index === tabs.length - 1;

      return (
        <ResolvedDesktopTabChip
          key={`${item.tab.key}:${item.tab.kind}`}
          item={item}
          isFocused={isFocused}
          isDragging={isActive}
          index={index}
          tabCount={tabs.length}
          normalizedServerId={normalizedServerId}
          normalizedWorkspaceId={normalizedWorkspaceId}
          onCopyResumeCommand={onCopyResumeCommand}
          onCopyAgentId={onCopyAgentId}
          onCopyFilePath={onCopyFilePath}
          onReloadAgent={onReloadAgent}
          onRenameTab={onRenameTab}
          onCloseTabsToLeft={onCloseTabsToLeft}
          onCloseTabsToRight={onCloseTabsToRight}
          onCloseOtherTabs={onCloseOtherTabs}
          resolvedTabWidth={resolvedTabWidth}
          showLabel={showLabel}
          showCloseButton={shouldShowCloseButton}
          setHoveredCloseTabKey={setHoveredCloseTabKey}
          onNavigateTab={onNavigateTab}
          onCloseTab={onCloseTab}
          labels={tabMenuLabels}
          dragHandleProps={dragHandleProps}
          orientation={tabBarOrientation}
          showVerticalStatusBadge={showVerticalStatusBadge}
          showDropIndicatorBefore={showDropIndicatorBefore}
          showDropIndicatorAfter={showDropIndicatorAfter}
        />
      );
    },
    [
      activeDragTabId,
      isFocused,
      layout.closeButtonPolicy,
      layout.items,
      normalizedServerId,
      normalizedWorkspaceId,
      onCloseOtherTabs,
      onCloseTab,
      onCloseTabsToLeft,
      onCloseTabsToRight,
      onCopyAgentId,
      onCopyFilePath,
      onCopyResumeCommand,
      onNavigateTab,
      onReloadAgent,
      onRenameTab,
      setHoveredCloseTabKey,
      showVerticalStatusBadge,
      tabBarOrientation,
      tabMenuLabels,
      tabDropPreviewIndex,
      tabs.length,
    ],
  );

  const tabsScrollStyle = useMemo(
    () => [
      styles.tabsScroll,
      isVertical && styles.tabsScrollVertical,
      layout.requiresHorizontalScrollFallback
        ? styles.tabsScrollOverflow
        : styles.tabsScrollFitContent,
    ],
    [isVertical, layout.requiresHorizontalScrollFallback],
  );
  const tabsContainerStyle = useMemo(
    () => [styles.tabsContainer, isVertical && styles.tabsContainerVertical],
    [isVertical],
  );
  const tabsContentStyle = useMemo(
    () => [styles.tabsContent, isVertical && styles.tabsContentVertical],
    [isVertical],
  );
  const tabsActionsStyle = useMemo(
    () => [styles.tabsActions, isVertical && styles.tabsActionsVertical],
    [isVertical],
  );
  const tabsHeaderStyle = useMemo(
    () => buildTabsHeaderStyles({ isVertical, isScrolled }),
    [isScrolled, isVertical],
  );
  const tabReorderDisabled = shouldDisableTabReorder({
    disableReorderTabs,
    externalDndContext,
    tabCount: tabs.length,
  });

  const tabDisplayMenu = (
    <WorkspaceTabDisplayMenu
      normalizedServerId={normalizedServerId}
      verticalTabsSelected={verticalTabsSelected}
      orientation={tabBarOrientation}
      onVerticalTabsChange={handleVerticalTabsChange}
    />
  );
  const tabRowExtras = (
    <WorkspaceTabRowExtras
      onCreateAgentTab={handleCreateAgentTab}
      onCreateTerminal={handleCreateTerminal}
      onCreateBrowser={handleCreateBrowser}
      onCreateTerminalWithProfile={handleCreateTerminalWithProfile}
      onEditProfiles={handleEditProfiles}
      normalizedServerId={normalizedServerId}
      showCreateBrowserTab={showCreateBrowserTab}
      terminalDisabled={terminalDisabled}
    />
  );

  const row = (
    <View
      style={tabsContainerStyle}
      testID="workspace-tabs-row"
      onLayout={handleTabsContainerLayout}
    >
      {isVertical ? (
        <View style={tabsHeaderStyle}>
          <WorkspaceInlineAddTabButton
            shortcutKeys={newTabKeys}
            recentlyClosedTabs={recentlyClosedTabs}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
            onCreateAgentTab={handleCreateAgentTab}
            onRestoreClosedTab={onRestoreClosedTab}
            onLayout={handleInlineAddButtonLayout}
          />
          <View style={styles.tabsHeaderActions}>
            {tabRowExtras}
            {tabDisplayMenu}
          </View>
        </View>
      ) : null}
      <ScrollView
        horizontal={!isVertical}
        scrollEnabled={isVertical || layout.requiresHorizontalScrollFallback}
        testID="workspace-tabs-scroll"
        style={tabsScrollStyle}
        contentContainerStyle={tabsContentStyle}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={scrollOnScroll}
        scrollEventThrottle={16}
      >
        <SortableInlineList
          data={tabs}
          keyExtractor={tabKeyExtractor}
          useDragHandle
          disabled={tabReorderDisabled}
          onDragEnd={handleDragEnd}
          externalDndContext={externalDndContext}
          activeId={activeDragTabId}
          getItemData={getTabDragData}
          orientation={tabBarOrientation}
          renderItem={renderTab}
        />
        {isVertical ? null : (
          <WorkspaceInlineAddTabButton
            shortcutKeys={newTabKeys}
            recentlyClosedTabs={recentlyClosedTabs}
            normalizedServerId={normalizedServerId}
            normalizedWorkspaceId={normalizedWorkspaceId}
            onCreateAgentTab={handleCreateAgentTab}
            onRestoreClosedTab={onRestoreClosedTab}
            onLayout={handleInlineAddButtonLayout}
          />
        )}
      </ScrollView>
      <View style={tabsActionsStyle} onLayout={handleTabsActionsLayout}>
        {isVertical ? null : (
          <>
            {tabDisplayMenu}
            {tabRowExtras}
          </>
        )}
        {showPaneSplitActions ? (
          <>
            <SplitActionButton
              icon="split-right"
              onPress={onSplitRight}
              label={t("workspace.tabs.actions.splitRight")}
              shortcutKeys={splitRightKeys}
            />
            <SplitActionButton
              icon="split-down"
              onPress={onSplitDown}
              label={t("workspace.tabs.actions.splitDown")}
              shortcutKeys={splitDownKeys}
            />
          </>
        ) : null}
      </View>
    </View>
  );

  return <RenderProfile id="WorkspaceDesktopTabsRow">{row}</RenderProfile>;
}
function ResolvedDesktopTabChip({
  item,
  isFocused,
  isDragging,
  index,
  tabCount,
  normalizedServerId,
  normalizedWorkspaceId,
  onCopyResumeCommand,
  onCopyAgentId,
  onCopyFilePath,
  onReloadAgent,
  onRenameTab,
  onCloseTabsToLeft,
  onCloseTabsToRight,
  onCloseOtherTabs,
  resolvedTabWidth,
  showLabel,
  showCloseButton,
  setHoveredCloseTabKey,
  onNavigateTab,
  onCloseTab,
  labels,
  dragHandleProps,
  orientation,
  showDropIndicatorBefore,
  showDropIndicatorAfter,
  showVerticalStatusBadge,
}: {
  item: WorkspaceDesktopTabRowItem;
  isFocused: boolean;
  isDragging: boolean;
  index: number;
  tabCount: number;
  normalizedServerId: string;
  normalizedWorkspaceId: string;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyFilePath: (path: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
  onRenameTab: (tab: WorkspaceTabDescriptor) => void;
  onCloseTabsToLeft: (tabId: string) => Promise<void> | void;
  onCloseTabsToRight: (tabId: string) => Promise<void> | void;
  onCloseOtherTabs: (tabId: string) => Promise<void> | void;
  resolvedTabWidth: number;
  showLabel: boolean;
  showCloseButton: boolean;
  setHoveredCloseTabKey: Dispatch<SetStateAction<string | null>>;
  onNavigateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => Promise<void> | void;
  labels: WorkspaceTabMenuLabels;
  dragHandleProps: DraggableListDragHandleProps | undefined;
  orientation: "horizontal" | "vertical";
  showDropIndicatorBefore: boolean;
  showDropIndicatorAfter: boolean;
  showVerticalStatusBadge: boolean;
}) {
  const { t } = useTranslation();
  const resolvedTab = useMemo(
    () =>
      buildWorkspaceDesktopTabActions({
        tab: item.tab,
        index,
        tabCount,
        onCopyResumeCommand,
        onCopyAgentId,
        onCopyFilePath,
        onReloadAgent,
        onRenameTab,
        onCloseTab,
        onCloseTabsToLeft,
        onCloseTabsToRight,
        onCloseOtherTabs,
        labels,
      }),
    [
      index,
      item.tab,
      onCloseOtherTabs,
      onCloseTab,
      onCloseTabsToLeft,
      onCloseTabsToRight,
      onCopyAgentId,
      onCopyFilePath,
      onCopyResumeCommand,
      labels,
      onReloadAgent,
      onRenameTab,
      tabCount,
    ],
  );

  return (
    <WorkspaceTabPresentationResolver
      tab={item.tab}
      serverId={normalizedServerId}
      workspaceId={normalizedWorkspaceId}
    >
      {(presentation) => {
        const tooltipLabel =
          presentation.titleState === "loading"
            ? t("workspace.tabs.loadingAgentTitle")
            : presentation.label;

        return (
          <View style={styles.tabSlot}>
            {showDropIndicatorBefore ? (
              <View
                style={
                  orientation === "vertical"
                    ? TAB_DROP_INDICATOR_VERTICAL_BEFORE_STYLE
                    : TAB_DROP_INDICATOR_BEFORE_STYLE
                }
              />
            ) : null}
            <TabChip
              tab={item.tab}
              isActive={item.isActive}
              isDragging={isDragging}
              isFocused={isFocused}
              resolvedTabWidth={resolvedTabWidth}
              showLabel={showLabel}
              showCloseButton={showCloseButton}
              isCloseHovered={item.isCloseHovered}
              isClosingTab={item.isClosingTab}
              presentation={presentation}
              tooltipLabel={tooltipLabel}
              resolvedTab={resolvedTab}
              orientation={orientation}
              showVerticalStatusBadge={showVerticalStatusBadge}
              setHoveredCloseTabKey={setHoveredCloseTabKey}
              onNavigateTab={onNavigateTab}
              onCloseTab={onCloseTab}
              dragHandleProps={dragHandleProps}
            />
            {showDropIndicatorAfter ? (
              <View
                style={
                  orientation === "vertical"
                    ? TAB_DROP_INDICATOR_VERTICAL_AFTER_STYLE
                    : TAB_DROP_INDICATOR_AFTER_STYLE
                }
              />
            ) : null}
          </View>
        );
      }}
    </WorkspaceTabPresentationResolver>
  );
}

const styles = StyleSheet.create((theme) => ({
  tabsContainer: {
    minWidth: 0,
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    flexDirection: "row",
    alignItems: "center",
    overflow: "visible",
  },
  tabsContainerVertical: {
    width: 220,
    height: undefined,
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
    borderBottomWidth: 0,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    flexDirection: "column",
    alignItems: "stretch",
    overflow: "hidden",
  },
  tabsScroll: {
    minWidth: 0,
  },
  tabsScrollVertical: {
    flex: 1,
    minHeight: 0,
  },
  tabsScrollFitContent: {
    flex: 1,
  },
  tabsScrollOverflow: {
    flex: 1,
  },
  tabsContent: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  tabsContentVertical: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  tabsHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  tabsHeaderVertical: {
    flexShrink: 0,
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  tabsHeaderVerticalScrolled: {
    borderBottomColor: theme.colors.border,
  },
  tabsHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  tabsActions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[2],
  },
  tabsActionsVertical: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    justifyContent: "flex-start",
    flexWrap: "wrap",
  },
  inlineAddButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[1],
  },
  tab: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    userSelect: "none",
  },
  tabVertical: {
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabSlot: {
    position: "relative",
    overflow: "visible",
  },
  tabHandle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
    userSelect: "none",
  },
  tabHandleWithOverlayActions: {
    paddingRight: 54,
  },
  tabHandleWithVerticalStatusBadge: {
    paddingRight: 24,
  },
  tabIcon: {
    flexShrink: 0,
  },
  tabFocusIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: theme.colors.accent,
  },
  tabFocusIndicatorVertical: {
    top: 0,
    bottom: 0,
    right: undefined,
    width: 2,
    height: undefined,
  },
  tabFocusIndicatorUnfocused: {
    backgroundColor: theme.colors.borderAccent,
  },
  tabDropIndicator: {
    position: "absolute",
    top: theme.spacing[2],
    bottom: theme.spacing[2],
    width: 5,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    zIndex: 10,
    pointerEvents: "none",
  },
  tabDropIndicatorBefore: {
    left: -3,
  },
  tabDropIndicatorAfter: {
    right: -3,
  },
  tabDropIndicatorVertical: {
    left: theme.spacing[2],
    right: theme.spacing[2],
    height: 5,
    width: "auto",
  },
  tabDropIndicatorVerticalBefore: {
    top: -3,
    bottom: undefined,
  },
  tabDropIndicatorVerticalAfter: {
    top: undefined,
    bottom: -3,
  },
  tabLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    userSelect: "none",
  },
  tabLabelSkeleton: {
    width: 96,
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    height: 10,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.9,
  },
  tabLabelSkeletonWithCloseButton: {
    width: LOADING_TAB_LABEL_SKELETON_WIDTH,
  },
  tabLabelWithCloseButton: {
    paddingRight: 0,
  },
  tabLabelActive: {
    color: theme.colors.foreground,
  },
  tabCloseButton: {
    width: 18,
    height: 18,
    marginLeft: 0,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCloseButtonOverlay: {
    position: "absolute",
    top: "50%",
    right: theme.spacing[3],
    marginTop: -9,
  },
  tabCloseButtonHidden: {
    opacity: 0,
  },
  tabCloseButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  tabOverflowButtonOverlay: {
    position: "absolute",
    top: "50%",
    right: theme.spacing[3] + 22,
    marginTop: -9,
    width: 18,
    height: 18,
  },
  tabOverflowButton: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabStatusBadge: {
    position: "absolute",
    top: "50%",
    right: theme.spacing[3] + 4,
    width: 10,
    height: 10,
    marginTop: -5,
    borderRadius: theme.borderRadius.full,
  },
  tabStatusBadgeNeedsInput: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  tabStatusBadgeFailed: {
    backgroundColor: theme.colors.palette.red[500],
  },
  tabStatusBadgeRunning: {
    backgroundColor: theme.colors.palette.blue[500],
  },
  tabStatusBadgeAttention: {
    backgroundColor: theme.colors.palette.green[500],
  },
  newTabActionButton: {
    width: 22,
    height: 22,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineAddActionButton: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  newTabActionButtonDisabled: {
    opacity: 0.5,
  },
  newTabActionButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  newTabTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  newTabTooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  newTabTooltipShortcut: {},
  menuItemHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  rotatedMenuIcon: {
    transform: [{ rotate: "90deg" }],
  },
  terminalProfileIconWrapper: {
    width: 14,
    height: 14,
  },
}));

const TAB_DROP_INDICATOR_BEFORE_STYLE = [styles.tabDropIndicator, styles.tabDropIndicatorBefore];
const TAB_DROP_INDICATOR_AFTER_STYLE = [styles.tabDropIndicator, styles.tabDropIndicatorAfter];
const TAB_DROP_INDICATOR_VERTICAL_BEFORE_STYLE = [
  styles.tabDropIndicator,
  styles.tabDropIndicatorVertical,
  styles.tabDropIndicatorVerticalBefore,
];
const TAB_DROP_INDICATOR_VERTICAL_AFTER_STYLE = [
  styles.tabDropIndicator,
  styles.tabDropIndicatorVertical,
  styles.tabDropIndicatorVerticalAfter,
];
