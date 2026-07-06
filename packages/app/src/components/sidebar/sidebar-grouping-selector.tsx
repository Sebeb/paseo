import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronRight, Settings2 } from "lucide-react-native";
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
  type SidebarProjectShowLastCount,
  type SidebarProjectSortMode,
  type SidebarShowLastCount,
  type SidebarSortMode,
  type SidebarWorkspaceShowLastCount,
  type SidebarWorkspaceSortMode,
} from "@/stores/sidebar-view-store";
import { isWeb as platformIsWeb } from "@/constants/platform";

const ThemedSettings2 = withUnistyles(Settings2);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);

const iconColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const GROUP_MODE_ITEMS: Array<{ value: SidebarGroupMode; label: string }> = [
  { value: "project", label: "Project" },
  { value: "status", label: "Status" },
];

const SORT_MODE_ITEMS: Array<{ value: SidebarSortMode; label: string }> = [
  { value: "manual", label: "Manual" },
  { value: "created", label: "Created" },
  { value: "lastUpdated", label: "Last updated" },
  { value: "status", label: "Status" },
];

const SHOW_LAST_COUNT_ITEMS: Array<{ value: SidebarShowLastCount; label: string }> = [
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

type DisplayPreferenceSectionId = "projects" | "workspaces" | "tabs";

export function SidebarGroupingSelector({ serverId }: { serverId: string | null }) {
  const { settings } = useAppSettings();
  const groupMode = useSidebarViewStore((state) =>
    serverId ? state.getGroupMode(serverId) : "project",
  );
  const setGroupMode = useSidebarViewStore((state) => state.setGroupMode);
  const [expandedSection, setExpandedSection] = useState<DisplayPreferenceSectionId>("workspaces");
  const showTabsSection = settings.tabLayoutMode === "sidebar";

  useEffect(() => {
    if (expandedSection === "tabs" && !showTabsSection) {
      setExpandedSection("workspaces");
    }
  }, [expandedSection, showTabsSection]);

  const handleGroupModeSelect = useCallback(
    (mode: SidebarGroupMode) => {
      if (!serverId) return;
      setGroupMode(serverId, mode);
    },
    [serverId, setGroupMode],
  );

  const handleSectionPress = useCallback((section: DisplayPreferenceSectionId) => {
    setExpandedSection(section);
  }, []);

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
        <ThemedSettings2 size={14} uniProps={iconColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width={240} testID="sidebar-grouping-menu">
        <PreferenceGroup label="Group by">
          {GROUP_MODE_ITEMS.map((item) => (
            <PreferenceMenuItem
              key={item.value}
              item={item}
              testIDPrefix="sidebar-grouping"
              isSelected={groupMode === item.value}
              closeOnSelect={false}
              onSelect={handleGroupModeSelect}
            />
          ))}
        </PreferenceGroup>
        <DropdownMenuSeparator />
        <SidebarBadgePreferenceMenuItems serverId={serverId} closeOnSelect={false} />
        <DropdownMenuSeparator />
        <DisplayPreferenceSection
          id="projects"
          title="Projects"
          expanded={expandedSection === "projects"}
          onPress={handleSectionPress}
        >
          <ProjectPreferencesSection serverId={serverId} />
        </DisplayPreferenceSection>
        <DropdownMenuSeparator />
        <DisplayPreferenceSection
          id="workspaces"
          title="Workspaces"
          expanded={expandedSection === "workspaces"}
          onPress={handleSectionPress}
        >
          <WorkspacePreferencesSection serverId={serverId} />
        </DisplayPreferenceSection>
        {showTabsSection ? (
          <Fragment>
            <DropdownMenuSeparator />
            <DisplayPreferenceSection
              id="tabs"
              title="Tabs"
              expanded={expandedSection === "tabs"}
              onPress={handleSectionPress}
            >
              <SidebarTabDisplayPreferencesMenuItems serverId={serverId} closeOnSelect={false} />
            </DisplayPreferenceSection>
          </Fragment>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectPreferencesSection({ serverId }: { serverId: string | null }) {
  const groupMode = useSidebarViewStore((state) =>
    serverId ? state.getGroupMode(serverId) : "project",
  );
  const sortMode = useSidebarViewStore((state) =>
    serverId ? state.getProjectSortMode(serverId) : "manual",
  );
  const showLastCount = useSidebarViewStore((state) =>
    serverId ? state.getProjectShowLastCount(serverId) : "all",
  );
  const autoCollapseProjects = useSidebarViewStore((state) => state.autoCollapseProjects);
  const singleProjectViewEnabled = useSidebarViewStore((state) => state.singleProjectViewEnabled);
  const setSortMode = useSidebarViewStore((state) => state.setProjectSortMode);
  const setShowLastCount = useSidebarViewStore((state) => state.setProjectShowLastCount);
  const setAutoCollapseProjects = useSidebarViewStore((state) => state.setAutoCollapseProjects);
  const setSingleProjectViewEnabled = useSidebarViewStore(
    (state) => state.setSingleProjectViewEnabled,
  );

  const handleSortSelect = useCallback(
    (mode: SidebarProjectSortMode) => {
      if (!serverId) return;
      setSortMode(serverId, mode);
    },
    [serverId, setSortMode],
  );
  const handleShowLastSelect = useCallback(
    (count: SidebarProjectShowLastCount) => {
      if (!serverId) return;
      setShowLastCount(serverId, count);
    },
    [serverId, setShowLastCount],
  );
  const handleAutoCollapseSelect = useCallback(() => {
    setAutoCollapseProjects(!autoCollapseProjects);
  }, [autoCollapseProjects, setAutoCollapseProjects]);
  const handleSingleProjectViewSelect = useCallback(() => {
    setSingleProjectViewEnabled(!singleProjectViewEnabled);
  }, [setSingleProjectViewEnabled, singleProjectViewEnabled]);

  return (
    <>
      <SortPreferenceGroup
        selectedValue={sortMode}
        testIDPrefix="sidebar-project-sort"
        onSelect={handleSortSelect}
      />
      <DropdownMenuSeparator />
      <ShowLastPreferenceGroup
        selectedValue={showLastCount}
        testIDPrefix="sidebar-project-show-last"
        onSelect={handleShowLastSelect}
      />
      <DropdownMenuSeparator />
      {groupMode === "project" ? (
        <Fragment>
          <DropdownMenuItem
            testID="sidebar-single-project-view"
            selected={singleProjectViewEnabled}
            closeOnSelect={false}
            onSelect={handleSingleProjectViewSelect}
          >
            Single project view
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </Fragment>
      ) : null}
      <DropdownMenuItem
        testID="sidebar-auto-collapse-projects"
        selected={autoCollapseProjects}
        closeOnSelect={false}
        onSelect={handleAutoCollapseSelect}
      >
        Auto collapse
      </DropdownMenuItem>
    </>
  );
}

function WorkspacePreferencesSection({ serverId }: { serverId: string | null }) {
  const { settings, updateSettings } = useAppSettings();
  const sortMode = useSidebarViewStore((state) =>
    serverId ? state.getWorkspaceSortMode(serverId) : "manual",
  );
  const showLastCount = useSidebarViewStore((state) =>
    serverId ? state.getWorkspaceShowLastCount(serverId) : "all",
  );
  const autoCollapseWorkspaces = useSidebarViewStore((state) => state.autoCollapseWorkspaces);
  const setSortMode = useSidebarViewStore((state) => state.setWorkspaceSortMode);
  const setShowLastCount = useSidebarViewStore((state) => state.setWorkspaceShowLastCount);
  const setAutoCollapseWorkspaces = useSidebarViewStore((state) => state.setAutoCollapseWorkspaces);

  const handleSortSelect = useCallback(
    (mode: SidebarWorkspaceSortMode) => {
      if (!serverId) return;
      setSortMode(serverId, mode);
    },
    [serverId, setSortMode],
  );
  const handleShowLastSelect = useCallback(
    (count: SidebarWorkspaceShowLastCount) => {
      if (!serverId) return;
      setShowLastCount(serverId, count);
    },
    [serverId, setShowLastCount],
  );
  const handleWorkspaceTitleSourceSelect = useCallback(
    (source: WorkspaceTitleSource) => {
      void updateSettings({ workspaceTitleSource: source });
    },
    [updateSettings],
  );
  const handleAutoCollapseSelect = useCallback(() => {
    setAutoCollapseWorkspaces(!autoCollapseWorkspaces);
  }, [autoCollapseWorkspaces, setAutoCollapseWorkspaces]);

  return (
    <>
      <SortPreferenceGroup
        selectedValue={sortMode}
        testIDPrefix="sidebar-workspace-sort"
        onSelect={handleSortSelect}
      />
      <DropdownMenuSeparator />
      <ShowLastPreferenceGroup
        selectedValue={showLastCount}
        testIDPrefix="sidebar-workspace-show-last"
        onSelect={handleShowLastSelect}
      />
      <DropdownMenuSeparator />
      <PreferenceGroup label="Title">
        {WORKSPACE_TITLE_SOURCE_ITEMS.map((item) => (
          <PreferenceMenuItem
            key={item.value}
            item={item}
            testIDPrefix="sidebar-workspace-title-source"
            isSelected={settings.workspaceTitleSource === item.value}
            closeOnSelect={false}
            onSelect={handleWorkspaceTitleSourceSelect}
          />
        ))}
      </PreferenceGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        testID="sidebar-auto-collapse-workspaces"
        selected={autoCollapseWorkspaces}
        closeOnSelect={false}
        onSelect={handleAutoCollapseSelect}
      >
        Auto collapse
      </DropdownMenuItem>
    </>
  );
}

export function SidebarTabDisplayPreferencesMenuItems({
  serverId,
  showRecentTabCount = true,
  closeOnSelect = false,
}: {
  serverId: string | null;
  showRecentTabCount?: boolean;
  closeOnSelect?: boolean;
}) {
  const sortMode = useSidebarViewStore((state) =>
    serverId ? state.getEmbeddedTabSortMode(serverId) : "manual",
  );
  const recentTabCount = useSidebarViewStore((state) =>
    serverId ? state.getEmbeddedRecentTabCount(serverId) : 5,
  );
  const setSortMode = useSidebarViewStore((state) => state.setEmbeddedTabSortMode);
  const setRecentTabCount = useSidebarViewStore((state) => state.setEmbeddedRecentTabCount);

  const handleSortSelect = useCallback(
    (mode: SidebarEmbeddedTabSortMode) => {
      if (!serverId) return;
      setSortMode(serverId, mode);
    },
    [serverId, setSortMode],
  );
  const handleRecentTabCountSelect = useCallback(
    (count: SidebarEmbeddedRecentTabCount) => {
      if (!serverId) return;
      setRecentTabCount(serverId, count);
    },
    [serverId, setRecentTabCount],
  );

  return (
    <>
      <SortPreferenceGroup
        selectedValue={sortMode}
        testIDPrefix="sidebar-tab-sort"
        closeOnSelect={closeOnSelect}
        onSelect={handleSortSelect}
      />
      {showRecentTabCount ? (
        <Fragment>
          <DropdownMenuSeparator />
          <ShowLastPreferenceGroup
            selectedValue={recentTabCount}
            testIDPrefix="sidebar-recent-tab-count"
            closeOnSelect={closeOnSelect}
            onSelect={handleRecentTabCountSelect}
          />
        </Fragment>
      ) : null}
    </>
  );
}

export function SidebarBadgePreferenceMenuItems({
  serverId,
  closeOnSelect = false,
}: {
  serverId: string | null;
  closeOnSelect?: boolean;
}) {
  const badgeMode = useSidebarViewStore((state) =>
    serverId ? state.getBadgeMode(serverId) : "status",
  );
  const setBadgeMode = useSidebarViewStore((state) => state.setBadgeMode);

  const handleBadgeModeSelect = useCallback(
    (mode: SidebarBadgeMode) => {
      if (!serverId) return;
      setBadgeMode(serverId, mode);
    },
    [serverId, setBadgeMode],
  );

  return (
    <PreferenceGroup label="Sidebar badge">
      {BADGE_MODE_ITEMS.map((item) => (
        <PreferenceMenuItem
          key={item.value}
          item={item}
          testIDPrefix="sidebar-badge-mode"
          isSelected={badgeMode === item.value}
          closeOnSelect={closeOnSelect}
          onSelect={handleBadgeModeSelect}
        />
      ))}
    </PreferenceGroup>
  );
}

function SortPreferenceGroup({
  selectedValue,
  testIDPrefix,
  closeOnSelect = false,
  onSelect,
}: {
  selectedValue: SidebarSortMode;
  testIDPrefix: string;
  closeOnSelect?: boolean;
  onSelect: (value: SidebarSortMode) => void;
}) {
  return (
    <PreferenceGroup label="Sort by">
      {SORT_MODE_ITEMS.map((item) => (
        <PreferenceMenuItem
          key={item.value}
          item={item}
          testIDPrefix={testIDPrefix}
          isSelected={selectedValue === item.value}
          closeOnSelect={closeOnSelect}
          onSelect={onSelect}
        />
      ))}
    </PreferenceGroup>
  );
}

function ShowLastPreferenceGroup({
  selectedValue,
  testIDPrefix,
  closeOnSelect = false,
  onSelect,
}: {
  selectedValue: SidebarShowLastCount;
  testIDPrefix: string;
  closeOnSelect?: boolean;
  onSelect: (value: SidebarShowLastCount) => void;
}) {
  return (
    <PreferenceGroup label="Show last">
      {SHOW_LAST_COUNT_ITEMS.map((item) => (
        <PreferenceMenuItem
          key={String(item.value)}
          item={item}
          testIDPrefix={testIDPrefix}
          isSelected={selectedValue === item.value}
          closeOnSelect={closeOnSelect}
          onSelect={onSelect}
        />
      ))}
    </PreferenceGroup>
  );
}

function PreferenceGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <View style={styles.menuHeader}>
        <Text style={styles.menuHeaderLabel}>{label}</Text>
      </View>
      {children}
    </>
  );
}

function PreferenceMenuItem<T extends string | number>({
  item,
  testIDPrefix,
  isSelected,
  closeOnSelect,
  onSelect,
}: {
  item: { value: T; label: string };
  testIDPrefix: string;
  isSelected: boolean;
  closeOnSelect: boolean;
  onSelect: (value: T) => void;
}) {
  const handleSelect = useCallback(() => onSelect(item.value), [item.value, onSelect]);
  return (
    <DropdownMenuItem
      testID={`${testIDPrefix}-${item.value}`}
      selected={isSelected}
      closeOnSelect={closeOnSelect}
      onSelect={handleSelect}
    >
      {item.label}
    </DropdownMenuItem>
  );
}

function DisplayPreferenceSection({
  id,
  title,
  expanded,
  onPress,
  children,
}: {
  id: DisplayPreferenceSectionId;
  title: string;
  expanded: boolean;
  onPress: (section: DisplayPreferenceSectionId) => void;
  children: ReactNode;
}) {
  const handlePress = useCallback(() => onPress(id), [id, onPress]);
  const sectionHeaderStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.sectionHeader,
      (hovered || pressed || expanded) && styles.sectionHeaderActive,
    ],
    [expanded],
  );
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        onPress={handlePress}
        style={sectionHeaderStyle}
        testID={`sidebar-display-section-${id}`}
      >
        <Text style={styles.sectionHeaderText}>{title}</Text>
        {expanded ? (
          <ThemedChevronDown size={14} uniProps={iconColorMapping} />
        ) : (
          <ThemedChevronRight size={14} uniProps={iconColorMapping} />
        )}
      </Pressable>
      {expanded ? <View testID={`sidebar-display-section-${id}-content`}>{children}</View> : null}
    </>
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
  sectionHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  sectionHeaderActive: {
    backgroundColor: theme.colors.surface2,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
}));
