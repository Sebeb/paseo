export function mergeTabNavigationOrder(input: {
  fallbackTabIds: readonly string[];
  orderedTabIds?: readonly string[] | null;
}): string[] {
  if (!input.orderedTabIds || input.orderedTabIds.length === 0) {
    return input.fallbackTabIds.slice();
  }

  const fallbackIds = new Set(input.fallbackTabIds);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const tabId of input.orderedTabIds) {
    if (!fallbackIds.has(tabId) || seen.has(tabId)) {
      continue;
    }
    seen.add(tabId);
    merged.push(tabId);
  }
  for (const tabId of input.fallbackTabIds) {
    if (seen.has(tabId)) {
      continue;
    }
    seen.add(tabId);
    merged.push(tabId);
  }
  return merged;
}

export function getRelativeTabId(input: {
  tabIds: readonly string[];
  activeTabId: string | null;
  delta: 1 | -1;
}): string | null {
  if (input.tabIds.length === 0) {
    return null;
  }

  const currentIndex = input.activeTabId ? input.tabIds.indexOf(input.activeTabId) : -1;
  const fromIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (fromIndex + input.delta + input.tabIds.length) % input.tabIds.length;
  return input.tabIds[nextIndex] ?? null;
}
