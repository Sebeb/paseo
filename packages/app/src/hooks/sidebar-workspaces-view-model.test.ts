import { describe, expect, it } from "vitest";
import type { WorkspaceStructureProject } from "@/projects/workspace-structure";
import {
  appendMissingOrderKeys,
  applySidebarShowLastCount,
  applyStoredOrdering,
  buildSidebarProjectsFromStructure,
  computeSidebarOrderUpdates,
  deriveSidebarLoadingState,
  sortSidebarProjects,
  sortSidebarWorkspaceProjects,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
} from "./sidebar-workspaces-view-model";

interface OrderedItem {
  key: string;
}

function item(key: string): OrderedItem {
  return { key };
}

function project(input: {
  projectKey: string;
  projectName?: string;
  projectKind?: WorkspaceStructureProject["projectKind"];
  iconWorkingDir?: string;
  workspaceKeys: string[];
}): WorkspaceStructureProject {
  return {
    projectKey: input.projectKey,
    projectName: input.projectName ?? input.projectKey,
    projectKind: input.projectKind ?? "git",
    iconWorkingDir: input.iconWorkingDir ?? input.projectKey,
    hosts: [
      {
        serverId: "srv",
        iconWorkingDir: input.iconWorkingDir ?? input.projectKey,
        canCreateWorktree: (input.projectKind ?? "git") === "git",
      },
    ],
    workspaceKeys: input.workspaceKeys,
  };
}

function sidebarProject(input: {
  projectKey: string;
  workspaceKeys: string[];
  serverId?: string;
}): SidebarProjectEntry {
  const projects = buildSidebarProjectsFromStructure({
    serverId: input.serverId ?? "srv",
    projects: [project({ projectKey: input.projectKey, workspaceKeys: input.workspaceKeys })],
  });
  const result = projects[0];
  if (!result) {
    throw new Error("expected a project entry");
  }
  return result;
}

