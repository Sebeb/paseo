import { describe, expect, it } from "vitest";
import {
  appendWorkspaceNavigationHistoryEntry,
  findWorkspaceNavigationHistoryIndex,
  getWorkspaceNavigationHistoryItems,
  initialWorkspaceNavigationHistoryCoreState,
  pruneInvalidWorkspaceNavigationHistoryEntries,
  setWorkspaceNavigationHistoryIndex,
  type WorkspaceNavigationHistoryCoreState,
  type WorkspaceNavigationHistoryEntry,
} from "./state";

function entry(input: {
  workspaceId: string;
  projectId?: string;
  paneId?: string;
  tabId?: string;
  timestamp?: number;
}): WorkspaceNavigationHistoryEntry {
  return {
    serverId: "server-1",
    workspaceId: input.workspaceId,
    projectId: input.projectId ?? "project-a",
    paneId: input.paneId ?? "main",
    tabId: input.tabId ?? `tab-${input.workspaceId}`,
    timestamp: input.timestamp ?? 1,
  };
}

function appendMany(
  entries: WorkspaceNavigationHistoryEntry[],
): WorkspaceNavigationHistoryCoreState {
  return entries.reduce(
    (state, next) => appendWorkspaceNavigationHistoryEntry(state, next),
    initialWorkspaceNavigationHistoryCoreState,
  );
}

const VALID = () => true;

