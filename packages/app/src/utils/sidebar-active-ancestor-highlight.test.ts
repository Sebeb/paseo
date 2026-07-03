import { describe, expect, it } from "vitest";
import {
  getProjectAncestorHighlighted,
  getWorkspaceAncestorHighlighted,
} from "./sidebar-active-ancestor-highlight";

describe("sidebar active ancestor highlighting", () => {
  it("highlights the project row when one of its workspaces is active", () => {
    expect(getProjectAncestorHighlighted(true)).toBe("active");
    expect(getProjectAncestorHighlighted(false)).toBe("idle");
  });

  it("uses the ancestor state for selected workspaces when embedded tabs are enabled", () => {
    expect(
      getWorkspaceAncestorHighlighted({
        selected: true,
        embeddedTabsEnabled: true,
      }),
    ).toBe("active");
  });

  it("keeps direct workspace selection stronger when embedded tabs are disabled", () => {
    expect(
      getWorkspaceAncestorHighlighted({
        selected: true,
        embeddedTabsEnabled: false,
      }),
    ).toBe("selected");
  });

  it("does not highlight inactive workspaces in either tab layout", () => {
    expect(
      getWorkspaceAncestorHighlighted({
        selected: false,
        embeddedTabsEnabled: true,
      }),
    ).toBe("idle");
    expect(
      getWorkspaceAncestorHighlighted({
        selected: false,
        embeddedTabsEnabled: false,
      }),
    ).toBe("idle");
  });
});
