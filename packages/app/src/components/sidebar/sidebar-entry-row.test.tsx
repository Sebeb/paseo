/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarEntryStatusBadges } from "@/components/sidebar/sidebar-entry-row";
import { createEmptySidebarTabStatusSummary } from "@/utils/sidebar-tab-status-summary";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 2: 8 },
    iconSize: { md: 16 },
    borderRadius: { full: 999 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { normal: "400", medium: "500" },
    colors: {
      foreground: "#ffffff",
      foregroundMuted: "#a1a1aa",
      surface0: "#09090b",
      palette: {
        amber: { 500: "#f59e0b" },
        blue: { 500: "#3b82f6" },
        green: { 500: "#22c55e" },
        red: { 500: "#ef4444" },
        zinc: { 300: "#d4d4d8" },
      },
    },
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

vi.mock("@/components/synced-loader", () => ({
  SyncedLoader: (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": "SyncedLoader" }),
}));

vi.mock("lucide-react-native", () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": name });
  return {
    CircleAlert: createIcon("CircleAlert"),
    CircleX: createIcon("CircleX"),
    Mail: createIcon("Mail"),
    MessageSquareText: createIcon("MessageSquareText"),
    SquarePen: createIcon("SquarePen"),
  };
});

vi.stubGlobal("React", React);

afterEach(() => {
  cleanup();
});

describe("SidebarEntryStatusBadges", () => {
  it("uses custom tab-style icons for single input-required and failed statuses", () => {
    const summary = createEmptySidebarTabStatusSummary();
    summary.entryCounts.input_required = 1;
    summary.entryCounts.failed = 1;

    const { getByTestId } = render(<SidebarEntryStatusBadges summary={summary} />);

    const inputBadge = getByTestId("sidebar-entry-status-badge-input_required");
    const failedBadge = getByTestId("sidebar-entry-status-badge-failed");

    const inputIcon = inputBadge.querySelector("[data-icon='CircleAlert']");
    const failedIcon = failedBadge.querySelector("[data-icon='CircleX']");

    expect(inputIcon).not.toBeNull();
    expect(inputIcon?.getAttribute("color")).toBe(theme.colors.palette.amber[500]);
    expect(failedIcon).not.toBeNull();
    expect(failedIcon?.getAttribute("color")).toBe(theme.colors.palette.red[500]);
  });

  it("renders numeric circles for input-required and failed counts above one", () => {
    const summary = createEmptySidebarTabStatusSummary();
    summary.entryCounts.input_required = 2;
    summary.entryCounts.failed = 3;

    const { getByText, queryByTestId } = render(<SidebarEntryStatusBadges summary={summary} />);

    expect(getByText("2")).not.toBeNull();
    expect(getByText("3")).not.toBeNull();
    expect(queryByTestId("sidebar-entry-status-badge-input_required")).not.toBeNull();
    expect(queryByTestId("sidebar-entry-status-badge-failed")).not.toBeNull();
  });
});
