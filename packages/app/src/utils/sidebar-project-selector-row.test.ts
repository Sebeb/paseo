import { describe, expect, it } from "vitest";
import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";
import {
  getProjectStatusCountsFromStatuses,
  orderProjectSelectorRowProjects,
  resolveProjectSelectorRowProject,
} from "@/utils/sidebar-project-selector-row";

function project(projectKey: string, workspaceIds: string[]): SidebarProjectEntry {
  return {
    projectKey,
    projectName: projectKey,
    projectKind: "git",
    iconWorkingDir: `/tmp/${projectKey}`,
    hosts: [],
    workspaces: workspaceIds.map((workspaceId) => ({
      workspaceKey: `srv:${workspaceId}`,
      serverId: "srv",
      workspaceId,
      projectKey,
      projectName: projectKey,
      projectKind: "git",
      workspaceKind: "worktree",
      name: workspaceId,
    })) as SidebarProjectEntry["workspaces"],
  } as unknown as SidebarProjectEntry;
}

describe("project selector row helpers", () => {
  it("uses the stored project when available so capsule clicks can switch project visibility", () => {
    const projects = [project("active-project", ["active-ws"]), project("manual-project", ["ws"])];

    expect(
      resolveProjectSelectorRowProject({
        projects,
        activeWorkspaceSelection: { serverId: "srv", workspaceId: "active-ws" },
        storedProjectKey: "manual-project",
      })?.projectKey,
    ).toBe("manual-project");
  });

  it("falls back to the active workspace project and then the first project", () => {
    const projects = [project("first", ["one"]), project("active", ["two"])];

    expect(
      resolveProjectSelectorRowProject({
        projects,
        activeWorkspaceSelection: { serverId: "srv", workspaceId: "two" },
        storedProjectKey: null,
      })?.projectKey,
    ).toBe("active");

    expect(
      resolveProjectSelectorRowProject({
        projects,
        activeWorkspaceSelection: null,
        storedProjectKey: null,
      })?.projectKey,
    ).toBe("first");
  });

  it("moves the selected project to the front without duplicating it", () => {
    const projects = [project("a", []), project("b", []), project("c", [])];

    expect(
      orderProjectSelectorRowProjects({ projects, selectedProjectKey: "b" }).map(
        (entry) => entry.projectKey,
      ),
    ).toEqual(["b", "a", "c"]);
  });

  it("counts only actionable capsule statuses", () => {
    const counts = getProjectStatusCountsFromStatuses({
      workspaceKeys: ["a", "b", "c", "d", "e"],
      statusByWorkspaceKey: new Map([
        ["a", "attention"],
        ["b", "needs_input"],
        ["c", "failed"],
        ["d", "running"],
        ["e", "done"],
      ]),
    });

    expect(counts).toEqual({ attention: 1, needsInput: 1, failed: 1 });
  });
});
