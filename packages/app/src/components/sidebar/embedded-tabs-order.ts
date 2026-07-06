export interface EmbeddedTabOrderItem {
  mainPane: boolean;
  tab: {
    tabId: string;
  };
}

export function mergeEmbeddedVisibleTabOrder(input: {
  mainPaneItems: readonly EmbeddedTabOrderItem[];
  nextVisibleItems: readonly EmbeddedTabOrderItem[];
}): string[] {
  const reorderedVisibleIds = input.nextVisibleItems
    .filter((item) => item.mainPane)
    .map((item) => item.tab.tabId);
  const visibleIds = new Set(reorderedVisibleIds);
  let visibleIndex = 0;

  return input.mainPaneItems.map((item) => {
    if (!visibleIds.has(item.tab.tabId)) {
      return item.tab.tabId;
    }
    const nextId = reorderedVisibleIds[visibleIndex] ?? item.tab.tabId;
    visibleIndex += 1;
    return nextId;
  });
}
