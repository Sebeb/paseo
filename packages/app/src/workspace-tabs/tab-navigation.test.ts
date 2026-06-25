import { describe, expect, it } from "vitest";
import { getRelativeTabId, mergeTabNavigationOrder } from "@/workspace-tabs/tab-navigation";

describe("workspace tab navigation order", () => {
  it("merges a sorted order with pane membership before falling back to pane order", () => {
    expect(
      mergeTabNavigationOrder({
        fallbackTabIds: ["one", "two", "three", "four"],
        orderedTabIds: ["three", "outside", "one", "three"],
      }),
    ).toEqual(["three", "one", "two", "four"]);
  });

  it("finds the next relative tab in the provided order", () => {
    expect(
      getRelativeTabId({
        tabIds: ["three", "one", "two"],
        activeTabId: "one",
        delta: 1,
      }),
    ).toBe("two");
  });

  it("finds the previous relative tab in the provided order", () => {
    expect(
      getRelativeTabId({
        tabIds: ["three", "one", "two"],
        activeTabId: "one",
        delta: -1,
      }),
    ).toBe("three");
  });
});
