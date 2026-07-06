/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SidebarEntryRowContent,
  SidebarEntryStatusIconBadge,
  SidebarEntryStatusBadges,
} from "@/components/sidebar/sidebar-entry-row";
import { createEmptySidebarTabStatusSummary } from "@/utils/sidebar-tab-status-summary";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8 },
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
    MessageSquareText: createIcon("MessageSquareText"),
    SquarePen: createIcon("SquarePen"),
  };
});

vi.stubGlobal("React", React);

afterEach(() => {
  cleanup();
});

describe("SidebarEntryStatusBadges", () => {
  it("renders a label prefix before the label text", () => {
    const leading = React.createElement("span", { "data-testid": "leading-icon" });
    const labelPrefix = React.createElement("span", { "data-testid": "label-prefix" }, "3");
    const { getByTestId, getByText } = render(
      <SidebarEntryRowContent leading={leading} labelPrefix={labelPrefix} label="Implement" />,
    );

    const prefix = getByTestId("label-prefix");
    const label = getByText("Implement");

    expect(prefix.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("swaps the leading slot to hover content without unmounting the base leading content", () => {
    const leading = React.createElement("span", { "data-testid": "leading-icon" });
    const hoverLeading = React.createElement("span", { "data-testid": "hover-leading" }, "toggle");
    const { getByTestId } = render(
      <SidebarEntryRowContent
        leading={leading}
        hoverLeading={hoverLeading}
        showHoverLeading
        label="Implement"
      />,
    );

    expect(getByTestId("hover-leading")).not.toBeNull();
    expect(getByTestId("leading-icon").parentElement?.getAttribute("style")).toContain(
      "opacity: 0",
    );
  });

  it("renders a leading badge over the leading icon", () => {
    const leading = React.createElement("span", { "data-testid": "leading-icon" });
    const leadingBadge = React.createElement("span", { "data-testid": "leading-badge" }, "P");
    const { getByTestId } = render(
      <SidebarEntryRowContent leading={leading} leadingBadge={leadingBadge} label="Implement" />,
    );

    expect(getByTestId("leading-badge").parentElement?.getAttribute("style")).toContain(
      "position: absolute",
    );
  });

  it("collapses embedded label and subtitle newlines into single display lines", () => {
    const leading = React.createElement("span", { "data-testid": "leading-icon" });
    const { getByText } = render(
      <SidebarEntryRowContent
        leading={leading}
        label={"Run command\n/Users/seb/project"}
        subtitle={"getpaseo\npaseo"}
      />,
    );

    expect(getByText("Run command /Users/seb/project")).not.toBeNull();
    expect(getByText("getpaseo paseo")).not.toBeNull();
  });

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

    const { getByTestId, getByText } = render(<SidebarEntryStatusBadges summary={summary} />);

    expect(getByText("2")).not.toBeNull();
    expect(getByText("3")).not.toBeNull();
    expect(
      getByTestId("sidebar-entry-status-badge-input_required").getAttribute("style"),
    ).toContain("width: 14px");
    expect(getByTestId("sidebar-entry-status-badge-failed").getAttribute("style")).toContain(
      "width: 14px",
    );
  });

  it("renders status icon badges without count variants", () => {
    const { getByTestId, queryByText } = render(
      <>
        <SidebarEntryStatusIconBadge kind="queued_messages" />
        <SidebarEntryStatusIconBadge kind="input_required" />
        <SidebarEntryStatusIconBadge kind="in_progress" />
        <SidebarEntryStatusIconBadge kind="failed" />
      </>,
    );

    expect(getByTestId("sidebar-entry-status-icon-badge-queued_messages")).not.toBeNull();
    expect(
      getByTestId("sidebar-entry-status-icon-badge-queued_messages").querySelector(
        "[data-icon='MessageSquareText']",
      ),
    ).not.toBeNull();
    expect(
      getByTestId("sidebar-entry-status-icon-badge-input_required").querySelector(
        "[data-icon='CircleAlert']",
      ),
    ).not.toBeNull();
    expect(
      getByTestId("sidebar-entry-status-icon-badge-in_progress").querySelector(
        "[data-icon='SyncedLoader']",
      ),
    ).not.toBeNull();
    expect(
      getByTestId("sidebar-entry-status-icon-badge-failed").querySelector("[data-icon='CircleX']"),
    ).not.toBeNull();
    expect(queryByText("2")).toBeNull();
    expect(queryByText("+")).toBeNull();
  });

  it("renders unread single status as a dot without a mail icon", () => {
    const summary = createEmptySidebarTabStatusSummary();
    summary.entryCounts.unread = 1;

    const { getByTestId } = render(<SidebarEntryStatusBadges summary={summary} />);

    const unreadBadge = getByTestId("sidebar-entry-status-badge-unread");

    expect(unreadBadge.querySelector("[data-icon='Mail']")).toBeNull();
    expect(unreadBadge.getAttribute("style")).toContain("width: 14px");
    expect(unreadBadge.getAttribute("style")).toContain("background-color: rgb(34, 197, 94)");
  });

  it("renders multi in-progress counts inside the loader", () => {
    const summary = createEmptySidebarTabStatusSummary();
    summary.entryCounts.in_progress = 2;

    const { getByTestId, getByText } = render(<SidebarEntryStatusBadges summary={summary} />);

    const inProgressBadge = getByTestId("sidebar-entry-status-badge-in_progress");
    const count = getByText("2");

    expect(inProgressBadge.querySelector("[data-icon='SyncedLoader']")).not.toBeNull();
    expect(inProgressBadge.querySelector("[data-icon='SyncedLoader']")?.getAttribute("size")).toBe(
      "14",
    );
    expect(inProgressBadge.getAttribute("style")).toContain("width: 16px");
    expect(count.getAttribute("style")).toContain("color: rgb(59, 130, 246)");
  });

  it("caps displayed status badge counts at plus", () => {
    const summary = createEmptySidebarTabStatusSummary();
    summary.entryCounts.queued_messages = 10;
    summary.entryCounts.input_required = 11;
    summary.entryCounts.in_progress = 12;
    summary.entryCounts.failed = 13;

    const { getAllByText, queryByText } = render(<SidebarEntryStatusBadges summary={summary} />);

    expect(getAllByText("+")).toHaveLength(4);
    expect(queryByText("10")).toBeNull();
    expect(queryByText("11")).toBeNull();
    expect(queryByText("12")).toBeNull();
    expect(queryByText("13")).toBeNull();
  });
});
