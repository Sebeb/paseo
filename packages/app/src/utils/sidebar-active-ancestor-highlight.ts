export type SidebarRowHighlightState = "idle" | "active" | "selected";

export function getProjectAncestorHighlighted(active: boolean): SidebarRowHighlightState {
  return active ? "active" : "idle";
}

export function getWorkspaceAncestorHighlighted(input: {
  selected: boolean;
  embeddedTabsEnabled: boolean;
}): SidebarRowHighlightState {
  if (!input.selected) {
    return "idle";
  }
  return input.embeddedTabsEnabled ? "active" : "selected";
}
