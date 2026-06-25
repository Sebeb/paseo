import { useCallback } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Settings2 } from "lucide-react-native";
import type { Theme } from "@/styles/theme";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAppSettings, type WorkspaceTitleSource } from "@/hooks/use-settings";
import {
  useSidebarViewStore,
  type SidebarBadgeMode,
  type SidebarEmbeddedRecentTabCount,
  type SidebarEmbeddedTabSortMode,
  type SidebarGroupMode,
} from "@/stores/sidebar-view-store";
import { isWeb as platformIsWeb } from "@/constants/platform";

const ThemedSettings2 = withUnistyles(Settings2);
const filterColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const GROUP_MODE_ITEMS: Array<{ value: SidebarGroupMode; label: string }> = [
  { value: "project", label: "Project" },
  { value: "status", label: "Status" },
];

const TAB_SORT_ITEMS: Array<{ value: SidebarEmbeddedTabSortMode; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "created", label: "Created" },
  { value: "lastUpdated", label: "Last updated" },
  { value: "status", label: "Status" },
];

const RECENT_TAB_COUNT_ITEMS: Array<{ value: SidebarEmbeddedRecentTabCount; label: string }> = [
  { value: 3, label: "3" },
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: "all", label: "All" },
];

const BADGE_MODE_ITEMS: Array<{ value: SidebarBadgeMode; label: string }> = [
  { value: "diff", label: "Diff" },
  { value: "status", label: "Status" },
  { value: "none", label: "None" },
];

const WORKSPACE_TITLE_SOURCE_ITEMS: Array<{ value: WorkspaceTitleSource; label: string }> = [
  { value: "title", label: "Title" },
  { value: "branch", label: "Branch name" },
];

