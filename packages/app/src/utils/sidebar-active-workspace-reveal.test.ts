import { describe, expect, it } from "vitest";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { findActiveSidebarWorkspaceRevealTarget } from "@/utils/sidebar-active-workspace-reveal";

function workspace(input: {
  serverId: string;
  workspaceId: string;
  projectKey: string;
}): SidebarWorkspaceEntry {
  return {
    workspaceKey: `${input.serverId}:${input.workspaceId}`,
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    projectKey: input.projectKey,
    projectRootPath: `/repo/${input.projectKey}`,
    workspaceDirectory: `/repo/${input.projectKey}/${input.workspaceId}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: input.workspaceId,
    title: null,
    currentBranch: null,
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
  };
}

function project(input: {
  serverId: string;
  projectKey: string;
  workspaceIds: string[];
}): SidebarProjectEntry {
  return {
    projectKey: input.projectKey,
    projectName: input.projectKey,
    projectKind: "git",
    iconWorkingDir: `/repo/${input.projectKey}`,
    canCreateWorktree: true,
    workspaces: input.workspaceIds.map((workspaceId) =>
      workspace({
        serverId: input.serverId,
        workspaceId,
        projectKey: input.projectKey,
      }),
    ),
  };
}

describe("active sidebar workspace reveal target", () => {
  it("finds the project and workspace keys for the active workspace selection", () => {
    const projects = [
      project({ serverId: "server-a", projectKey: "project-a", workspaceIds: ["one", "two"] }),
      project({ serverId: "server-a", projectKey: "project-b", workspaceIds: ["three"] }),
    ];

    expect(
      findActiveSidebarWorkspaceRevealTarget({
        projects,
        serverId: "server-a",
        selectionEnabled: true,
        selection: { serverId: "server-a", workspaceId: "three" },
      }),
    ).toEqual({
      projectKey: "project-b",
      workspaceKey: "server-a:three",
    });
  });

  it("ignores inactive routes, hosts, and missing workspaces", () => {
    const projects = [
      project({ serverId: "server-a", projectKey: "project-a", workspaceIds: ["one"] }),
    ];

    expect(
      findActiveSidebarWorkspaceRevealTarget({
        projects,
        serverId: "server-a",
        selectionEnabled: false,
        selection: { serverId: "server-a", workspaceId: "one" },
      }),
    ).toBeNull();
    expect(
      findActiveSidebarWorkspaceRevealTarget({
        projects,
        serverId: "server-a",
        selectionEnabled: true,
        selection: { serverId: "server-b", workspaceId: "one" },
      }),
    ).toBeNull();
    expect(
      findActiveSidebarWorkspaceRevealTarget({
        projects,
        serverId: "server-a",
        selectionEnabled: true,
        selection: { serverId: "server-a", workspaceId: "missing" },
      }),
    ).toBeNull();
  });
});