describe("workspace navigation history state", () => {
  it("appends entries and points currentIndex at the latest entry", () => {
    const state = appendMany([
      entry({ workspaceId: "one", tabId: "a" }),
      entry({ workspaceId: "one", tabId: "b" }),
    ]);

    expect(state.entries.map((item) => item.tabId)).toEqual(["a", "b"]);
    expect(state.currentIndex).toBe(1);
  });

  it("updates the timestamp instead of appending consecutive duplicates", () => {
    const state = appendMany([
      entry({ workspaceId: "one", tabId: "a", timestamp: 1 }),
      entry({ workspaceId: "one", tabId: "a", timestamp: 2 }),
    ]);

    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]?.timestamp).toBe(2);
    expect(state.currentIndex).toBe(0);
  });

  it("removes earlier non-consecutive duplicates when appending a window again", () => {
    const state = appendMany([
      entry({ workspaceId: "one", tabId: "a" }),
      entry({ workspaceId: "one", tabId: "b" }),
      entry({ workspaceId: "one", tabId: "a", timestamp: 3 }),
    ]);

    expect(state.entries.map((item) => item.tabId)).toEqual(["b", "a"]);
    expect(state.entries[1]?.timestamp).toBe(3);
    expect(state.currentIndex).toBe(1);
  });

  it("removes duplicate retained history before appending after going back", () => {
    const initial = appendMany([
      entry({ workspaceId: "one", tabId: "a" }),
      entry({ workspaceId: "one", tabId: "b" }),
      entry({ workspaceId: "one", tabId: "c" }),
    ]);
    const wentBack = setWorkspaceNavigationHistoryIndex(initial, 1);
    const state = appendWorkspaceNavigationHistoryEntry(
      wentBack,
      entry({ workspaceId: "one", tabId: "a", timestamp: 4 }),
    );

    expect(state.entries.map((item) => item.tabId)).toEqual(["b", "a"]);
    expect(state.entries[1]?.timestamp).toBe(4);
    expect(state.currentIndex).toBe(1);
  });

  it("removes older duplicates when refreshing the current entry", () => {
    const duplicate = entry({ workspaceId: "one", tabId: "a", timestamp: 1 });
    const state = appendWorkspaceNavigationHistoryEntry(
      {
        entries: [
          duplicate,
          entry({ workspaceId: "one", tabId: "b" }),
          { ...duplicate, timestamp: 2 },
          entry({ workspaceId: "one", tabId: "c" }),
        ],
        currentIndex: 2,
      },
      entry({ workspaceId: "one", tabId: "a", timestamp: 5 }),
    );

    expect(state.entries.map((item) => item.tabId)).toEqual(["b", "a", "c"]);
    expect(state.entries[1]?.timestamp).toBe(5);
    expect(state.currentIndex).toBe(1);
  });

  it("truncates forward history when a new entry is added after going back", () => {
    const initial = appendMany([
      entry({ workspaceId: "one", tabId: "a" }),
      entry({ workspaceId: "one", tabId: "b" }),
      entry({ workspaceId: "one", tabId: "c" }),
    ]);
    const wentBack = setWorkspaceNavigationHistoryIndex(initial, 1);
    const state = appendWorkspaceNavigationHistoryEntry(
      wentBack,
      entry({ workspaceId: "one", tabId: "d" }),
    );

    expect(state.entries.map((item) => item.tabId)).toEqual(["a", "b", "d"]);
    expect(state.currentIndex).toBe(2);
  });

  it("finds previous and next entries within the active project in project grouping mode", () => {
    const state = appendMany([
      entry({ workspaceId: "one", projectId: "project-a", tabId: "a" }),
      entry({ workspaceId: "two", projectId: "project-b", tabId: "b" }),
      entry({ workspaceId: "three", projectId: "project-a", tabId: "c" }),
    ]);

    expect(
      findWorkspaceNavigationHistoryIndex({
        entries: state.entries,
        currentIndex: state.currentIndex,
        direction: "back",
        scope: { serverId: "server-1", projectId: "project-a", groupMode: "project" },
        isValidEntry: VALID,
      }),
    ).toBe(0);
  });

  it("finds previous and next entries across projects in status grouping mode", () => {
    const state = appendMany([
      entry({ workspaceId: "one", projectId: "project-a", tabId: "a" }),
      entry({ workspaceId: "two", projectId: "project-b", tabId: "b" }),
      entry({ workspaceId: "three", projectId: "project-a", tabId: "c" }),
    ]);

    expect(
      findWorkspaceNavigationHistoryIndex({
        entries: state.entries,
        currentIndex: state.currentIndex,
        direction: "back",
        scope: { serverId: "server-1", projectId: "project-a", groupMode: "status" },
        isValidEntry: VALID,
      }),
    ).toBe(1);
  });

  it("returns dropdown items in navigation order for each direction", () => {
    const state = appendMany([
      entry({ workspaceId: "one", tabId: "a" }),
      entry({ workspaceId: "one", tabId: "b" }),
      entry({ workspaceId: "one", tabId: "c" }),
    ]);
    const current = setWorkspaceNavigationHistoryIndex(state, 1);

    expect(
      getWorkspaceNavigationHistoryItems({
        entries: current.entries,
        currentIndex: current.currentIndex,
        direction: "back",
        scope: { serverId: "server-1", projectId: "project-a", groupMode: "project" },
        isValidEntry: VALID,
      }).map((item) => item.entry.tabId),
    ).toEqual(["a"]);
    expect(
      getWorkspaceNavigationHistoryItems({
        entries: current.entries,
        currentIndex: current.currentIndex,
        direction: "forward",
        scope: { serverId: "server-1", projectId: "project-a", groupMode: "project" },
        isValidEntry: VALID,
      }).map((item) => item.entry.tabId),
    ).toEqual(["c"]);
  });

  it("skips and prunes invalid entries", () => {
    const state = appendMany([
      entry({ workspaceId: "one", tabId: "valid-a" }),
      entry({ workspaceId: "one", tabId: "invalid" }),
      entry({ workspaceId: "one", tabId: "valid-b" }),
    ]);
    const pruned = pruneInvalidWorkspaceNavigationHistoryEntries(state, {
      isValidEntry: (candidate) => candidate.tabId !== "invalid",
    });

    expect(pruned.entries.map((item) => item.tabId)).toEqual(["valid-a", "valid-b"]);
    expect(pruned.currentIndex).toBe(1);
  });
});
