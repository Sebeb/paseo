/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SidebarDisplayPreferencesMenuSections,
  SidebarGroupingSelector,
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
    spacing: { 2: 8, 3: 12 },
    borderRadius: { md: 6 },
    fontSize: { xs: 11 },
    fontWeight: { medium: "500" },
    colors: {
      foregroundMuted: "#999",
      surfaceSidebarHover: "#222",
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
    onSelect,
    selected,
    testID,
  }: {
    children?: React.ReactNode;
    onSelect?: () => void;
    selected?: boolean;
    testID?: string;
  }) =>
    React.createElement(
      "button",
      {
        type: "button",
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
      embeddedTabSortModeByServerId: {},
      embeddedRecentTabCountByServerId: {},
      badgeModeByServerId: {},
      tabBarBadgeModeByServerId: {},
      autoCollapseWorkspaces: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("moves tab-only controls out of the workspace sidebar menu for vertical tabs", () => {
    appSettings.current = {
      tabLayoutMode: "vertical",
      workspaceTitleSource: "title",
    };

    const { getByTestId, queryByTestId } = render(<SidebarGroupingSelector serverId="srv" />);

    expect(getByTestId("sidebar-grouping-project")).not.toBeNull();
    expect(getByTestId("sidebar-workspace-title-source-title")).not.toBeNull();
    expect(getByTestId("sidebar-auto-collapse-workspaces")).not.toBeNull();
    expect(queryByTestId("sidebar-tab-sort-manual")).toBeNull();
    expect(queryByTestId("sidebar-recent-tab-count-5")).toBeNull();
    expect(getByTestId("sidebar-badge-mode-diff")).not.toBeNull();
    expect(getByTestId("sidebar-badge-mode-status").getAttribute("data-selected")).toBe("true");
  });

  it("keeps tab-only controls in the workspace sidebar menu for sidebar tabs", () => {
    appSettings.current = {
      tabLayoutMode: "sidebar",
      workspaceTitleSource: "title",
    };

    const { getByTestId } = render(<SidebarGroupingSelector serverId="srv" />);

    expect(getByTestId("sidebar-tab-sort-manual")).not.toBeNull();
    expect(getByTestId("sidebar-recent-tab-count-5")).not.toBeNull();
    expect(getByTestId("sidebar-badge-mode-diff")).not.toBeNull();
    expect(getByTestId("sidebar-badge-mode-status").getAttribute("data-selected")).toBe("true");
  });

  it("renders independent tab-only controls and restricted badge options for the vertical tab bar menu", () => {
    const { getByTestId, queryByTestId } = render(
      <SidebarDisplayPreferencesMenuSections
        serverId="srv"
        showTabControls
        showSidebarBadge
        badgePreference="tabBar"
        closeOnSelect={false}
      />,
    );

    expect(getByTestId("sidebar-tab-sort-manual")).not.toBeNull();
    expect(getByTestId("sidebar-recent-tab-count-5")).not.toBeNull();
    expect(queryByTestId("sidebar-badge-mode-diff")).toBeNull();
    expect(queryByTestId("tab-bar-badge-mode-diff")).toBeNull();
    expect(getByTestId("tab-bar-badge-mode-status").getAttribute("data-selected")).toBe("true");
    fireEvent.click(getByTestId("tab-bar-badge-mode-none"));

    expect(useSidebarViewStore.getState().getTabBarBadgeMode("srv")).toBe("none");
    expect(useSidebarViewStore.getState().getBadgeMode("srv")).toBe("status");
  });

  it("renders only tab sorting controls for the horizontal tab bar menu", () => {
    const { getByTestId, queryByTestId } = render(
      <SidebarDisplayPreferencesMenuSections
        serverId="srv"
        showTabControls
        showRecentTabCount={false}
        showSidebarBadge={false}
        closeOnSelect={false}
      />,
    );

    expect(getByTestId("sidebar-tab-sort-manual")).not.toBeNull();
    expect(queryByTestId("sidebar-recent-tab-count-5")).toBeNull();
    expect(queryByTestId("sidebar-badge-mode-status")).toBeNull();
    expect(queryByTestId("tab-bar-badge-mode-status")).toBeNull();
  });
});
