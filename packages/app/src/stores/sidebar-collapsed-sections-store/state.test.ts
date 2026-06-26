import { describe, expect, it } from "vitest";
import {
  type CollapsedProjectsState,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setOnlyProjectExpanded,
  setOnlyWorkspaceExpanded,
  setProjectCollapsed,
  setWorkspaceCollapsed,
  setWorkspacesCollapsed,
  toggleParentTabExpanded,
  toggleProjectCollapsed,
  toggleStatusGroupCollapsed,
  toggleWorkspaceCollapsed,
} from "@/stores/sidebar-collapsed-sections-store/state";

function emptyState(): CollapsedProjectsState {
  return {
    collapsedProjectKeys: new Set(),
    collapsedStatusGroupKeys: new Set(),
    collapsedWorkspaceKeys: new Set(),
    expandedParentTabKeys: new Set(),
  };
}

describe("sidebar collapsed projects transitions", () => {
  it("tracks collapsed project keys as a Set", () => {
    let state = emptyState();

    state = setProjectCollapsed(state, "project-a", true);
    state = toggleProjectCollapsed(state, "project-b");
    state = toggleProjectCollapsed(state, "project-a");
    state = toggleStatusGroupCollapsed(state, "running");
    state = toggleWorkspaceCollapsed(state, "workspace-a");
    state = toggleParentTabExpanded(state, "workspace-a:agent-parent");

    expect(Array.from(state.collapsedProjectKeys)).toEqual(["project-b"]);
    expect(Array.from(state.collapsedStatusGroupKeys)).toEqual(["running"]);
    expect(Array.from(state.collapsedWorkspaceKeys)).toEqual(["workspace-a"]);
    expect(Array.from(state.expandedParentTabKeys)).toEqual(["workspace-a:agent-parent"]);
  });

  it("serializes collapsed project keys for preference storage", () => {
    const state: CollapsedProjectsState = {
      collapsedProjectKeys: new Set(["project-a", "project-b"]),
      collapsedStatusGroupKeys: new Set(["running"]),
      collapsedWorkspaceKeys: new Set(["workspace-a"]),
      expandedParentTabKeys: new Set(["workspace-a:agent-parent"]),
    };

    expect(serializeCollapsedProjects(state)).toEqual({
      collapsedProjectKeys: ["project-a", "project-b"],
      collapsedStatusGroupKeys: ["running"],
      collapsedWorkspaceKeys: ["workspace-a"],
      expandedParentTabKeys: ["workspace-a:agent-parent"],
    });
  });

  it("restores collapsed project keys from persisted preferences", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a", "project-b", 42] },
      emptyState(),
    );

    expect(Array.from(restored.collapsedProjectKeys)).toEqual(["project-a", "project-b"]);
    expect(Array.from(restored.collapsedStatusGroupKeys)).toEqual([]);
    expect(Array.from(restored.collapsedWorkspaceKeys)).toEqual([]);
    expect(Array.from(restored.expandedParentTabKeys)).toEqual([]);
  });

  it("restores collapsed workspace keys from persisted preferences", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedWorkspaceKeys: ["workspace-a", 42, "workspace-b"] },
      emptyState(),
    );

    expect(Array.from(restored.collapsedProjectKeys)).toEqual([]);
    expect(Array.from(restored.collapsedStatusGroupKeys)).toEqual([]);
    expect(Array.from(restored.collapsedWorkspaceKeys)).toEqual(["workspace-a", "workspace-b"]);
    expect(Array.from(restored.expandedParentTabKeys)).toEqual([]);
  });

  it("restores expanded parent tab keys from persisted preferences", () => {
    const restored = mergePersistedCollapsedProjects(
      { expandedParentTabKeys: ["workspace-a:agent-parent", 42, "workspace-a:agent-other"] },
      emptyState(),
    );

    expect(Array.from(restored.expandedParentTabKeys)).toEqual([
      "workspace-a:agent-parent",
      "workspace-a:agent-other",
    ]);
  });

  it("sets one or more workspace collapsed states", () => {
    let state = emptyState();

    state = setWorkspacesCollapsed(state, ["workspace-a", "workspace-b"], true);
    state = setWorkspaceCollapsed(state, "workspace-c", true);
    state = setWorkspacesCollapsed(state, ["workspace-a", "workspace-c"], false);

    expect(Array.from(state.collapsedWorkspaceKeys)).toEqual(["workspace-b"]);
  });

  it("expands one scoped workspace and collapses the others", () => {
    const state: CollapsedProjectsState = {
      ...emptyState(),
      collapsedWorkspaceKeys: new Set(["workspace-a", "workspace-z"]),
    };

    const next = setOnlyWorkspaceExpanded(state, "workspace-a", [
      "workspace-a",
      "workspace-b",
      "workspace-c",
    ]);

    expect(Array.from(next.collapsedWorkspaceKeys)).toEqual([
      "workspace-z",
      "workspace-b",
      "workspace-c",
    ]);
  });

  it("expands one scoped project and collapses the others", () => {
    const state: CollapsedProjectsState = {
      ...emptyState(),
      collapsedProjectKeys: new Set(["project-a", "project-z"]),
    };

    const next = setOnlyProjectExpanded(state, "project-a", [
      "project-a",
      "project-b",
      "project-c",
    ]);

    expect(Array.from(next.collapsedProjectKeys)).toEqual(["project-z", "project-b", "project-c"]);
  });

  it("keeps the existing state object when persisted preferences do not change collapsed keys", () => {
    const currentState = emptyState();

    expect(mergePersistedCollapsedProjects(undefined, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({}, currentState)).toBe(currentState);
    expect(
      mergePersistedCollapsedProjects(
        {
          collapsedProjectKeys: [],
          collapsedStatusGroupKeys: [],
          collapsedWorkspaceKeys: [],
          expandedParentTabKeys: [],
        },
        currentState,
      ),
    ).toBe(currentState);
  });
});
