/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SidebarBadgePreferenceMenuItems,
  SidebarGroupingSelector,
  SidebarTabDisplayPreferencesMenuItems,
} from "@/components/sidebar/sidebar-grouping-selector";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";

const { appSettings, updateSettings, theme } = vi.hoisted(() => ({
  appSettings: {
    current: {
      tabLayoutMode: "horizontal",
      workspaceTitleSource: "title",
    },
  },
  updateSettings: vi.fn(),
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12 },
    borderRadius: { md: 6 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { medium: "500", normal: "400" },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#999",
      surface2: "#222",
      surfaceSidebarHover: "#333",
    },
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({
      uniProps,
      ...props
    }: {
      uniProps?: (theme: unknown) => Record<string, unknown>;
    } & Record<string, unknown>) => {
      const themedProps = uniProps ? uniProps(theme) : {};
      return React.createElement(Component, { ...props, ...themedProps });
    },
}));

vi.mock("@/hooks/use-settings", () => ({
  useAppSettings: () => ({
    settings: appSettings.current,
    updateSettings,
  }),
}));

vi.mock("@/constants/platform", () => ({
  isWeb: true,
}));

vi.mock("lucide-react-native", () => ({
  ChevronDown: (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": "ChevronDown" }),
  ChevronRight: (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": "ChevronRight" }),
  Settings2: (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": "Settings2" }),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "dropdown-menu" }, children),
  DropdownMenuTrigger: ({
    children,
    testID,
  }: {
    children?:
      | React.ReactNode
      | ((state: { hovered: boolean; pressed: boolean }) => React.ReactNode);
    testID?: string;
  }) =>
    React.createElement(
      "button",
      { type: "button", "data-testid": testID },
      typeof children === "function" ? children({ hovered: false, pressed: false }) : children,
    ),
  DropdownMenuContent: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement("div", { "data-testid": testID }, children),
  DropdownMenuItem: ({
    children,
    closeOnSelect,
    onSelect,
    selected,
    testID,
  }: {
    children?: React.ReactNode;
    closeOnSelect?: boolean;
    onSelect?: () => void;
    selected?: boolean;
    testID?: string;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
        "data-close-on-select": String(closeOnSelect),
        "data-selected": selected ? "true" : "false",
        "data-testid": testID,
        onClick: onSelect,
      },
      children,
    ),
  DropdownMenuSeparator: () => React.createElement("div", { role: "separator" }),
}));

vi.stubGlobal("React", React);

describe("sidebar display preferences menu", () => {
  beforeEach(() => {
    appSettings.current = {
      tabLayoutMode: "horizontal",
      workspaceTitleSource: "title",
    };
    updateSettings.mockClear();
    useSidebarViewStore.setState({
      groupModeByServerId: {},
      projectSortModeByServerId: {},
      workspaceSortModeByServerId: {},
      embeddedTabSortModeByServerId: {},
      projectShowLastCountByServerId: {},
      workspaceShowLastCountByServerId: {},
      embeddedRecentTabCountByServerId: {},
      badgeModeByServerId: {},
      autoCollapseProjects: false,
      autoCollapseWorkspaces: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps universal controls outside the default workspaces section", () => {
    const { getByTestId, queryByTestId } = render(<SidebarGroupingSelector serverId="srv" />);

    expect(getByTestId("sidebar-grouping-project")).not.toBeNull();
    expect(getByTestId("sidebar-badge-mode-status")).not.toBeNull();
    expect(getByTestId("sidebar-display-section-workspaces-content")).not.toBeNull();
    expect(getByTestId("sidebar-workspace-sort-manual")).not.toBeNull();
    expect(queryByTestId("sidebar-project-sort-manual")).toBeNull();
    expect(queryByTestId("sidebar-display-section-tabs")).toBeNull();
  });

  it("expands only one section at a time", () => {
    const { getByTestId, queryByTestId } = render(<SidebarGroupingSelector serverId="srv" />);

    fireEvent.click(getByTestId("sidebar-display-section-projects"));

    expect(getByTestId("sidebar-display-section-projects-content")).not.toBeNull();
    expect(getByTestId("sidebar-project-sort-manual")).not.toBeNull();
    expect(queryByTestId("sidebar-display-section-workspaces-content")).toBeNull();
    expect(queryByTestId("sidebar-workspace-sort-manual")).toBeNull();
  });

  it("shows the tabs section only for sidebar tabs", () => {
    appSettings.current = {
      tabLayoutMode: "vertical",
      workspaceTitleSource: "title",
    };
    const verticalMenu = render(<SidebarGroupingSelector serverId="srv" />);
    expect(verticalMenu.queryByTestId("sidebar-display-section-tabs")).toBeNull();
    verticalMenu.unmount();

    appSettings.current = {
      tabLayoutMode: "sidebar",
      workspaceTitleSource: "title",
    };
    const sidebarMenu = render(<SidebarGroupingSelector serverId="srv" />);
    fireEvent.click(sidebarMenu.getByTestId("sidebar-display-section-tabs"));

    expect(sidebarMenu.getByTestId("sidebar-tab-layout-mode-horizontal")).not.toBeNull();
    expect(sidebarMenu.getByTestId("sidebar-tab-layout-mode-sidebar")).not.toBeNull();
    expect(sidebarMenu.getByTestId("sidebar-tab-sort-manual")).not.toBeNull();
    expect(sidebarMenu.getByTestId("sidebar-recent-tab-count-5")).not.toBeNull();
  });

  it("proxies tab view mode changes through app settings", () => {
    appSettings.current = {
      tabLayoutMode: "sidebar",
      workspaceTitleSource: "title",
    };
    const { getByTestId } = render(
      <SidebarTabDisplayPreferencesMenuItems serverId="srv" closeOnSelect={false} />,
    );

    expect(getByTestId("sidebar-tab-layout-mode-sidebar").getAttribute("data-selected")).toBe(
      "true",
    );
    fireEvent.click(getByTestId("sidebar-tab-layout-mode-horizontal"));

    expect(updateSettings).toHaveBeenCalledWith({ tabLayoutMode: "horizontal" });
  });

  it("does not close the popup when selecting preferences", () => {
    const { getByTestId } = render(<SidebarGroupingSelector serverId="srv" />);

    expect(getByTestId("sidebar-grouping-status").getAttribute("data-close-on-select")).toBe(
      "false",
    );
    expect(getByTestId("sidebar-badge-mode-diff").getAttribute("data-close-on-select")).toBe(
      "false",
    );
    expect(getByTestId("sidebar-workspace-sort-created").getAttribute("data-close-on-select")).toBe(
      "false",
    );
  });

  it("renders reusable vertical tab preferences with sidebar badge and no group by", () => {
    const { getByTestId, queryByTestId } = render(
      <>
        <SidebarTabDisplayPreferencesMenuItems serverId="srv" closeOnSelect={false} />
        <SidebarBadgePreferenceMenuItems serverId="srv" closeOnSelect={false} />
      </>,
    );

    expect(getByTestId("sidebar-tab-layout-mode-horizontal")).not.toBeNull();
    expect(getByTestId("sidebar-tab-layout-mode-sidebar")).not.toBeNull();
    expect(getByTestId("sidebar-tab-sort-manual")).not.toBeNull();
    expect(getByTestId("sidebar-recent-tab-count-5")).not.toBeNull();
    expect(getByTestId("sidebar-badge-mode-status")).not.toBeNull();
    expect(queryByTestId("sidebar-grouping-project")).toBeNull();
  });
});
