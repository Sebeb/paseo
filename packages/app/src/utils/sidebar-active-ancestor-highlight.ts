export function getProjectAncestorHighlighted(active: boolean): boolean {
  return active;
}

export function getWorkspaceAncestorHighlighted(input: {
  selected: boolean;
  embeddedTabsEnabled: boolean;
}): boolean {
  return input.selected;
}
