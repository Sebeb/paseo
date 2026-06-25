import { describe, expect, it } from "vitest";
import {
  getProjectAncestorHighlighted,
  getWorkspaceAncestorHighlighted,
} from "./sidebar-active-ancestor-highlight";

describe("sidebar active ancestor highlighting", () => {
  it("highlights the project row when one of its workspaces is active", () => {
    expect(getProjectAncestorHighlighted(true)).toBe(true);
    expect(getProjectAncestorHighlighted(false)).toBe(false);
  });

  it("keeps the active workspace highlighted when embedded tabs are enabled", () => {
    expect(
      getWorkspaceAncestorHighlighted({
        selected: true,
        embeddedTabsEnabled: true,
      }),
    ).toBe(true);
  });

  it("does not highlight inactive workspaces in either tab layout", () => {
    expect(
      getWorkspaceAncestorHighlighted({
        selected: false,
        embeddedTabsEnabled: true,
      }),
    ).toBe(false);
    expect(
      getWorkspaceAncestorHighlighted({
        selected: false,
        embeddedTabsEnabled: false,
      }),
    ).toBe(false);
  });
});