function workspace(input: {
  key: string;
  name: string;
  createdAt?: string | null;
  activityAt?: string | null;
  statusBucket?: SidebarWorkspaceEntry["statusBucket"];
}): SidebarWorkspaceEntry {
  return {
    workspaceKey: `srv:${input.key}`,
    serverId: "srv",
    workspaceId: input.key,
    projectKey: "project-1",
    projectName: "Project 1",
    projectRootPath: "/repo",
    workspaceDirectory: `/repo/${input.key}`,
    projectKind: "git",
    workspaceKind: "checkout",
    name: input.name,
    title: null,
    currentBranch: null,
    createdAt: input.createdAt ? new Date(input.createdAt) : null,
    activityAt: input.activityAt ? new Date(input.activityAt) : null,
    statusBucket: input.statusBucket ?? "done",
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

describe("applyStoredOrdering", () => {
  it("keeps unknown items on the baseline while applying stored order", () => {
    const result = applyStoredOrdering({
      items: [item("new"), item("a"), item("b")],
      storedOrder: ["b", "a"],
      getKey: (entry) => entry.key,
    });

    expect(result.map((entry) => entry.key)).toEqual(["new", "b", "a"]);
  });

  it("ignores stale and duplicate stored keys", () => {
    const result = applyStoredOrdering({
      items: [item("x"), item("y")],
      storedOrder: ["missing", "y", "y", "x"],
      getKey: (entry) => entry.key,
    });

    expect(result.map((entry) => entry.key)).toEqual(["y", "x"]);
  });

  it("returns baseline when there is no persisted order", () => {
    const baseline = [item("first"), item("second")];
    const result = applyStoredOrdering({
      items: baseline,
      storedOrder: [],
      getKey: (entry) => entry.key,
    });

    expect(result).toBe(baseline);
  });
});

describe("appendMissingOrderKeys", () => {
  it("appends unseen keys while preserving existing order", () => {
    const result = appendMissingOrderKeys({
      currentOrder: ["project-b", "project-a"],
      visibleKeys: ["project-a", "project-b", "project-c"],
    });

    expect(result).toEqual(["project-b", "project-a", "project-c"]);
  });

  it("returns the same array when there are no unseen keys", () => {
    const currentOrder = ["project-a", "project-b"];

    const result = appendMissingOrderKeys({
      currentOrder,
      visibleKeys: ["project-b", "project-a"],
    });

    expect(result).toBe(currentOrder);
  });
});

describe("buildSidebarProjectsFromStructure", () => {
  it("creates structural workspace rows from ordered workspace keys", () => {
    const projects = buildSidebarProjectsFromStructure({
      serverId: "srv",
      projects: [
        project({
          projectKey: "project-1",
          projectName: "Project 1",
          iconWorkingDir: "/repo/main",
          workspaceKeys: ["ws-main"],
        }),
      ],
    });

    expect(projects).toHaveLength(1);
    expect(projects[0]?.projectName).toBe("Project 1");
    expect(projects[0]?.workspaces[0]).toMatchObject({
      workspaceKey: "srv:ws-main",
      serverId: "srv",
      workspaceId: "ws-main",
      projectRootPath: "/repo/main",
      projectKind: "git",
    });
  });

  it("preserves the structure hook project order", () => {
    const projects = buildSidebarProjectsFromStructure({
      serverId: "srv",
      projects: [
        project({ projectKey: "project-b", workspaceKeys: ["ws-b"] }),
        project({ projectKey: "project-a", workspaceKeys: ["ws-a"] }),
      ],
    });

    expect(projects.map((entry) => entry.projectKey)).toEqual(["project-b", "project-a"]);
  });

  it("preserves the structure hook workspace order", () => {
    const projects = buildSidebarProjectsFromStructure({
      serverId: "srv",
      projects: [project({ projectKey: "project-1", workspaceKeys: ["feature", "main"] })],
    });

    expect(projects[0]?.workspaces.map((entry) => entry.workspaceId)).toEqual(["feature", "main"]);
  });
});

describe("computeSidebarOrderUpdates", () => {
  it("returns no updates when there are no visible projects", () => {
    const updates = computeSidebarOrderUpdates({
      projects: [],
      persistedProjectOrder: ["stale-project"],
      getWorkspaceOrder: () => [],
    });

    expect(updates).toEqual({ projectOrder: null, workspaceOrders: [] });
  });

  it("appends unseen projects and workspaces to the persisted orders", () => {
    const projects = [
      sidebarProject({ projectKey: "project-a", workspaceKeys: ["ws-1", "ws-2"] }),
      sidebarProject({ projectKey: "project-b", workspaceKeys: ["ws-3"] }),
    ];

    const updates = computeSidebarOrderUpdates({
      projects,
      persistedProjectOrder: ["project-a"],
      getWorkspaceOrder: (projectKey) => (projectKey === "project-a" ? ["srv:ws-1"] : []),
    });

    expect(updates.projectOrder).toEqual(["project-a", "project-b"]);
    expect(updates.workspaceOrders).toEqual([
      { projectKey: "project-a", order: ["srv:ws-1", "srv:ws-2"] },
      { projectKey: "project-b", order: ["srv:ws-3"] },
    ]);
  });

  it("returns no project-order update when persisted order already covers visible keys", () => {
    const projects = [
      sidebarProject({ projectKey: "project-a", workspaceKeys: ["ws-1"] }),
      sidebarProject({ projectKey: "project-b", workspaceKeys: ["ws-2"] }),
    ];

    const updates = computeSidebarOrderUpdates({
      projects,
      persistedProjectOrder: ["project-b", "project-a"],
      getWorkspaceOrder: (projectKey) => (projectKey === "project-a" ? ["srv:ws-1"] : ["srv:ws-2"]),
    });

    expect(updates.projectOrder).toBeNull();
    expect(updates.workspaceOrders).toEqual([]);
  });
});

describe("sortSidebarWorkspaceProjects", () => {
  it("preserves manual order and project identity", () => {
    const projects = [
      {
        ...sidebarProject({ projectKey: "project-1", workspaceKeys: [] }),
        workspaces: [
          workspace({ key: "old", name: "old" }),
          workspace({ key: "new", name: "new" }),
        ],
      },
    ];

    expect(sortSidebarWorkspaceProjects({ projects, sortMode: "manual" })).toBe(projects);
  });

  it("sorts workspaces by created time", () => {
    const [sortedProject] = sortSidebarWorkspaceProjects({
      projects: [
        {
          ...sidebarProject({ projectKey: "project-1", workspaceKeys: [] }),
          workspaces: [
            workspace({ key: "old", name: "old", createdAt: "2026-01-01T00:00:00.000Z" }),
            workspace({ key: "new", name: "new", createdAt: "2026-02-01T00:00:00.000Z" }),
          ],
        },
      ],
      sortMode: "created",
    });

    expect(sortedProject?.workspaces.map((entry) => entry.workspaceId)).toEqual(["new", "old"]);
  });

  it("sorts workspaces by last updated activity", () => {
    const [sortedProject] = sortSidebarWorkspaceProjects({
      projects: [
        {
          ...sidebarProject({ projectKey: "project-1", workspaceKeys: [] }),
          workspaces: [
            workspace({ key: "quiet", name: "quiet", activityAt: "2026-01-01T00:00:00.000Z" }),
            workspace({ key: "active", name: "active", activityAt: "2026-02-01T00:00:00.000Z" }),
          ],
        },
      ],
      sortMode: "lastUpdated",
    });

    expect(sortedProject?.workspaces.map((entry) => entry.workspaceId)).toEqual([
      "active",
      "quiet",
    ]);
  });

  it("sorts status rank before activity", () => {
    const [sortedProject] = sortSidebarWorkspaceProjects({
      projects: [
        {
          ...sidebarProject({ projectKey: "project-1", workspaceKeys: [] }),
          workspaces: [
            workspace({
              key: "running",
              name: "running",
              statusBucket: "running",
              activityAt: "2026-03-01T00:00:00.000Z",
            }),
            workspace({
              key: "needs-input",
              name: "needs input",
              statusBucket: "needs_input",
              activityAt: "2026-01-01T00:00:00.000Z",
            }),
          ],
        },
      ],
      sortMode: "status",
    });

    expect(sortedProject?.workspaces.map((entry) => entry.workspaceId)).toEqual([
      "needs-input",
      "running",
    ]);
  });
});

describe("sortSidebarProjects", () => {
  it("preserves manual order and project identity", () => {
    const projects = [
      {
        ...sidebarProject({ projectKey: "project-a", workspaceKeys: [] }),
        workspaces: [workspace({ key: "a", name: "a" })],
      },
      {
        ...sidebarProject({ projectKey: "project-b", workspaceKeys: [] }),
        workspaces: [workspace({ key: "b", name: "b" })],
      },
    ];

    expect(sortSidebarProjects({ projects, sortMode: "manual" })).toBe(projects);
  });

  it("sorts projects by earliest child workspace creation time", () => {
    const sortedProjects = sortSidebarProjects({
      projects: [
        {
          ...sidebarProject({ projectKey: "old-project", workspaceKeys: [] }),
          projectName: "Old project",
          workspaces: [
            workspace({ key: "old-a", name: "old", createdAt: "2026-01-01T00:00:00.000Z" }),
            workspace({ key: "old-b", name: "old", createdAt: "2026-02-01T00:00:00.000Z" }),
          ],
        },
        {
          ...sidebarProject({ projectKey: "new-project", workspaceKeys: [] }),
          projectName: "New project",
          workspaces: [
            workspace({ key: "new-a", name: "new", createdAt: "2026-03-01T00:00:00.000Z" }),
          ],
        },
      ],
      sortMode: "created",
    });

    expect(sortedProjects.map((entry) => entry.projectKey)).toEqual(["new-project", "old-project"]);
  });

  it("sorts projects by latest child workspace activity", () => {
    const sortedProjects = sortSidebarProjects({
      projects: [
        {
          ...sidebarProject({ projectKey: "quiet-project", workspaceKeys: [] }),
          projectName: "Quiet project",
          workspaces: [
            workspace({
              key: "quiet",
              name: "quiet",
              activityAt: "2026-01-01T00:00:00.000Z",
            }),
          ],
        },
        {
          ...sidebarProject({ projectKey: "active-project", workspaceKeys: [] }),
          projectName: "Active project",
          workspaces: [
            workspace({
              key: "active",
              name: "active",
              activityAt: "2026-02-01T00:00:00.000Z",
            }),
          ],
        },
      ],
      sortMode: "lastUpdated",
    });

    expect(sortedProjects.map((entry) => entry.projectKey)).toEqual([
      "active-project",
      "quiet-project",
    ]);
  });

  it("sorts projects by aggregate status rank before activity", () => {
    const sortedProjects = sortSidebarProjects({
      projects: [
        {
          ...sidebarProject({ projectKey: "running-project", workspaceKeys: [] }),
          projectName: "Running project",
          workspaces: [
            workspace({
              key: "running",
              name: "running",
              statusBucket: "running",
              activityAt: "2026-03-01T00:00:00.000Z",
            }),
          ],
        },
        {
          ...sidebarProject({ projectKey: "attention-project", workspaceKeys: [] }),
          projectName: "Attention project",
          workspaces: [
            workspace({
              key: "attention",
              name: "attention",
              statusBucket: "needs_input",
              activityAt: "2026-01-01T00:00:00.000Z",
            }),
          ],
        },
      ],
      sortMode: "status",
    });

    expect(sortedProjects.map((entry) => entry.projectKey)).toEqual([
      "attention-project",
      "running-project",
    ]);
  });
});

describe("applySidebarShowLastCount", () => {
  it("limits visible items after sorting", () => {
    const result = applySidebarShowLastCount({
      items: [item("a"), item("b"), item("c"), item("d")],
      showLastCount: 3,
      showAll: false,
      forceIncludeKey: null,
      getKey: (entry) => entry.key,
    });

    expect(result).toEqual({
      visibleItems: [item("a"), item("b"), item("c")],
      shouldShowVisibilityToggle: true,
    });
  });

  it("force-shows an active item outside the visible count", () => {
    const result = applySidebarShowLastCount({
      items: [item("a"), item("b"), item("c"), item("d")],
      showLastCount: 3,
      showAll: false,
      forceIncludeKey: "d",
      getKey: (entry) => entry.key,
    });

    expect(result).toEqual({
      visibleItems: [item("a"), item("b"), item("c"), item("d")],
      shouldShowVisibilityToggle: true,
    });
  });

  it("shows all items without a visibility toggle when expanded", () => {
    const result = applySidebarShowLastCount({
      items: [item("a"), item("b"), item("c")],
      showLastCount: 3,
      showAll: true,
      forceIncludeKey: null,
      getKey: (entry) => entry.key,
    });

    expect(result).toEqual({
      visibleItems: [item("a"), item("b"), item("c")],
      shouldShowVisibilityToggle: false,
    });
  });
});

describe("deriveSidebarLoadingState", () => {
  it("reports initial-load while active and unhydrated with no projects", () => {
    expect(
      deriveSidebarLoadingState({
        isActive: true,
        serverId: "srv",
        hasHydratedWorkspaces: false,
        hasProjects: false,
      }),
    ).toEqual({ isLoading: true, isInitialLoad: true, isRevalidating: false });
  });

  it("stays loading but not initial once projects are visible", () => {
    expect(
      deriveSidebarLoadingState({
        isActive: true,
        serverId: "srv",
        hasHydratedWorkspaces: false,
        hasProjects: true,
      }),
    ).toEqual({ isLoading: true, isInitialLoad: false, isRevalidating: false });
  });

  it("clears loading once workspaces have hydrated", () => {
    expect(
      deriveSidebarLoadingState({
        isActive: true,
        serverId: "srv",
        hasHydratedWorkspaces: true,
        hasProjects: true,
      }),
    ).toEqual({ isLoading: false, isInitialLoad: false, isRevalidating: false });
  });

  it("short-circuits to idle when inactive", () => {
    expect(
      deriveSidebarLoadingState({
        isActive: false,
        serverId: "srv",
        hasHydratedWorkspaces: false,
        hasProjects: false,
      }),
    ).toEqual({ isLoading: false, isInitialLoad: false, isRevalidating: false });
  });
});
