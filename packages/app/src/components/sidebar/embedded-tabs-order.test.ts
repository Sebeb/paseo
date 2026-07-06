import { describe, expect, it } from "vitest";
import {
  mergeEmbeddedVisibleTabOrder,
  type EmbeddedTabOrderItem,
} from "@/components/sidebar/embedded-tabs-order";

function item(tabId: string, mainPane = true): EmbeddedTabOrderItem {
  return {
    mainPane,
    tab: { tabId },
  };
}

describe("mergeEmbeddedVisibleTabOrder", () => {
  it("reorders visible main-pane tabs while preserving hidden tab positions", () => {
    expect(
      mergeEmbeddedVisibleTabOrder({
        mainPaneItems: [item("one"), item("two"), item("three"), item("four")],
        nextVisibleItems: [item("three"), item("one")],
      }),
    ).toEqual(["three", "two", "one", "four"]);
  });

  it("ignores secondary-pane items when deriving the main-pane order", () => {
    expect(
      mergeEmbeddedVisibleTabOrder({
        mainPaneItems: [item("one"), item("two"), item("three")],
        nextVisibleItems: [item("secondary", false), item("three"), item("one")],
      }),
    ).toEqual(["three", "two", "one"]);
  });
});