export function SidebarGroupingSelector({ serverId }: { serverId: string | null }) {
  const { settings, updateSettings } = useAppSettings();
  const groupMode = useSidebarViewStore((state) =>
    serverId ? state.getGroupMode(serverId) : "project",
  );
  const autoCollapseWorkspaces = useSidebarViewStore((state) => state.autoCollapseWorkspaces);
  const setGroupMode = useSidebarViewStore((state) => state.setGroupMode);
  const setAutoCollapseWorkspaces = useSidebarViewStore((state) => state.setAutoCollapseWorkspaces);
  const showSidebarSpecificControls = settings.tabLayoutMode !== "horizontal";
  const showTabControls = settings.tabLayoutMode === "sidebar";
  const showSidebarBadge = settings.tabLayoutMode !== "horizontal";
  const closeOnSelect = !showSidebarSpecificControls;

  const handleSelect = useCallback(
    (mode: SidebarGroupMode) => {
      if (!serverId) return;
      setGroupMode(serverId, mode);
    },
    [serverId, setGroupMode],
  );

  const handleAutoCollapseSelect = useCallback(() => {
    setAutoCollapseWorkspaces(!autoCollapseWorkspaces);
  }, [autoCollapseWorkspaces, setAutoCollapseWorkspaces]);

  const handleWorkspaceTitleSourceSelect = useCallback(
    (source: WorkspaceTitleSource) => {
      void updateSettings({ workspaceTitleSource: source });
    },
    [updateSettings],
  );

  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      hovered && styles.triggerHovered,
    ],
    [],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={triggerStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel="Sidebar grouping"
        testID="sidebar-grouping-selector"
      >
        <ThemedSettings2 size={14} uniProps={filterColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width={180} testID="sidebar-grouping-menu">
        <View style={styles.menuHeader}>
          <Text style={styles.menuHeaderLabel}>Group by</Text>
        </View>
        {GROUP_MODE_ITEMS.map((item) => (
          <GroupModeMenuItem
            key={item.value}
            item={item}
            isSelected={groupMode === item.value}
            closeOnSelect={closeOnSelect}
            onSelect={handleSelect}
          />
        ))}
        {showSidebarSpecificControls ? (
          <>
            <DropdownMenuSeparator />
            <View style={styles.menuHeader}>
              <Text style={styles.menuHeaderLabel}>Workspace title</Text>
            </View>
            {WORKSPACE_TITLE_SOURCE_ITEMS.map((item) => (
              <WorkspaceTitleSourceMenuItem
                key={item.value}
                item={item}
                isSelected={settings.workspaceTitleSource === item.value}
                closeOnSelect={false}
                onSelect={handleWorkspaceTitleSourceSelect}
              />
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              testID="sidebar-auto-collapse-workspaces"
              selected={autoCollapseWorkspaces}
              closeOnSelect={false}
              onSelect={handleAutoCollapseSelect}
            >
              Auto collapse workspaces
            </DropdownMenuItem>
          </>
        ) : null}
        <SidebarDisplayPreferencesMenuSections
          serverId={serverId}
          showTabControls={showTabControls}
          showSidebarBadge={showSidebarBadge}
          closeOnSelect={false}
          leadingSeparator={showSidebarSpecificControls}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarDisplayPreferencesMenuSections({
  serverId,
  showTabControls,
  showSidebarBadge,
  closeOnSelect = false,
  leadingSeparator = false,
}: {
  serverId: string | null;
  showTabControls: boolean;
  showSidebarBadge: boolean;
  closeOnSelect?: boolean;
  leadingSeparator?: boolean;
}) {
  const tabSortMode = useSidebarViewStore((state) =>
    serverId ? state.getEmbeddedTabSortMode(serverId) : "manual",
  );
  const recentTabCount = useSidebarViewStore((state) =>
    serverId ? state.getEmbeddedRecentTabCount(serverId) : 5,
  );
  const badgeMode = useSidebarViewStore((state) =>
    serverId ? state.getBadgeMode(serverId) : "diff",
  );
  const setTabSortMode = useSidebarViewStore((state) => state.setEmbeddedTabSortMode);
  const setRecentTabCount = useSidebarViewStore((state) => state.setEmbeddedRecentTabCount);
  const setBadgeMode = useSidebarViewStore((state) => state.setBadgeMode);

  const handleTabSortSelect = useCallback(
    (mode: SidebarEmbeddedTabSortMode) => {
      if (!serverId) return;
      setTabSortMode(serverId, mode);
    },
    [serverId, setTabSortMode],
  );

  const handleRecentTabCountSelect = useCallback(
    (count: SidebarEmbeddedRecentTabCount) => {
      if (!serverId) return;
      setRecentTabCount(serverId, count);
    },
    [serverId, setRecentTabCount],
  );

  const handleBadgeModeSelect = useCallback(
    (mode: SidebarBadgeMode) => {
      if (!serverId) return;
      setBadgeMode(serverId, mode);
    },
    [serverId, setBadgeMode],
  );

  if (!showTabControls && !showSidebarBadge) {
    return null;
  }

  return (
    <>
      {leadingSeparator ? <DropdownMenuSeparator /> : null}
      {showTabControls ? (
        <>
          <View style={styles.menuHeader}>
            <Text style={styles.menuHeaderLabel}>Tab sort</Text>
          </View>
          {TAB_SORT_ITEMS.map((item) => (
            <TabSortMenuItem
              key={item.value}
              item={item}
              isSelected={tabSortMode === item.value}
              closeOnSelect={closeOnSelect}
              onSelect={handleTabSortSelect}
            />
          ))}
          <DropdownMenuSeparator />
          <View style={styles.menuHeader}>
            <Text style={styles.menuHeaderLabel}>Recent tab count</Text>
          </View>
          {RECENT_TAB_COUNT_ITEMS.map((item) => (
            <RecentTabCountMenuItem
              key={String(item.value)}
              item={item}
              isSelected={recentTabCount === item.value}
              closeOnSelect={closeOnSelect}
              onSelect={handleRecentTabCountSelect}
            />
          ))}
        </>
      ) : null}
      {showSidebarBadge ? (
        <>
          {showTabControls ? <DropdownMenuSeparator /> : null}
          <View style={styles.menuHeader}>
            <Text style={styles.menuHeaderLabel}>Sidebar badge</Text>
          </View>
          {BADGE_MODE_ITEMS.map((item) => (
            <BadgeModeMenuItem
              key={item.value}
              item={item}
              isSelected={badgeMode === item.value}
              closeOnSelect={closeOnSelect}
              onSelect={handleBadgeModeSelect}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function WorkspaceTitleSourceMenuItem({
  item,
  isSelected,
  closeOnSelect,
  onSelect,
}: {
  item: { value: WorkspaceTitleSource; label: string };
  isSelected: boolean;
  closeOnSelect: boolean;
  onSelect: (source: WorkspaceTitleSource) => void;
}) {
  const handleSelect = useCallback(() => onSelect(item.value), [item.value, onSelect]);
  return (
    <DropdownMenuItem
      testID={`sidebar-workspace-title-source-${item.value}`}
      selected={isSelected}
      closeOnSelect={closeOnSelect}
      onSelect={handleSelect}
    >
      {item.label}
    </DropdownMenuItem>
  );
}

function GroupModeMenuItem({
  item,
  isSelected,
  closeOnSelect,
  onSelect,
}: {
  item: { value: SidebarGroupMode; label: string };
  isSelected: boolean;
  closeOnSelect: boolean;
  onSelect: (mode: SidebarGroupMode) => void;
}) {
  const handleSelect = useCallback(() => onSelect(item.value), [item.value, onSelect]);
  return (
    <DropdownMenuItem
      testID={`sidebar-grouping-${item.value}`}
      selected={isSelected}
      closeOnSelect={closeOnSelect}
      onSelect={handleSelect}
    >
      {item.label}
    </DropdownMenuItem>
  );
}

function TabSortMenuItem({
  item,
  isSelected,
  closeOnSelect,
  onSelect,
}: {
  item: { value: SidebarEmbeddedTabSortMode; label: string };
  isSelected: boolean;
  closeOnSelect: boolean;
  onSelect: (mode: SidebarEmbeddedTabSortMode) => void;
}) {
  const handleSelect = useCallback(() => onSelect(item.value), [item.value, onSelect]);
  return (
    <DropdownMenuItem
      testID={`sidebar-tab-sort-${item.value}`}
      selected={isSelected}
      closeOnSelect={closeOnSelect}
      onSelect={handleSelect}
    >
      {item.label}
    </DropdownMenuItem>
  );
}

function RecentTabCountMenuItem({
  item,
  isSelected,
  closeOnSelect,
  onSelect,
}: {
  item: { value: SidebarEmbeddedRecentTabCount; label: string };
  isSelected: boolean;
  closeOnSelect: boolean;
  onSelect: (count: SidebarEmbeddedRecentTabCount) => void;
}) {
  const handleSelect = useCallback(() => onSelect(item.value), [item.value, onSelect]);
  return (
    <DropdownMenuItem
      testID={`sidebar-recent-tab-count-${item.value}`}
      selected={isSelected}
      closeOnSelect={closeOnSelect}
      onSelect={handleSelect}
    >
      {item.label}
    </DropdownMenuItem>
  );
}

function BadgeModeMenuItem({
  item,
  isSelected,
  closeOnSelect,
  onSelect,
}: {
  item: { value: SidebarBadgeMode; label: string };
  isSelected: boolean;
  closeOnSelect: boolean;
  onSelect: (mode: SidebarBadgeMode) => void;
}) {
  const handleSelect = useCallback(() => onSelect(item.value), [item.value, onSelect]);
  return (
    <DropdownMenuItem
      testID={`sidebar-badge-mode-${item.value}`}
      selected={isSelected}
      closeOnSelect={closeOnSelect}
      onSelect={handleSelect}
    >
      {item.label}
    </DropdownMenuItem>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  menuHeader: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  menuHeaderLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
}));
