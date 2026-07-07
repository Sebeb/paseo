import { describe, expect, it } from "vitest";
import {
  applyCommandCenterScopeCycle,
  buildCommandCenterGroups,
  createCommandCenterScopeFromDefaults,
  flattenCommandCenterGroups,
  getActiveCommandCenterSubmenu,
  popCommandCenterSubmenu,
  pushCommandCenterSubmenu,
  sanitizeCommandCenterDefaults,
  type CommandCenterConcreteGroup,
  type CommandCenterSearchableItem,
} from "./model";

const groupTitles: Record<CommandCenterConcreteGroup, string> = {
  actions: "Actions",
  agents: "Agents",
  windows: "Windows",
  workspaces: "Workspaces",
  projects: "Projects",
};

function item(
  input: Partial<CommandCenterSearchableItem> &
    Pick<CommandCenterSearchableItem, "id" | "group" | "title">,
): CommandCenterSearchableItem {
  return {
    statusRank: 4,
    updatedAt: 0,
    isImportant: false,
    ...input,
  };
}

describe("command center model", () => {
  it("shows no-query root groups in fixed order", () => {
    const groups = buildCommandCenterGroups({
      items: [
        item({ id: "project", group: "projects", title: "Paseo" }),
        item({ id: "agent", group: "agents", title: "Agent" }),
        item({ id: "workspace", group: "workspaces", title: "Workspace" }),
        item({ id: "action", group: "actions", title: "Open project" }),
        item({ id: "window", group: "windows", title: "Browser" }),
      ],
      query: "",
      groupFilter: "all",
      scope: { mode: "allProjects" },
      groupTitles,
    });

    expect(groups.map((group) => group.group)).toEqual([
      "actions",
      "agents",
      "windows",
      "workspaces",
      "projects",
    ]);
  });

  it("sorts queried groups by strongest match", () => {
    const groups = buildCommandCenterGroups({
      items: [
        item({ id: "agent", group: "agents", title: "Agent", keywords: ["browser"] }),
        item({ id: "window", group: "windows", title: "Browser" }),
      ],
      query: "browser",
      groupFilter: "all",
      scope: { mode: "allProjects" },
      groupTitles,
    });

    expect(groups.map((group) => group.group)).toEqual(["windows", "agents"]);
  });

  it("keeps at least three no-query rows and promotes important overflow rows", () => {
    const groups = buildCommandCenterGroups({
      items: [
        item({ id: "a", group: "agents", title: "A", statusRank: 4 }),
        item({ id: "b", group: "agents", title: "B", statusRank: 4 }),
        item({ id: "c", group: "agents", title: "C", statusRank: 4 }),
        item({ id: "d", group: "agents", title: "D", statusRank: 4 }),
        item({
          id: "important",
          group: "agents",
          title: "Important",
          statusRank: 0,
          isImportant: true,
        }),
      ],
      query: "",
      groupFilter: "all",
      scope: { mode: "allProjects" },
      groupTitles,
    });

    expect(groups[0]?.items.map((entry) => entry.id)).toContain("important");
    expect(groups[0]?.items.length).toBeGreaterThanOrEqual(3);
  });

  it("caps queried non-final groups and appends a show-all row", () => {
    const groups = buildCommandCenterGroups({
      items: Array.from({ length: 5 }, (_, index) =>
        item({
          id: `agent-${index}`,
          group: "agents",
          title: `Build agent ${index}`,
        }),
      ),
      query: "agent",
      groupFilter: "all",
      scope: { mode: "allProjects" },
      groupTitles,
      includeShowAllRows: true,
      createShowAllItem: (group) =>
        item({
          id: `show-all:${group}`,
          group,
          title: "Show all",
          showAllForGroup: group,
        }),
    });

    expect(groups[0]?.items).toHaveLength(4);
    expect(groups[0]?.items.at(-1)?.showAllForGroup).toBe("agents");
  });

  it("filters windows and agents by specific workspace or project scope", () => {
    const items = [
      item({
        id: "agent-a",
        group: "agents",
        title: "Agent A",
        workspaceKey: "s:w1",
        projectKey: "p1",
      }),
      item({
        id: "window-b",
        group: "windows",
        title: "Browser B",
        workspaceKey: "s:w2",
        projectKey: "p2",
      }),
      item({ id: "project", group: "projects", title: "Project" }),
    ];

    const workspaceScoped = flattenCommandCenterGroups(
      buildCommandCenterGroups({
        items,
        query: "",
        groupFilter: "all",
        scope: { mode: "workspace", workspaceKey: "s:w1" },
        groupTitles,
      }),
    );
    const projectScoped = flattenCommandCenterGroups(
      buildCommandCenterGroups({
        items,
        query: "",
        groupFilter: "all",
        scope: { mode: "project", projectKey: "p2" },
        groupTitles,
      }),
    );

    expect(workspaceScoped.map((entry) => entry.id)).toEqual(["agent-a", "project"]);
    expect(projectScoped.map((entry) => entry.id)).toEqual(["window-b", "project"]);
  });

  it("cycles scope modes left-to-right and clears specific identities", () => {
    expect(
      applyCommandCenterScopeCycle({
        mode: "workspace",
        workspaceKey: "server:workspace",
        workspaceLabel: "Workspace",
      }),
    ).toEqual({ mode: "project" });
    expect(applyCommandCenterScopeCycle({ mode: "project" })).toEqual({ mode: "allProjects" });
    expect(applyCommandCenterScopeCycle({ mode: "allProjects" })).toEqual({ mode: "workspace" });
  });

  it("saves only the group and generic scope mode as defaults", () => {
    const defaults = sanitizeCommandCenterDefaults({
      group: "projects",
      scope: { mode: "workspace", workspaceKey: "server:workspace", workspaceLabel: "Workspace" },
    });

    expect(defaults).toEqual({ group: "projects", scopeMode: "workspace" });
    expect(createCommandCenterScopeFromDefaults(defaults)).toEqual({ mode: "workspace" });
  });

  it("pushes and pops submenu descriptors", () => {
    const state = pushCommandCenterSubmenu(
      { stack: [] },
      {
        id: "history:back",
        title: "Back",
        icon: "arrow-left",
        placeholder: "Search back",
      },
    );

    expect(getActiveCommandCenterSubmenu(state)?.title).toBe("Back");
    expect(getActiveCommandCenterSubmenu(popCommandCenterSubmenu(state))).toBeNull();
  });
});
