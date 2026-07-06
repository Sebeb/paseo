/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SidebarWorkspaceRowContent,
  SidebarWorkspaceTrailingActionOverlay,
  SidebarWorkspaceTrailingActionSlot,
} from "@/components/sidebar/sidebar-workspace-row-content";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8 },
    iconSize: { md: 16 },
    borderWidth: { 1: 1 },
    borderRadius: { sm: 4, full: 999 },
    fontSize: { xs: 11, sm: 13 },
    fontWeight: { normal: "400", medium: "500" },
    colors: {
      foreground: "#fff",
      foregroundMuted: "#aaa",
      surface0: "#000",
      surface1: "#111",
      surface2: "#222",
      border: "#333",
      palette: {
        amber: { 500: "#f59e0b", 700: "#b45309" },
        blue: { 500: "#3b82f6" },
        green: { 500: "#22c55e" },
        purple: { 500: "#a855f7" },
        red: { 500: "#ef4444" },
        zinc: { 300: "#d4d4d8" },
      },
    },
    colorScheme: "dark",
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

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => false,
}));

vi.mock("@/constants/platform", () => ({
  isWeb: true,
  isNative: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/workspace-hover-card", () => ({
  WorkspaceHoverCard: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/synced-loader", () => ({
  SyncedLoader: (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": "SyncedLoader" }),
}));

vi.mock("@/components/icons/github-icon", () => ({
  GitHubIcon: (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": "GitHubIcon" }),
}));

vi.mock("lucide-react-native", () => {
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement("span", { ...props, "data-icon": name });
  return {
    CircleAlert: createIcon("CircleAlert"),
    CircleX: createIcon("CircleX"),
    ChevronDown: createIcon("ChevronDown"),
    ChevronRight: createIcon("ChevronRight"),
    ExternalLink: createIcon("ExternalLink"),
    Folder: createIcon("Folder"),
    FolderGit2: createIcon("FolderGit2"),
    GitPullRequest: createIcon("GitPullRequest"),
    Globe: createIcon("Globe"),
    MessageSquareText: createIcon("MessageSquareText"),
    Monitor: createIcon("Monitor"),
    SquarePen: createIcon("SquarePen"),
    SquareTerminal: createIcon("SquareTerminal"),
  };
});

vi.stubGlobal("React", React);

const wideTrailingSlotStyle = { width: 76 } as const;

function createWorkspace(input: Partial<SidebarWorkspaceEntry> = {}): SidebarWorkspaceEntry {
  return {
    workspaceKey: "server:workspace",
    serverId: "server",
    workspaceId: "workspace",
    projectKey: "project",
    projectName: "Project",
    projectRootPath: "/repo/project",
    workspaceDirectory: "/repo/project/workspace",
    projectKind: "git",
    workspaceKind: "local_checkout",
    name: "main",
    title: null,
    currentBranch: "main",
    createdAt: null,
    activityAt: null,
    statusBucket: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
    ...input,
  };
}

describe("SidebarWorkspaceRowContent", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the workspace kind icon in non-embedded rows", () => {
    const { container, queryByTestId } = render(
      <SidebarWorkspaceRowContent
        workspace={createWorkspace()}
        isHovered={false}
        isLoading={false}
      />,
    );

    expect(queryByTestId("workspace-kind-icon-local_checkout")).not.toBeNull();
    expect(container.querySelector('[data-icon="Monitor"]')).not.toBeNull();
  });

  it("renders the branch as the primary label when configured", () => {
    const { getByText, queryByText } = render(
      <SidebarWorkspaceRowContent
        workspace={createWorkspace({
          name: "Payments Refactor",
          title: "Payments Refactor",
          currentBranch: "feat/payments-refactor",
        })}
        workspaceTitleSource="branch"
        isHovered={false}
        isLoading={false}
      />,
    );

    expect(getByText("feat/payments-refactor")).not.toBeNull();
    expect(queryByText("Payments Refactor")).toBeNull();
  });

  it("overlays the embedded expand control in the workspace icon slot", () => {
    const { container, getByTestId, queryByTestId } = render(
      <SidebarWorkspaceRowContent
        workspace={createWorkspace({ workspaceKind: "worktree", name: "feature" })}
        isHovered
        isLoading={false}
        expandable
        expanded={false}
      />,
    );

    expect(queryByTestId("workspace-kind-icon-worktree")).not.toBeNull();
    expect(getByTestId("workspace-leading-visual").getAttribute("style")).toContain("width: 14px");
    expect(container.querySelector('[data-icon="FolderGit2"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="ChevronRight"]')).not.toBeNull();
  });

  it("does not reserve trailing space when trailing controls are hidden", () => {
    const { queryByTestId } = render(
      <SidebarWorkspaceRowContent
        workspace={createWorkspace({ name: "long workspace name" })}
        isHovered={false}
        isLoading={false}
        hasTrailingContent={false}
      >
        <span data-testid="hidden-trailing-control" />
      </SidebarWorkspaceRowContent>,
    );

    expect(queryByTestId("workspace-row-right")).toBeNull();
    expect(queryByTestId("hidden-trailing-control")).toBeNull();
  });

  it("renders script icons after trailing controls in the shared right context", () => {
    const { container, getByTestId } = render(
      <SidebarWorkspaceRowContent
        workspace={createWorkspace({ hasRunningScripts: true })}
        scriptIconKind="service"
        isHovered={false}
        isLoading={false}
      >
        <span data-testid="workspace-trailing-control" />
      </SidebarWorkspaceRowContent>,
    );

    expect(getByTestId("workspace-row-right")).not.toBeNull();
    expect(getByTestId("workspace-trailing-control")).not.toBeNull();
    expect(getByTestId("workspace-globe-icon")).not.toBeNull();
    expect(
      Array.from(
        container.querySelectorAll(
          '[data-testid="workspace-trailing-control"], [data-testid="workspace-globe-icon"]',
        ),
      ).map((element) => element.getAttribute("data-testid")),
    ).toEqual(["workspace-trailing-control", "workspace-globe-icon"]);
  });

  it("does not mount hidden trailing controls just to show a script icon", () => {
    const { getByTestId, queryByTestId } = render(
      <SidebarWorkspaceRowContent
        workspace={createWorkspace({ hasRunningScripts: true })}
        scriptIconKind="command"
        isHovered={false}
        isLoading={false}
        hasTrailingContent={false}
      >
        <span data-testid="hidden-trailing-control" />
      </SidebarWorkspaceRowContent>,
    );

    expect(getByTestId("workspace-row-right")).not.toBeNull();
    expect(getByTestId("workspace-terminal-icon")).not.toBeNull();
    expect(queryByTestId("hidden-trailing-control")).toBeNull();
  });

  it("centers trailing action overlays inside a fixed-height slot", () => {
    const { getByTestId } = render(
      <SidebarWorkspaceTrailingActionSlot>
        <SidebarWorkspaceTrailingActionOverlay visible>
          <span data-testid="workspace-trailing-action" />
        </SidebarWorkspaceTrailingActionOverlay>
      </SidebarWorkspaceTrailingActionSlot>,
    );

    const slot = getByTestId("workspace-trailing-action").parentElement?.parentElement;
    const overlay = getByTestId("workspace-trailing-action").parentElement;

    expect(slot?.getAttribute("style")).toContain("height: 24px");
    expect(slot?.getAttribute("style")).toContain("justify-content: center");
    expect(overlay?.getAttribute("style")).toContain("bottom: 0px");
    expect(overlay?.getAttribute("style")).toContain("justify-content: center");
  });

  it("allows trailing action slots to reserve custom widths for multi-icon right contexts", () => {
    const { getByTestId } = render(
      <SidebarWorkspaceTrailingActionSlot style={wideTrailingSlotStyle}>
        <SidebarWorkspaceTrailingActionOverlay visible>
          <span data-testid="workspace-trailing-action-wide" />
        </SidebarWorkspaceTrailingActionOverlay>
      </SidebarWorkspaceTrailingActionSlot>,
    );

    const slot = getByTestId("workspace-trailing-action-wide").parentElement?.parentElement;

    expect(slot?.getAttribute("style")).toContain("width: 76px");
    expect(slot?.getAttribute("style")).toContain("height: 24px");
  });

  it("keeps the normal workspace icon when right-side status badges own status display", () => {
    const { queryByTestId } = render(
      <SidebarWorkspaceRowContent
        workspace={createWorkspace({ statusBucket: "attention", workspaceKind: "worktree" })}
        isHovered={false}
        isLoading={false}
        suppressStatusVisual
      />,
    );

    expect(queryByTestId("workspace-kind-icon-worktree")).not.toBeNull();
    expect(queryByTestId("workspace-status-indicator-attention")).toBeNull();
  });
});
